import { randomBytes } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cmsPageBuilderTranslateResponseSchema,
  cmsPageBuilderTranslationCapabilitySchema,
} from '@endora-commerce/contracts';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import {
  ScriptedTranslator,
  putSettingValue,
  resetTranslationSettings,
  seedTranslationSettings,
} from '../../helpers/cms-translation.js';

/**
 * Feature 151 — `contracts/page-builder-translation-api.md`: the capability,
 * the translate route's guarantees G1–G7, its refusals, and the selection
 * scope. The model is `ScriptedTranslator` behind `cmsTranslationLlmFetch`; no
 * request leaves the process.
 */

const ADMIN = { b2b_session: 'stub-admin-session' };
const CONTENT_MANAGER = { b2b_session: 'stub-content-manager-session' };
const CAPABILITY = '/api/v1/admin/cms/page-builder/translation';
const TRANSLATE = '/api/v1/admin/cms/page-builder/translate';

const LINK = { type: 'link', attrs: { href: 'https://shop.example/promo', target: '_blank' } };
const BOLD = { type: 'bold' };
const tiptap = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: { textAlign: 'left' },
      content: [
        { type: 'text', text: 'Kup ' },
        { type: 'text', text: 'teraz', marks: [BOLD] },
        { type: 'text', text: ' w ' },
        { type: 'text', text: 'promocji', marks: [LINK] },
        { type: 'text', text: ', {{customer.firstName}}!' },
      ],
    },
  ],
};

/** A canvas holding every CMS-context block with text, plus an undeclared one. */
function canvas() {
  return {
    root: { props: { title: 'Strona' } },
    content: [
      { type: 'cms.Heading', props: { id: 'heading', text: 'Witaj w sklepie', level: 2, editorName: 'Nagłówek główny' } },
      { type: 'cms.Text', props: { id: 'text', text: 'Zwykły tekst', tiptapContent: tiptap, html: '<p>stale</p>' } },
      { type: 'cms.RichContent', props: { id: 'rich', content: tiptap, html: '<p>stale</p>' } },
      { type: 'cms.Button', props: { id: 'button', label: 'Zamów', href: '/zamow', variant: 'primary' } },
      { type: 'cms.Image', props: { id: 'image', src: 'https://cdn.example/a.png', alt: 'Opis obrazka' } },
      {
        type: 'cms.Row',
        props: {
          id: 'row',
          content: [
            {
              type: 'cms.Column',
              props: {
                id: 'column',
                content: [
                  { type: 'cms.Hero', props: { id: 'hero', heading: 'Nagłówek baneru', subtitle: 'Podtytuł', buttonLabel: 'Sprawdź', buttonHref: '/x' } },
                  { type: 'acme.Widget', props: { id: 'widget', caption: 'Nie tłumacz' } },
                ],
              },
            },
          ],
        },
      },
      {
        type: 'cms.Accordion',
        props: { id: 'accordion', items: [{ title: 'Pytanie', content: '<p>Odpowiedź <a href="/faq">tutaj</a></p>' }] },
      },
      { type: 'cms.Testimonial', props: { id: 'quote', quote: 'Świetny sklep', author: 'Anna', role: 'Klientka' } },
      { type: 'cms.InsertBlock', props: { id: 'embed', code: 'footer-links' } },
      { type: 'catalog.ProductCard', props: { id: 'card', productSlug: 'sruba-m8', ctaLabel: 'Do koszyka' } },
    ],
  };
}

function body(extra: Record<string, unknown> = {}) {
  return { targetLanguage: 'en-US', sourceLanguage: null, context: 'cms', data: canvas(), ...extra };
}

/** Every string leaf, keyed by its path. */
function stringLeaves(value: unknown, path = '$', out = new Map<string, string>()): Map<string, string> {
  if (typeof value === 'string') out.set(path, value);
  else if (Array.isArray(value)) value.forEach((v, i) => stringLeaves(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) stringLeaves(v, `${path}.${k}`, out);
  }
  return out;
}

describe('Page Builder translation API (feature 151)', () => {
  let h: BackendServerHandle;
  const model = new ScriptedTranslator();

  beforeAll(async () => {
    process.env['SETTINGS_SECRET_ENCRYPTION_KEY'] = randomBytes(32).toString('base64');
    h = await setupBackendServer({ registrations: { cmsTranslationLlmFetch: model.fetch } });
  }, 120_000);

  afterAll(async () => {
    await resetTranslationSettings(h);
    await teardownBackendServer(h);
    delete process.env['SETTINGS_SECRET_ENCRYPTION_KEY'];
  });

  beforeEach(() => {
    model.requests.length = 0;
    model.answer = { kind: 'echo' };
  });

  const capability = async (cookies = ADMIN) => h.app.inject({ method: 'GET', url: CAPABILITY, cookies });
  const translate = async (payload: unknown, cookies = ADMIN) =>
    h.app.inject({ method: 'POST', url: TRANSLATE, cookies, payload: payload as Record<string, unknown> });

  describe('capability', () => {
    it('401 without a session, 403 without cms.translate', async () => {
      expect((await h.app.inject({ method: 'GET', url: CAPABILITY })).statusCode).toBe(401);
      expect((await capability(CONTENT_MANAGER)).statusCode).toBe(403);
      expect((await translate(body(), CONTENT_MANAGER)).statusCode).toBe(403);
    });

    it('is disabled by default and ready once configured, with no secret on the wire', async () => {
      await resetTranslationSettings(h);
      const off = await capability();
      expect(off.statusCode).toBe(200);
      expect(off.json().data).toEqual({ status: 'disabled', maxCharacters: 40000 });

      await seedTranslationSettings(h, { provider: null });
      expect((await capability()).json().data.status).toBe('not_configured');

      await seedTranslationSettings(h, { provider: 'openai_compatible', baseUrl: 'https://llm.example/v1', model: 'deepseek-chat' });
      const ready = await capability();
      expect(cmsPageBuilderTranslationCapabilitySchema.parse(ready.json().data)).toEqual({
        status: 'ready',
        provider: 'openai_compatible',
        model: 'deepseek-chat',
        maxCharacters: 40000,
      });
      expect(ready.body).not.toMatch(/sk-translation-secret|cms-translation-test-llm|llm\.example/);
    });

    it('honours a changed size limit and refuses one outside its bounds', async () => {
      await seedTranslationSettings(h, { maxSourceCharacters: 1500 });
      expect((await capability()).json().data.maxCharacters).toBe(1500);
      for (const bad of [999, 200001, 1.5]) {
        const r = await putSettingValue(h, 'cms.page_builder.translation.max_source_characters', bad);
        expect(r.statusCode, String(bad)).toBe(422);
      }
      expect((await capability()).json().data.maxCharacters).toBe(1500);
    });
  });

  describe('translate', () => {
    beforeAll(async () => {
      await seedTranslationSettings(h);
    });

    it('translates every declared text and nothing else (G1, G3, G4, G5, G6)', async () => {
      const r = await translate(body({ resource: { type: 'cms_page', id: null } }));
      expect(r.statusCode).toBe(200);
      const { data, report } = cmsPageBuilderTranslateResponseSchema.parse(r.json().data);
      expect(model.requests[0]!.url).toBe('https://api.openai.com/v1/chat/completions');
      expect(model.requests[0]!.body['tool_choice']).toEqual({ type: 'function', function: { name: 'cms__submit_translations' } });

      const before = stringLeaves(canvas());
      const after = stringLeaves(data);
      expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
      const changed = [...before].filter(([path, value]) => after.get(path) !== value).map(([path]) => path);
      // G1/G5 — only declared prose moved; the undeclared block, ids, links, codes and editor names did not.
      for (const path of changed) {
        expect(path).not.toMatch(/acme|\.id$|href|editorName|\.code$|productSlug|\.src$|^\$\.root|\.html$|\.type$/);
      }
      expect(after.get('$.content[0].props.text')).toBe('[en] Witaj w sklepie');
      expect(after.get('$.content[3].props.label')).toBe('[en] Zamów');
      expect(after.get('$.content[9].props.ctaLabel')).toBe('[en] Do koszyka');
      expect(after.get('$.content[6].props.items[0].content')).toBe('[en] <p>Odpowiedź <a href="/faq">tutaj</a></p>');

      // G3/G4 — marks, link target and placeholder survive in rich text.
      const paragraph = (data.content[2] as { props: { content: typeof tiptap } }).props.content.content[0]!;
      expect(paragraph.attrs).toEqual({ textAlign: 'left' });
      expect(paragraph.content.find((n) => n.marks?.[0] === LINK || JSON.stringify(n.marks) === JSON.stringify([LINK]))).toBeTruthy();
      expect(paragraph.content.map((n) => n.text).join('')).toBe('[en] Kup teraz w promocji, {{customer.firstName}}!');

      // G6 — shape.
      expect((data as { root: unknown }).root).toEqual(canvas().root);
      expect(report.untranslatableBlocks).toEqual([{ name: 'acme.Widget', count: 1 }]);
      expect(report.provider).toBe('openai');
      expect(model.sentTexts().join('\n')).not.toMatch(/shop\.example|\/faq|Nagłówek główny|Nie tłumacz|footer-links/);
    });

    it('sends nothing for a canvas without prose (G2)', async () => {
      const r = await translate(body({ data: { root: { props: {} }, content: [{ type: 'cms.Spacer', props: { id: 's' } }] } }));
      expect(r.statusCode).toBe(200);
      expect(r.json().data.report.characters).toBe(0);
      expect(model.requests).toHaveLength(0);
    });

    it('refuses content above the configured limit before sending, naming the limit', async () => {
      await seedTranslationSettings(h, { maxSourceCharacters: 1000 });
      const big = { root: { props: {} }, content: [{ type: 'cms.Heading', props: { id: 'h', text: 'Słowo '.repeat(300) } }] };
      for (const language of ['en', 'pl']) {
        const r = await h.app.inject({
          method: 'POST',
          url: TRANSLATE,
          cookies: ADMIN,
          headers: { 'accept-language': language },
          payload: body({ data: big }),
        });
        expect(r.statusCode).toBe(413);
        expect(r.json().error).toMatchObject({ code: 'CMS_TRANSLATION_TOO_LARGE', details: { limit: 1000 } });
        expect(r.json().error.message).toContain('1000');
      }
      expect(model.requests).toHaveLength(0);
      await seedTranslationSettings(h);
    });

    it.each([
      [401, 'credentials_rejected'],
      [429, 'rate_limited'],
      [503, 'unavailable'],
    ])('maps a provider HTTP %d to 502 %s with a translated sentence', async (status, token) => {
      model.answer = { kind: 'http', status };
      const r = await translate(body());
      expect(r.statusCode).toBe(502);
      expect(r.json().error).toMatchObject({ code: 'CMS_TRANSLATION_PROVIDER_FAILED', details: { code: token } });
      expect(r.json().error.message).not.toBe('The translation model could not complete the translation.');
    });

    it('answers 502 malformed when the model returns no usable answer', async () => {
      model.answer = { kind: 'garbage' };
      const r = await translate(body());
      expect(r.json().error).toMatchObject({ details: { code: 'malformed' } });
    });

    it('refuses a source equal to the target', async () => {
      expect((await translate(body({ sourceLanguage: 'en-US' }))).statusCode).toBe(400);
    });

    it('answers 409 when switched off', async () => {
      await seedTranslationSettings(h, { enabled: false });
      const r = await translate(body());
      expect(r.statusCode).toBe(409);
      expect(r.json().error.code).toBe('CMS_TRANSLATION_DISABLED');
      await seedTranslationSettings(h);
    });
  });

  describe('selection scope (research R22, G7)', () => {
    beforeAll(async () => {
      await seedTranslationSettings(h);
    });

    const changedPaths = (data: unknown) => {
      const before = stringLeaves(canvas());
      const after = stringLeaves(data);
      return [...before].filter(([path, value]) => after.get(path) !== value).map(([path]) => path);
    };

    it('no selection translates the whole canvas', async () => {
      const r = await translate(body());
      expect(r.json().data.report.scope).toEqual({ kind: 'canvas', widened: false });
      expect(changedPaths(r.json().data.data).length).toBeGreaterThan(10);
    });

    it('a component translates that component only', async () => {
      const r = await translate(body({ scope: { kind: 'component', componentId: 'button' } }));
      expect(r.statusCode).toBe(200);
      expect(changedPaths(r.json().data.data)).toEqual(['$.content[3].props.label']);
      expect(r.json().data.report.scope.kind).toBe('component');
    });

    it('a container translates its children', async () => {
      const r = await translate(body({ scope: { kind: 'component', componentId: 'row' } }));
      expect(changedPaths(r.json().data.data).sort()).toEqual(
        [
          '$.content[5].props.content[0].props.content[0].props.heading',
          '$.content[5].props.content[0].props.content[0].props.subtitle',
          '$.content[5].props.content[0].props.content[0].props.buttonLabel',
        ].sort(),
      );
      expect(r.json().data.report.untranslatableBlocks).toEqual([{ name: 'acme.Widget', count: 1 }]);
    });

    it('a fragment translates only the selected words', async () => {
      const r = await translate(body({ scope: { kind: 'text', componentId: 'heading', selectedText: 'w sklepie' } }));
      expect(r.statusCode).toBe(200);
      const after = stringLeaves(r.json().data.data);
      expect(after.get('$.content[0].props.text')).toBe('Witaj [en] w sklepie');
      expect(changedPaths(r.json().data.data)).toEqual(['$.content[0].props.text']);
      expect(model.sentTexts()).toEqual(['w sklepie']);
    });

    it('a selected block with no declaration sends nothing and reports it', async () => {
      const r = await translate(body({ scope: { kind: 'component', componentId: 'widget' } }));
      expect(r.statusCode).toBe(200);
      expect(r.json().data.report.untranslatableBlocks).toEqual([{ name: 'acme.Widget', count: 1 }]);
      expect(model.requests).toHaveLength(0);
    });

    it('a selection no longer in the canvas is refused with 422 before sending', async () => {
      const r = await translate(body({ scope: { kind: 'text', componentId: 'heading', selectedText: 'nie ma' } }));
      expect(r.statusCode).toBe(422);
      expect(r.json().error.code).toBe('CMS_TRANSLATION_SELECTION_NOT_FOUND');
      expect(model.requests).toHaveLength(0);
    });
  });
});
