import { describe, expect, it, vi } from 'vitest';
import type {
  DocumentBlockRenderer,
  DocumentCollectionDeclaration,
  DocumentFieldDefinition,
  DocumentTypeRegistration,
} from '@endora-commerce/contracts';
import { DocumentTypeRegistrationError, DocumentTypeRegistry } from './document-type-registry.js';

/**
 * `specs/152-compare-pdf-template/contracts/document-type-registry.md` §3 —
 * every refusal at registration, every per-call refusal of a block, and the
 * presence filter of types and of individual blocks both ways.
 */

const tree = { root: { props: {} }, content: [] };

function block(name: string, moduleId = name.slice(0, name.indexOf('.'))): DocumentBlockRenderer {
  return { name, moduleId, render: () => ({ text: name }) };
}

function registration(over: Partial<DocumentTypeRegistration> = {}): DocumentTypeRegistration {
  return {
    code: 'acme.note',
    moduleId: 'acme',
    labelKey: 'documentTypes.note.label',
    blocks: () => [block('acme.NoteBody')],
    coreBlocks: 'none',
    selection: 'default_only',
    defaultContent: () => ({ schemaVersion: 1, languages: { 'en-US': tree } }),
    sampleData: () => ({}),
    ...over,
  };
}

describe('DocumentTypeRegistry — registration refusals', () => {
  it('accepts a valid registration and answers it', () => {
    const registry = new DocumentTypeRegistry();
    const reg = registration();
    registry.register(reg);
    expect(registry.get('acme.note')).toBe(reg);
    expect(registry.list()).toEqual([reg]);
  });

  it('is idempotent for the identical registration', () => {
    const registry = new DocumentTypeRegistry();
    const reg = registration();
    registry.register(reg);
    registry.register(reg);
    expect(registry.list()).toHaveLength(1);
  });

  it.each([
    ['a code whose owner segment is not the module', registration({ code: 'other.note' })],
    ['a code outside the grammar', registration({ code: 'acme.Note' })],
    ['a type registered by the facility itself', registration({ code: 'document_templates.x', moduleId: 'document_templates' })],
    ['an invalid built-in layout', registration({ defaultContent: () => ({ schemaVersion: 2, languages: {} }) as never })],
    ['coreBlocks naming a non-core block', registration({ coreBlocks: ['acme.NoteBody'] as never })],
    ['a language outside the grammar', registration({ languages: ['english'] })],
    ['a merge-field key outside the grammar', registration({ variables: [{ key: 'Bad_Key', labelKey: 'x' }] })],
  ])('refuses %s', (_label, reg) => {
    expect(() => new DocumentTypeRegistry().register(reg)).toThrow(DocumentTypeRegistrationError);
  });

  it('refuses a second, different registration for one code', () => {
    const registry = new DocumentTypeRegistry();
    registry.register(registration());
    expect(() => registry.register(registration())).toThrow(/already registered/);
  });
});

describe('DocumentTypeRegistry — blocks, refused per call', () => {
  it('drops a block whose owner segment is not its module, a core block name, and a duplicate — and logs each once', () => {
    const log = vi.fn();
    const registry = new DocumentTypeRegistry(() => true, log);
    registry.register(
      registration({
        blocks: () => [
          block('acme.NoteBody'),
          block('acme.Stolen', 'thief'),
          block('document_templates.Text', 'acme'),
          block('acme.NoteBody'),
          block('ksef.Stamp'),
        ],
      }),
    );
    expect(registry.blocks('acme.note').map((b) => b.name)).toEqual(['acme.NoteBody', 'ksef.Stamp']);
    registry.blocks('acme.note');
    expect(log).toHaveBeenCalledTimes(3);
  });

  it('answers the palette: own blocks plus the core blocks the type opts into', () => {
    const registry = new DocumentTypeRegistry();
    registry.register(registration({ coreBlocks: ['document_templates.Text', 'document_templates.Spacer'] }));
    expect([...registry.palette('acme.note')]).toEqual([
      'acme.NoteBody',
      'document_templates.Text',
      'document_templates.Spacer',
    ]);
    const all = new DocumentTypeRegistry();
    all.register(registration({ coreBlocks: 'all' }));
    expect(all.palette('acme.note').size).toBe(7);
  });
});

describe('DocumentTypeRegistry — presence', () => {
  it('hides a type while its module is absent and shows it again, without re-registering', () => {
    const present = new Set(['acme', 'ksef']);
    const registry = new DocumentTypeRegistry((id) => present.has(id));
    registry.register(registration());
    expect(registry.get('acme.note')).toBeDefined();
    present.delete('acme');
    expect(registry.get('acme.note')).toBeUndefined();
    expect(registry.list()).toEqual([]);
    present.add('acme');
    expect(registry.get('acme.note')).toBeDefined();
  });

  it("drops one contributed block while its contributor is absent, and restores it", () => {
    const present = new Set(['acme', 'ksef']);
    const registry = new DocumentTypeRegistry((id) => present.has(id));
    registry.register(registration({ blocks: () => [block('acme.NoteBody'), block('ksef.Stamp')] }));
    present.delete('ksef');
    expect(registry.blocks('acme.note').map((b) => b.name)).toEqual(['acme.NoteBody']);
    present.add('ksef');
    expect(registry.blocks('acme.note').map((b) => b.name)).toEqual(['acme.NoteBody', 'ksef.Stamp']);
  });

  it('answers no blocks and an empty palette for an absent type', () => {
    const registry = new DocumentTypeRegistry(() => false);
    registry.register(registration());
    expect(registry.blocks('acme.note')).toEqual([]);
    expect(registry.palette('acme.note').size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Feature 153 — line collections (`contracts/document-collections.md` §1, §2)
// ---------------------------------------------------------------------------

const field = (path: string, over: Partial<DocumentFieldDefinition> = {}): DocumentFieldDefinition => ({
  path,
  label: path,
  valueKind: 'text',
  group: 'line',
  audience: 'customer',
  ...over,
});

function collection(over: Partial<DocumentCollectionDeclaration> = {}): DocumentCollectionDeclaration {
  return {
    key: 'lines',
    labelKey: 'documentTypes.note.collections.lines',
    fields: async () => [field('name'), field('qty', { valueKind: 'number' })],
    items: () => [],
    ...over,
  };
}

const itemsTableNode = (props: Record<string, unknown> = {}) => ({
  type: 'document_templates.ItemsTable',
  props: { id: 'it', columns: [{ id: 'c1', field: 'name' }], ...props },
});

describe('DocumentTypeRegistry — collections at registration (153)', () => {
  it('accepts a type declaring collections and a built-in layout placing the table', () => {
    const registry = new DocumentTypeRegistry();
    registry.register(
      registration({
        collections: [collection()],
        defaultContent: () => ({ schemaVersion: 1, languages: { 'en-US': { root: { props: {} }, content: [itemsTableNode({ collection: 'lines' })] } } }),
      }),
    );
    expect(registry.collections('acme.note').map((c) => c.key)).toEqual(['lines']);
  });

  it.each([
    ['a collection key outside the grammar', registration({ collections: [collection({ key: 'Lines' })] })],
    ['a collection key used twice', registration({ collections: [collection(), collection()] })],
    [
      'a built-in table whose props fail the schema',
      registration({
        collections: [collection()],
        defaultContent: () => ({ schemaVersion: 1, languages: { 'en-US': { root: { props: {} }, content: [itemsTableNode({ columns: [] })] } } }),
      }),
    ],
    [
      'a built-in table naming an undeclared collection',
      registration({
        collections: [collection()],
        defaultContent: () => ({ schemaVersion: 1, languages: { 'en-US': { root: { props: {} }, content: [itemsTableNode({ collection: 'other' })] } } }),
      }),
    ],
    [
      'a built-in table in a type declaring no collection',
      registration({
        defaultContent: () => ({ schemaVersion: 1, languages: { 'en-US': { root: { props: {} }, content: [itemsTableNode()] } } }),
      }),
    ],
  ])('refuses %s', (_label, reg) => {
    expect(() => new DocumentTypeRegistry().register(reg)).toThrow(DocumentTypeRegistrationError);
  });
});

describe('DocumentTypeRegistry — the palette with collections (153)', () => {
  it('offers the Line items table iff the type declares a collection, after the type blocks', () => {
    const registry = new DocumentTypeRegistry();
    registry.register(registration({ collections: [collection()], coreBlocks: ['document_templates.Text'] }));
    expect([...registry.palette('acme.note')]).toEqual([
      'acme.NoteBody',
      'document_templates.ItemsTable',
      'document_templates.Text',
    ]);
    expect(registry.collectionBlocks('acme.note')).toEqual(['document_templates.ItemsTable']);
    const without = new DocumentTypeRegistry();
    without.register(registration());
    expect(without.palette('acme.note').has('document_templates.ItemsTable')).toBe(false);
    expect(without.collectionBlocks('acme.note')).toEqual([]);
  });

  it('refuses, per call, a host block taking the table’s name', () => {
    const log = vi.fn();
    const registry = new DocumentTypeRegistry(() => true, log);
    registry.register(
      registration({ blocks: () => [block('acme.NoteBody'), block('document_templates.ItemsTable', 'acme')] }),
    );
    expect(registry.blocks('acme.note').map((b) => b.name)).toEqual(['acme.NoteBody']);
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe('DocumentTypeRegistry — a collection’s catalogue, per call (153)', () => {
  it('prepends the position field and answers the summary fields', async () => {
    const registry = new DocumentTypeRegistry();
    registry.register(
      registration({
        collections: [collection({ summaryFields: async () => [field('total', { valueKind: 'money' })] })],
      }),
    );
    const catalogue = await registry.catalogue('acme.note', 'lines', 'pl-PL');
    expect(catalogue.fields.map((f) => f.path)).toEqual(['row.number', 'name', 'qty']);
    expect(catalogue.fields[0]).toMatchObject({ label: 'Lp.', valueKind: 'number', group: 'line', audience: 'customer', defaultAlign: 'right' });
    expect((await registry.catalogue('acme.note', 'lines', 'en-US')).fields[0]!.label).toBe('No.');
    expect(catalogue.summaryFields.map((f) => f.path)).toEqual(['total']);
  });

  it('drops a bad path, a reserved family and a duplicate — logged once — and keeps the rest', async () => {
    const log = vi.fn();
    const registry = new DocumentTypeRegistry(() => true, log);
    registry.register(
      registration({
        collections: [
          collection({
            fields: async () => [field('name'), field('a.b.c'), field('row.extra'), field('item.sku'), field('name'), field('attributes.colour')],
          }),
        ],
      }),
    );
    const first = await registry.catalogue('acme.note', 'lines', 'en-US');
    expect(first.fields.map((f) => f.path)).toEqual(['row.number', 'name', 'attributes.colour']);
    await registry.catalogue('acme.note', 'lines', 'en-US');
    expect(log).toHaveBeenCalledTimes(4);
  });

  it('answers an empty catalogue when fields() rejects, and logs it', async () => {
    const log = vi.fn();
    const registry = new DocumentTypeRegistry(() => true, log);
    registry.register(registration({ collections: [collection({ fields: async () => { throw new Error('attributes down'); } })] }));
    const catalogue = await registry.catalogue('acme.note', 'lines', 'en-US');
    expect(catalogue.fields.map((f) => f.path)).toEqual(['row.number']);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('catalogue'), expect.objectContaining({ collection: 'lines' }));
  });

  it('answers nothing for an absent type or an undeclared collection', async () => {
    const present = new Set(['acme']);
    const registry = new DocumentTypeRegistry((id) => present.has(id));
    registry.register(registration({ collections: [collection()] }));
    expect(await registry.catalogue('acme.note', 'other', 'en-US')).toEqual({ fields: [], summaryFields: [] });
    present.delete('acme');
    expect(registry.collections('acme.note')).toEqual([]);
    expect(registry.palette('acme.note').size).toBe(0);
  });
});
