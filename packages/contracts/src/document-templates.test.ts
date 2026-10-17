import { describe, expect, it } from 'vitest';
import {
  CORE_BLOCK_NAMES,
  DOCUMENT_TEMPLATE_LIMITS,
  createDocumentTemplateBodySchema,
  deleteDocumentTemplateBodySchema,
  documentBuilderConfigSchema,
  documentRootPropsSchema,
  documentTemplateContentSchema,
  documentTemplateDetailSchema,
  documentTemplateSummarySchema,
  documentTemplateTreeSchema,
  documentTypeCodeSchema,
  documentTypeDetailSchema,
  documentTypeSummarySchema,
  mergeFieldKeyRe,
  previewDocumentBodySchema,
  renameDocumentTemplateBodySchema,
  saveDocumentTemplateContentBodySchema,
  documentSelectionSchema,
  documentCoreBlocksSchema,
  versionedBodySchema,
} from './document-templates.js';
import { ERROR_CODES } from './errors.js';

const tree = (content: unknown[] = [], rootProps: Record<string, unknown> = {}) => ({
  root: { props: rootProps },
  content,
});
const node = (type: string, props: Record<string, unknown> = {}) => ({ type, props: { id: 'x', ...props } });
const envelope = (languages: Record<string, unknown>) => ({ schemaVersion: 1, languages });

describe('document type code', () => {
  it('accepts <module>.<snake_name>', () => {
    expect(documentTypeCodeSchema.safeParse('comparisons.comparison').success).toBe(true);
    expect(documentTypeCodeSchema.safeParse('invoices.invoice').success).toBe(true);
    expect(documentTypeCodeSchema.safeParse('quote_requests.quote_pdf').success).toBe(true);
  });
  it.each(['comparisons', 'Comparisons.comparison', 'comparisons.Comparison', 'a.b.c', '.x', 'x.', `a.${'b'.repeat(120)}`])(
    'refuses %s',
    (code) => {
      expect(documentTypeCodeSchema.safeParse(code).success).toBe(false);
    },
  );
});

describe('documentTemplateContentSchema', () => {
  it('accepts a minimal envelope and unknown (absent-owner) block names', () => {
    const parsed = documentTemplateContentSchema.safeParse(
      envelope({ 'pl-PL': tree([node('gone.SomeBlock', { keep: 1 })]) }),
    );
    expect(parsed.success).toBe(true);
  });

  it('requires schemaVersion 1', () => {
    expect(documentTemplateContentSchema.safeParse({ schemaVersion: 2, languages: { en: tree() } }).success).toBe(false);
  });

  it('refuses language keys outside the BCP 47 subset', () => {
    expect(documentTemplateContentSchema.safeParse(envelope({ english: tree() })).success).toBe(false);
    expect(documentTemplateContentSchema.safeParse(envelope({ 'en-us': tree() })).success).toBe(false);
    expect(documentTemplateContentSchema.safeParse(envelope({ en: tree(), 'pl-PL': tree() })).success).toBe(true);
  });

  it('holds 1 to 10 languages', () => {
    expect(documentTemplateContentSchema.safeParse(envelope({})).success).toBe(false);
    const eleven = Object.fromEntries(
      ['aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg', 'hh', 'ii', 'jj', 'kk'].map((l) => [l, tree()]),
    );
    expect(documentTemplateContentSchema.safeParse(envelope(eleven)).success).toBe(false);
  });

  it('refuses more than 200 nodes per language', () => {
    const many = Array.from({ length: DOCUMENT_TEMPLATE_LIMITS.maxNodesPerLanguage + 1 }, () =>
      node('document_templates.Spacer'),
    );
    expect(documentTemplateTreeSchema.safeParse(tree(many)).success).toBe(false);
    expect(documentTemplateTreeSchema.safeParse(tree(many.slice(1))).success).toBe(true);
  });

  it('refuses a node type outside the block-name grammar', () => {
    expect(documentTemplateTreeSchema.safeParse(tree([node('Heading')])).success).toBe(false);
    expect(documentTemplateTreeSchema.safeParse(tree([node('document_templates.heading')])).success).toBe(false);
  });

  it('refuses a string prop longer than 5000 characters, nested too', () => {
    const long = 'x'.repeat(DOCUMENT_TEMPLATE_LIMITS.maxStringLength + 1);
    expect(documentTemplateTreeSchema.safeParse(tree([node('document_templates.Text', { text: long })])).success).toBe(false);
    expect(
      documentTemplateTreeSchema.safeParse(tree([node('document_templates.Text', { nested: [{ deep: long }] })])).success,
    ).toBe(false);
  });

  it('refuses more than 20 core images per language', () => {
    const images = Array.from({ length: DOCUMENT_TEMPLATE_LIMITS.maxCoreImagesPerLanguage + 1 }, () =>
      node('document_templates.Image', { assetId: '00000000-0000-4000-8000-000000000001' }),
    );
    expect(documentTemplateTreeSchema.safeParse(tree(images)).success).toBe(false);
  });

  it('refuses Puck zones (nested layouts)', () => {
    expect(documentTemplateTreeSchema.safeParse({ ...tree(), zones: { 'a:b': [node('cms.Row')] } }).success).toBe(false);
    expect(documentTemplateTreeSchema.safeParse({ ...tree(), zones: {} }).success).toBe(true);
  });

  it('refuses content larger than 512 KiB', () => {
    const chunk = 'y'.repeat(4900);
    const nodes = Array.from({ length: 200 }, (_, i) => node('document_templates.Text', { text: chunk, i }));
    const languages = Object.fromEntries(['aa', 'bb'].map((l) => [l, tree(nodes)]));
    const result = documentTemplateContentSchema.safeParse(envelope(languages));
    expect(result.success).toBe(false);
  });
});

describe('documentRootPropsSchema', () => {
  it('accepts the documented ranges and keeps unknown keys', () => {
    const parsed = documentRootPropsSchema.parse({
      pageSize: 'LETTER',
      orientation: 'landscape',
      marginTop: 0,
      marginRight: 144,
      baseFontSize: 6,
      headerText: '{{date}}',
      showPageNumbers: true,
      pageNumberFormat: '{{page}}/{{pages}}',
      title: 'kept',
    });
    expect(parsed['title']).toBe('kept');
  });
  it.each([
    { pageSize: 'A3' },
    { orientation: 'sideways' },
    { marginTop: 145 },
    { marginLeft: -1 },
    { baseFontSize: 5 },
    { baseFontSize: 19 },
    { footerText: 'x'.repeat(501) },
    { pageNumberFormat: 'x'.repeat(51) },
  ])('refuses %o', (props) => {
    expect(documentRootPropsSchema.safeParse(props).success).toBe(false);
  });
});

describe('merge-field keys, selection, core blocks', () => {
  it('merge-field key grammar', () => {
    expect(mergeFieldKeyRe.test('productCount')).toBe(true);
    expect(mergeFieldKeyRe.test('date')).toBe(true);
    expect(mergeFieldKeyRe.test('Product')).toBe(false);
    expect(mergeFieldKeyRe.test('product_count')).toBe(false);
  });
  it('selection is default_only or per_document', () => {
    expect(documentSelectionSchema.options).toEqual(['default_only', 'per_document']);
  });
  it('coreBlocks is all, none or a list of core block names', () => {
    expect(documentCoreBlocksSchema.safeParse('all').success).toBe(true);
    expect(documentCoreBlocksSchema.safeParse('none').success).toBe(true);
    expect(documentCoreBlocksSchema.safeParse(['document_templates.Text']).success).toBe(true);
    expect(documentCoreBlocksSchema.safeParse(['comparisons.ComparisonTable']).success).toBe(false);
    expect(CORE_BLOCK_NAMES).toHaveLength(6);
  });
});

describe('admin DTOs', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  it('summary and detail', () => {
    const summary = {
      id,
      documentType: 'comparisons.comparison',
      name: 'Brand A',
      salesChannelId: null,
      salesChannelName: null,
      languages: ['pl-PL'],
      isDefault: false,
      version: 1,
      updatedAt: '2026-10-17T10:00:00.000Z',
    };
    expect(documentTemplateSummarySchema.safeParse(summary).success).toBe(true);
    expect(
      documentTemplateDetailSchema.safeParse({ ...summary, content: envelope({ 'pl-PL': tree() }) }).success,
    ).toBe(true);
  });
  it('type summary and detail', () => {
    const summary = {
      code: 'comparisons.comparison',
      moduleId: 'comparisons',
      labelKey: 'documentTypes.comparison.label',
      selection: 'default_only',
      templateCount: 0,
    };
    expect(documentTypeSummarySchema.safeParse(summary).success).toBe(true);
    expect(
      documentTypeDetailSchema.safeParse({
        ...summary,
        languages: null,
        variables: [{ key: 'productCount', labelKey: 'x', ownerModule: 'comparisons', scope: 'body' }],
        sample: {},
        builtInContent: envelope({ 'en-US': tree() }),
        pageDefaults: { pageSize: 'A4' },
      }).success,
    ).toBe(true);
  });
  it('create body defaults setDefault to false and validates the source', () => {
    const parsed = createDocumentTemplateBodySchema.parse({
      documentType: 'comparisons.comparison',
      name: '  Brand A ',
      salesChannelId: null,
      source: { kind: 'built_in' },
    });
    expect(parsed.setDefault).toBe(false);
    expect(parsed.name).toBe('Brand A');
    expect(
      createDocumentTemplateBodySchema.safeParse({
        documentType: 'comparisons.comparison',
        name: 'x',
        salesChannelId: null,
        source: { kind: 'template' },
      }).success,
    ).toBe(false);
  });
  it('rename, save, versioned, delete, preview', () => {
    expect(renameDocumentTemplateBodySchema.safeParse({ name: '', expectedVersion: 1 }).success).toBe(false);
    expect(saveDocumentTemplateContentBodySchema.safeParse({ tree: tree(), expectedVersion: 1 }).success).toBe(true);
    expect(versionedBodySchema.safeParse({}).success).toBe(false);
    expect(deleteDocumentTemplateBodySchema.parse({ expectedVersion: 2 }).confirmDefault).toBe(false);
    expect(
      previewDocumentBodySchema.safeParse({ documentType: 'invoices.invoice', language: 'pl-PL', tree: tree() }).success,
    ).toBe(true);
  });
  it('builder config admits colour fields and boolean options (invoice blocks)', () => {
    expect(
      documentBuilderConfigSchema.safeParse({
        schemaVersion: 1,
        components: [
          {
            name: 'invoices.InvoiceHeader',
            ownerModule: 'invoices',
            label: 'Header',
            fields: {
              titleColor: { type: 'color', label: 'Title color' },
              titleBold: { type: 'radio', label: 'Bold', options: [{ label: 'Yes', value: true }] },
            },
          },
        ],
        categories: [],
        rootFields: {},
      }).success,
    ).toBe(true);
  });
});

describe('error codes', () => {
  it('declares the six DOCUMENT_* codes', () => {
    for (const code of [
      'DOCUMENT_TEMPLATE_NOT_FOUND',
      'DOCUMENT_TYPE_NOT_AVAILABLE',
      'DOCUMENT_TEMPLATE_INVALID',
      'DOCUMENT_TEMPLATE_IS_DEFAULT',
      'DOCUMENT_TEMPLATE_NOT_SELECTABLE',
      'DOCUMENT_RENDER_FAILED',
    ]) {
      expect((ERROR_CODES as Record<string, string>)[code]).toBe(code);
    }
  });
});
