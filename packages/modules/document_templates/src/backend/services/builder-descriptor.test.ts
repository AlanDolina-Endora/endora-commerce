import { describe, expect, it } from 'vitest';
import type { DocumentTypeRegistration, ModuleManifest } from '@endora-commerce/contracts';
import { DocumentTypeRegistry } from '../registry/document-type-registry.js';
import { BlockDeclarations } from './block-declarations.js';
import { buildDocumentBuilderConfig } from './builder-descriptor.js';

/** T028 — route 3: exactly the type's palette, described from manifests or `describe()`. */
const tree = { root: { props: {} }, content: [] };
const manifest = (m: Partial<ModuleManifest> & { id: string }) => ({
  manifest: { name: m.id, version: '1', description: m.id, ...m } as ModuleManifest,
});

const manifests = [
  manifest({
    id: 'acme',
    blocks: [
      { name: 'acme.Body', labelKey: 'blocks.body.label', category: 'acme', contexts: ['document'], fields: { text: { type: 'text', label: 'Text' } }, defaultProps: { text: 'x' }, weight: 10 },
      { name: 'acme.Bare', labelKey: 'blocks.bare.label', category: 'acme', contexts: ['invoice'], fields: {} },
    ],
    blockCategories: [{ key: 'acme', titleKey: 'blocks.category.acme', contexts: ['document'], weight: 5 }],
  }),
  manifest({
    id: 'document_templates',
    blocks: [
      { name: 'document_templates.Text', labelKey: 'blocks.text.label', category: 'layout', contexts: ['document'], fields: { text: { type: 'textarea' } } },
      { name: 'document_templates.Spacer', labelKey: 'blocks.spacer.label', category: 'layout', contexts: ['document'], fields: { height: { type: 'number' } } },
    ],
    blockCategories: [{ key: 'layout', titleKey: 'blocks.category.layout', contexts: ['document'], weight: 90 }],
  }),
  manifest({
    id: 'cms',
    blocks: [{ name: 'cms.Row', labelKey: 'r', category: 'layout', contexts: ['cms'], fields: {} }],
    blockCategories: [{ key: 'layout', titleKey: 'cms.layout', contexts: ['cms'], weight: 1 }],
  }),
];

function setup(present = new Set(['acme', 'ksef', 'document_templates', 'cms'])) {
  const isPresent = (id: string) => present.has(id);
  const registry = new DocumentTypeRegistry(isPresent, () => undefined);
  const registration: DocumentTypeRegistration = {
    code: 'acme.note',
    moduleId: 'acme',
    labelKey: 'x',
    blocks: () => [
      { name: 'acme.Body', moduleId: 'acme', render: () => ({}) },
      { name: 'acme.Bare', moduleId: 'acme', describe: () => ({ label: 'Bare', fields: { color: { type: 'color', label: 'Colour' } } }), render: () => ({}) },
      { name: 'ksef.Stamp', moduleId: 'ksef', describe: () => ({ label: 'KSeF', fields: { caption: { type: 'text', label: 'Caption' } } }), render: () => ({}) },
    ],
    coreBlocks: ['document_templates.Text'],
    selection: 'default_only',
    defaultContent: () => ({ schemaVersion: 1, languages: { 'en-US': tree } }),
    sampleData: () => ({}),
  };
  registry.register(registration);
  return { present, config: () => buildDocumentBuilderConfig('acme.note', registry, new BlockDeclarations(() => manifests, isPresent)) };
}

describe('buildDocumentBuilderConfig', () => {
  it('lists exactly the palette: type blocks then opted-in core blocks', () => {
    expect(setup().config().components.map((c) => c.name)).toEqual(['acme.Body', 'acme.Bare', 'ksef.Stamp', 'document_templates.Text']);
  });

  it('describes a declared block from its manifest and an undeclared one from describe()', () => {
    const [body, bare, stamp] = setup().config().components;
    expect(body).toMatchObject({ labelKey: 'blocks.body.label', category: 'acme', defaultProps: { text: 'x' }, weight: 10, fields: { text: { type: 'text', label: 'Text' } } });
    expect(bare).toMatchObject({ label: 'Bare', labelKey: 'blocks.bare.label', fields: { color: { type: 'color' } } });
    expect(stamp).toMatchObject({ ownerModule: 'ksef', label: 'KSeF', fields: { caption: { type: 'text' } } });
  });

  it('folds categories over the owners of the palette only', () => {
    expect(setup().config().categories).toEqual([
      { key: 'acme', titleKey: 'blocks.category.acme', ownerModule: 'acme', weight: 5 },
      { key: 'layout', titleKey: 'blocks.category.layout', ownerModule: 'document_templates', weight: 90 },
    ]);
  });

  it('drops a contributed block while its owner is absent', () => {
    const s = setup();
    s.present.delete('ksef');
    expect(s.config().components.map((c) => c.name)).not.toContain('ksef.Stamp');
  });

  it('serves the page root fields', () => {
    expect(Object.keys(setup().config().rootFields)).toEqual([
      'pageSize', 'orientation', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
      'baseFontSize', 'headerText', 'footerText', 'showPageNumbers', 'pageNumberFormat',
    ]);
  });
});

describe('buildDocumentBuilderConfig — collection blocks (153)', () => {
  it('lists type blocks, then the Line items table, then core blocks, its category from the facility', () => {
    const withTable = [
      ...manifests.filter((m) => m.manifest.id !== 'document_templates'),
      manifest({
        id: 'document_templates',
        blocks: [
          { name: 'document_templates.Text', labelKey: 'blocks.text.label', category: 'layout', contexts: ['document'], fields: { text: { type: 'textarea' } } },
          { name: 'document_templates.ItemsTable', labelKey: 'blocks.itemsTable.label', category: 'data', contexts: ['document'], fields: { emptyText: { type: 'text' } }, defaultProps: { columns: [] } },
        ],
        blockCategories: [
          { key: 'layout', titleKey: 'blocks.category.layout', contexts: ['document'], weight: 90 },
          { key: 'data', titleKey: 'blocks.category.data', contexts: ['document'], weight: 30 },
        ],
      }),
    ];
    const registry = new DocumentTypeRegistry(() => true, () => undefined);
    registry.register({
      code: 'acme.lines',
      moduleId: 'acme',
      labelKey: 'x',
      blocks: () => [{ name: 'acme.Body', moduleId: 'acme', render: () => ({}) }],
      coreBlocks: ['document_templates.Text'],
      selection: 'per_document',
      defaultContent: () => ({ schemaVersion: 1, languages: { 'en-US': tree } }),
      sampleData: () => ({}),
      collections: [{ key: 'lines', labelKey: 'l', fields: async () => [], items: () => [] }],
    });
    const config = buildDocumentBuilderConfig('acme.lines', registry, new BlockDeclarations(() => withTable, () => true));
    expect(config.components.map((c) => c.name)).toEqual(['acme.Body', 'document_templates.ItemsTable', 'document_templates.Text']);
    expect(config.components[1]).toMatchObject({ ownerModule: 'document_templates', labelKey: 'blocks.itemsTable.label', category: 'data' });
    expect(config.categories.map((c) => c.key)).toEqual(['acme', 'data', 'layout']);
  });
});
