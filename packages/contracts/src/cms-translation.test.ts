import { describe, expect, it } from 'vitest';
import {
  BlockDefinitionSchema,
  blockTranslatableTextSchema,
  cmsPageBuilderDescriptorSchema,
  cmsPageBuilderTranslateRequestSchema,
  cmsPageBuilderTranslateResponseSchema,
  cmsPageBuilderTranslationCapabilitySchema,
  translatablePathRe,
} from './cms.js';

/**
 * Feature 151 — the translatable-text declaration (`contracts/block-translatable-declaration.md`
 * §1) and the translation API (`contracts/page-builder-translation-api.md`).
 */

describe('translatablePathRe', () => {
  it.each(['text', 'items[].title', 'a.b[].c', 'headers[].label', 'tiptap_content'])('accepts %s', (p) => {
    expect(translatablePathRe.test(p)).toBe(true);
  });
  it.each(['items[]x', '.a', 'a..b', 'a[0]', '1a', '', 'a.', 'a[][]'])('rejects %j', (p) => {
    expect(translatablePathRe.test(p)).toBe(false);
  });
});

describe('BlockDefinitionSchema.translatable', () => {
  const block = {
    name: 'cms.Heading',
    labelKey: 'blocks.heading.label',
    category: 'text',
    contexts: ['cms'],
    fields: {},
  };

  it('is optional', () => {
    expect(BlockDefinitionSchema.parse(block)).not.toHaveProperty('translatable');
  });

  it('accepts an empty declaration and plain/tiptap formats', () => {
    expect(BlockDefinitionSchema.parse({ ...block, translatable: [] }).translatable).toEqual([]);
    const parsed = BlockDefinitionSchema.parse({
      ...block,
      translatable: [{ path: 'text' }, { path: 'content', format: 'tiptap' }],
    });
    expect(parsed.translatable).toHaveLength(2);
  });

  it('refuses duplicate paths and invalid paths', () => {
    expect(
      BlockDefinitionSchema.safeParse({ ...block, translatable: [{ path: 'text' }, { path: 'text' }] }).success,
    ).toBe(false);
    expect(blockTranslatableTextSchema.safeParse({ path: 'a[0]' }).success).toBe(false);
    expect(blockTranslatableTextSchema.safeParse({ path: 'a', format: 'markdown' }).success).toBe(false);
    expect(blockTranslatableTextSchema.safeParse({ path: 'a', format: 'html' }).success).toBe(true);
  });

  it('is carried, optionally, by the descriptor', () => {
    const base = { schemaVersion: 1, components: [{ name: 'cms.Heading', ownerModule: 'cms', fields: {} }] };
    expect(cmsPageBuilderDescriptorSchema.safeParse(base).success).toBe(true);
    const withDecl = cmsPageBuilderDescriptorSchema.parse({
      ...base,
      components: [{ ...base.components[0], translatable: [{ path: 'text' }] }],
    });
    expect(withDecl.components[0]!.translatable).toEqual([{ path: 'text' }]);
  });
});

describe('cmsPageBuilderTranslationCapabilitySchema', () => {
  it('requires provider and model when ready', () => {
    expect(
      cmsPageBuilderTranslationCapabilitySchema.safeParse({ status: 'ready', maxCharacters: 40000 }).success,
    ).toBe(false);
    expect(
      cmsPageBuilderTranslationCapabilitySchema.parse({
        status: 'ready',
        provider: 'openai_compatible',
        model: 'deepseek-chat',
        maxCharacters: 40000,
      }).status,
    ).toBe('ready');
  });

  it.each(['disabled', 'not_configured', 'unavailable'])('accepts %s with maxCharacters only', (status) => {
    expect(cmsPageBuilderTranslationCapabilitySchema.safeParse({ status, maxCharacters: 1000 }).success).toBe(true);
  });
});

describe('cmsPageBuilderTranslateRequestSchema', () => {
  const data = { root: { props: {} }, content: [] };
  const request = { targetLanguage: 'en-US', sourceLanguage: null, context: 'cms', data };

  it('accepts a minimal request and a resource', () => {
    expect(cmsPageBuilderTranslateRequestSchema.safeParse(request).success).toBe(true);
    expect(
      cmsPageBuilderTranslateRequestSchema.safeParse({
        ...request,
        resource: { type: 'cms_page', id: '0b7c3a2e-5b0a-4c55-9d43-7d6c1f8a1e11' },
      }).success,
    ).toBe(true);
  });

  it('refuses a source equal to the target', () => {
    expect(
      cmsPageBuilderTranslateRequestSchema.safeParse({ ...request, sourceLanguage: 'en-US' }).success,
    ).toBe(false);
  });

  it('refuses another context and a malformed resource type', () => {
    expect(cmsPageBuilderTranslateRequestSchema.safeParse({ ...request, context: 'email' }).success).toBe(false);
    expect(
      cmsPageBuilderTranslateRequestSchema.safeParse({ ...request, resource: { type: 'Cms Page', id: null } })
        .success,
    ).toBe(false);
  });

  it('accepts the two selection scopes (research R22)', () => {
    expect(
      cmsPageBuilderTranslateRequestSchema.safeParse({
        ...request,
        scope: { kind: 'component', componentId: 'Heading-1' },
      }).success,
    ).toBe(true);
    const text = cmsPageBuilderTranslateRequestSchema.parse({
      ...request,
      scope: { kind: 'text', componentId: null, selectedText: '  dzień dobry ' },
    });
    expect(text.scope).toEqual({ kind: 'text', componentId: null, selectedText: 'dzień dobry' });
  });

  it('refuses an empty selection and one above the ceiling', () => {
    expect(
      cmsPageBuilderTranslateRequestSchema.safeParse({
        ...request,
        scope: { kind: 'text', componentId: 'x', selectedText: '   ' },
      }).success,
    ).toBe(false);
    expect(
      cmsPageBuilderTranslateRequestSchema.safeParse({
        ...request,
        scope: { kind: 'text', componentId: 'x', selectedText: 'a'.repeat(200_001) },
      }).success,
    ).toBe(false);
  });
});

describe('cmsPageBuilderTranslateResponseSchema', () => {
  it('parses a report with its scope', () => {
    const parsed = cmsPageBuilderTranslateResponseSchema.parse({
      data: { root: { props: {} }, content: [] },
      report: {
        translatedSegments: 2,
        untranslatedSegments: 0,
        untranslatableBlocks: [{ name: 'acme.Widget', count: 1 }],
        characters: 20,
        provider: 'anthropic',
        model: 'claude',
        sourceLanguage: null,
        scope: { kind: 'text', widened: true },
      },
    });
    expect(parsed.report.scope.widened).toBe(true);
  });
});
