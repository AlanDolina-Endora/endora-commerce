import { describe, expect, it, vi } from 'vitest';
import type { DocumentBlockRenderer, DocumentTypeRegistration } from '@endora-commerce/contracts';
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
