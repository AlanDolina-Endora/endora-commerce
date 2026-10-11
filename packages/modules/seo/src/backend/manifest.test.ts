import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { manifest } from '../manifest.js';

/**
 * What `seo` declares for search engine robots
 * (`specs/144-seo-search-engine-robots/contracts/admin-surfaces.md` §1 and §5).
 *
 * Under `backend/` rather than beside `manifest.ts`: only the manifest is
 * published at the package's root subpath, and `manifests:generate` refuses a
 * sibling file there.
 */
describe('seo manifest — default robots', () => {
  const setting = manifest.settings?.settings.find((s) => s.code === 'seo.default_robots');

  it('declares the setting as a closed list in the seo group', () => {
    expect(setting).toBeDefined();
    expect(setting?.groupCode).toBe('seo');
    expect(setting?.valueType).toBe('string');
    expect(setting?.enumOptions).toEqual([
      'INDEX, FOLLOW',
      'NOINDEX, FOLLOW',
      'INDEX, NOFOLLOW',
      'NOINDEX, NOFOLLOW',
    ]);
  });

  it('defaults to no restriction, so an untouched instance behaves as before', () => {
    expect(setting?.defaultValue).toBe('INDEX, FOLLOW');
  });

  it('is shown on the Settings screen and can be set for any sales channel', () => {
    // Not hidden: the generic Settings screen is where it is edited. No
    // channel restriction: it takes an all-channels value and per-channel ones.
    expect(setting?.hidden).not.toBe(true);
    expect(setting?.salesChannelCodes).toBeUndefined();
  });

  it('keeps the activation control and adds nothing to it', () => {
    expect(manifest.activation).toEqual({ settingCode: 'seo.enabled', default: true });
  });
});

describe('seo manifest — custom robots.txt instructions', () => {
  const setting = manifest.settings?.settings.find((s) => s.code === 'seo.robots_txt_custom');

  it('declares a multi-line text in the seo group, empty by default', () => {
    expect(setting).toBeDefined();
    expect(setting?.groupCode).toBe('seo');
    expect(setting?.valueType).toBe('string');
    expect(setting?.multiline).toBe(true);
    expect(setting?.enumOptions).toBeUndefined();
    // Empty is what keeps an untouched instance's robots.txt what it was.
    expect(setting?.defaultValue).toBe('');
  });

  it('is shown on the Settings screen and can be set for any sales channel', () => {
    expect(setting?.hidden).not.toBe(true);
    expect(setting?.salesChannelCodes).toBeUndefined();
  });

  it('says what an operator needs before writing a rule (FR-008)', () => {
    // Appended to the system-generated rules, never instead of them…
    expect(setting?.description).toMatch(/added after the rules the storefront generates/);
    // …and a Disallow is not a way out of search results.
    expect(setting?.description).toMatch(/does not remove pages from search results/);
    // The limit is named where the text is typed, not only in the refusal.
    expect(setting?.description).toMatch(/64 KiB/);
  });

  it('declares the refusal for a text over the limit', () => {
    expect(manifest.errorCodes).toEqual([{ code: 'SEO_CRAWLER_TEXT_TOO_LARGE' }]);
  });
});

describe('seo manifest — command palette', () => {
  const action = (id: string) => manifest.actions?.find((a) => a.id === id);

  it('declares exactly the two actions', () => {
    expect(manifest.actions?.map((a) => a.id)).toEqual(['open-seo', 'open-search-engine-robots']);
  });

  it('opens the SEO screen for those who may use it', () => {
    expect(action('open-seo')).toMatchObject({
      targetRoute: '/seo',
      requiredPermission: 'catalog:write',
      icon: 'Search',
      labelKey: 'actions.openSeo.label',
      descriptionKey: 'actions.openSeo.description',
    });
  });

  it('opens the Settings screen for those who may read settings', () => {
    expect(action('open-search-engine-robots')).toMatchObject({
      targetRoute: '/settings',
      requiredPermission: 'settings:read',
      icon: 'Search',
      labelKey: 'actions.openSearchEngineRobots.label',
      descriptionKey: 'actions.openSearchEngineRobots.description',
    });
  });

  it('is findable by the words an operator would type', () => {
    const keywords = manifest.actions?.flatMap((a) => a.keywords ?? []) ?? [];
    for (const word of ['robots', 'noindex', 'llms', 'seo', 'sitemap', 'indeksowanie']) {
      expect(keywords).toContain(word);
    }
  });
});

describe('seo manifest — what switching the module off withdraws (FR-033)', () => {
  const activation = manifest.settings?.settings.find((s) => s.code === 'seo.enabled');

  // The consequence, not the topic: a description that merely mentions robots
  // would not tell an operator that switching the module off puts a noindex
  // sales channel back into search.
  const CONSEQUENCE = /noindex becomes indexable again/;

  it('says so beside the switch on the platform modules screen', () => {
    expect(manifest.description).toMatch(/Switching it off withdraws the default robots directive/);
    expect(manifest.description).toMatch(CONSEQUENCE);
  });

  it('says so on the activation setting', () => {
    expect(activation?.description).toMatch(/sends no default robots directive/);
    expect(activation?.description).toMatch(CONSEQUENCE);
  });
});

/**
 * The strings the manifest points at, in both shipped languages (FR-008).
 *
 * `settingLabels.<setting code>.name|description` is the key shape the Settings
 * screen resolves a setting's name and description from, in its owner module's
 * own bundle. The four choices are deliberately not here: they are the
 * directive tokens themselves and read the same in every language.
 */
describe('seo bundles', () => {
  const bundle = (language: string): Record<string, string> =>
    JSON.parse(
      readFileSync(new URL(`../../i18n/${language}.json`, import.meta.url), 'utf8'),
    ) as Record<string, string>;

  const KEYS = [
    'settingLabels.seo.default_robots.name',
    'settingLabels.seo.default_robots.description',
    'settingLabels.seo.robots_txt_custom.name',
    'settingLabels.seo.robots_txt_custom.description',
    'errors.SEO_CRAWLER_TEXT_TOO_LARGE',
    ...(manifest.actions ?? []).flatMap((a) => [a.labelKey, a.descriptionKey]),
  ];

  it.each(['en', 'pl'])('%s carries every key', (language) => {
    const entries = bundle(language);
    for (const key of KEYS) {
      expect(entries[key], `${language}: ${key}`).toEqual(expect.stringMatching(/\S/));
    }
  });

  it('keeps the English setting name and description in step with the manifest', () => {
    const declared = manifest.settings?.settings.find((s) => s.code === 'seo.default_robots');
    expect(bundle('en')['settingLabels.seo.default_robots.name']).toBe(declared?.name);
    expect(bundle('en')['settingLabels.seo.default_robots.description']).toBe(
      declared?.description,
    );
  });

  it('keeps the English name and description of the custom instructions in step with the manifest', () => {
    const declared = manifest.settings?.settings.find((s) => s.code === 'seo.robots_txt_custom');
    expect(bundle('en')['settingLabels.seo.robots_txt_custom.name']).toBe(declared?.name);
    expect(bundle('en')['settingLabels.seo.robots_txt_custom.description']).toBe(
      declared?.description,
    );
  });

  it('says in Polish, too, that the text is appended and that Disallow does not de-index', () => {
    const polish = bundle('pl')['settingLabels.seo.robots_txt_custom.description'];
    expect(polish).not.toBe(bundle('en')['settingLabels.seo.robots_txt_custom.description']);
    expect(polish).toMatch(/po regułach generowanych przez sklep/);
    expect(polish).toMatch(/nie usuwa stron z wyników wyszukiwania/);
    expect(polish).toMatch(/64 KiB/);
  });

  it.each(['en', 'pl'])('names the limit in the %s refusal, from what the raise carries', (language) => {
    const sentence = bundle(language)['errors.SEO_CRAWLER_TEXT_TOO_LARGE'];
    expect(sentence).toContain('{maxBytes}');
    expect(sentence).toContain('{actualBytes}');
    expect(sentence).toContain('64 KiB');
  });

  it('translates the description rather than repeating the English one', () => {
    expect(bundle('pl')['settingLabels.seo.default_robots.description']).not.toBe(
      bundle('en')['settingLabels.seo.default_robots.description'],
    );
    // The tokens stay as they are in every language.
    expect(bundle('pl')['settingLabels.seo.default_robots.description']).toMatch(/NOINDEX/);
  });
});
