import { describe, expect, it } from 'vitest';
import { validateTree, type PaletteFacts } from './content-validation.js';

/**
 * T015 — save-time validation of the Line items table
 * (`specs/153-quote-request-pdf-template/contracts/document-collections.md` §3.1, FR-043).
 */

const TABLE = 'document_templates.ItemsTable';
const facts = (over: Partial<PaletteFacts> = {}): PaletteFacts => ({
  palette: new Set([TABLE, 'document_templates.Text']),
  isDeclared: (name) => name === TABLE || name.startsWith('document_templates.'),
  languages: null,
  collections: ['lines'],
  ...over,
});
const tree = (content: unknown[]) => ({ root: { props: {} }, content });
const table = (props: Record<string, unknown>) => ({ type: TABLE, props: { id: 't', columns: [{ id: 'c1', field: 'productName' }], ...props } });

function refusal(fn: () => unknown): { code: string; details: Record<string, unknown> } {
  try {
    fn();
  } catch (error) {
    return error as { code: string; details: Record<string, unknown> };
  }
  throw new Error('expected a refusal');
}

describe('validateTree — the Line items table (153)', () => {
  it('accepts valid settings, an unknown field path included (FR-037)', () => {
    expect(() => validateTree(tree([table({ columns: [{ id: 'c1', field: 'attributes.gone' }] })]), facts())).not.toThrow();
  });

  it('refuses invalid settings with the path of the setting and the block', () => {
    const error = refusal(() =>
      validateTree(tree([{ type: 'document_templates.Text', props: {} }, table({ columns: [{ id: 'c1', field: 'a.b.c' }] })]), facts()),
    );
    expect(error.code).toBe('DOCUMENT_TEMPLATE_INVALID');
    expect(error.details).toMatchObject({ path: 'content.1.props.columns.0.field', blockName: TABLE });
  });

  it('names the limit when one is broken', () => {
    const columns = Array.from({ length: 17 }, (_, i) => ({ id: `c${i}`, field: 'x' }));
    const error = refusal(() => validateTree(tree([table({ columns })]), facts()));
    expect(error.details).toMatchObject({ path: 'content.0.props.columns', blockName: TABLE, limit: 'maxColumns', max: 16 });
  });

  it('refuses a collection the type does not declare', () => {
    const error = refusal(() => validateTree(tree([table({ collection: 'other' })]), facts()));
    expect(error.details).toMatchObject({ path: 'content.0.props.collection', collection: 'other', blockName: TABLE });
  });

  it('refuses the table by name in a type that declares no collection (152 FR-019)', () => {
    const error = refusal(() =>
      validateTree(tree([table({})]), facts({ palette: new Set(['document_templates.Text']), collections: [] })),
    );
    expect(error.details).toMatchObject({ path: 'content.0', blockName: TABLE });
  });
});
