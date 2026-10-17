import { describe, expect, it } from 'vitest';
import type { BlockTranslatableText } from '@endora-commerce/contracts';
import { extract, SelectionNotFoundError, type Declarations } from './extract.js';
import { inject } from './inject.js';

/**
 * Feature 151, T068 / research R22 — the selection scope: one component (with
 * its children), or one selected fragment of text, translated alone.
 */

const DECLARATIONS: Record<string, BlockTranslatableText[]> = {
  'cms.Heading': [{ path: 'text' }],
  'cms.Text': [{ path: 'text' }, { path: 'tiptapContent', format: 'tiptap' }],
  'cms.Accordion': [{ path: 'items[].title' }, { path: 'items[].content', format: 'html' }],
  'cms.Row': [],
  'cms.Spacer': [],
};
const declarations: Declarations = (name) => DECLARATIONS[name];
const BOLD = [{ type: 'bold' }];

function canvas() {
  return {
    root: { props: {} },
    content: [
      { type: 'cms.Heading', props: { id: 'h1', text: 'Pierwszy nagłówek' } },
      {
        type: 'cms.Row',
        props: {
          id: 'row',
          content: [
            { type: 'cms.Heading', props: { id: 'h2', text: 'Drugi nagłówek' } },
            { type: 'cms.Spacer', props: { id: 'sp' } },
            { type: 'acme.Widget', props: { id: 'w', caption: 'x' } },
          ],
        },
      },
      {
        type: 'cms.Text',
        props: {
          id: 'txt',
          tiptapContent: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: 'Zwykły tekst przed  ' },
                  { type: 'text', text: 'pogrubionym fragmentem', marks: BOLD },
                  { type: 'text', text: ' i po nim.' },
                ],
              },
              { type: 'paragraph', content: [{ type: 'text', text: 'Drugi akapit tutaj.' }] },
            ],
          },
        },
      },
      { type: 'cms.Heading', props: { id: 'h3', text: 'Ostatni nagłówek z dodatkiem' } },
    ],
  };
}

const identityPlus = (extraction: ReturnType<typeof extract>, suffix = ' [en]') =>
  new Map(extraction.segments.map((s) => [s.id, `${s.text}${suffix}`]));

describe('no scope', () => {
  it('is the whole canvas', () => {
    const extraction = extract(canvas(), declarations);
    expect(extraction.scope).toEqual({ kind: 'canvas', widened: false });
    expect(extraction.segments.length).toBeGreaterThan(4);
  });
});

describe('component scope', () => {
  it('translates only the selected component', () => {
    const extraction = extract(canvas(), declarations, { kind: 'component', componentId: 'h3' });
    expect(extraction.segments.map((s) => s.text)).toEqual(['Ostatni nagłówek z dodatkiem']);
    expect(extraction.scope).toEqual({ kind: 'component', widened: false });
    const out = inject(canvas(), extraction, identityPlus(extraction)).data as ReturnType<typeof canvas>;
    expect(out.content[3]!.props.text).toBe('Ostatni nagłówek z dodatkiem [en]');
    expect(out.content[0]).toEqual(canvas().content[0]);
    expect(out.content[1]).toEqual(canvas().content[1]);
    expect(out.content[2]).toEqual(canvas().content[2]);
  });

  it('includes the children of a container and reports its undeclared ones', () => {
    const extraction = extract(canvas(), declarations, { kind: 'component', componentId: 'row' });
    expect(extraction.segments.map((s) => s.text)).toEqual(['Drugi nagłówek']);
    expect([...extraction.untranslatableBlocks]).toEqual([['acme.Widget', 1]]);
  });

  it('reports a selected block that declares nothing as untranslatable', () => {
    const extraction = extract(canvas(), declarations, { kind: 'component', componentId: 'w' });
    expect(extraction.segments).toEqual([]);
    expect([...extraction.untranslatableBlocks]).toEqual([['acme.Widget', 1]]);
  });

  it('refuses a component that is not in the canvas', () => {
    expect(() => extract(canvas(), declarations, { kind: 'component', componentId: 'nope' })).toThrow(
      SelectionNotFoundError,
    );
  });
});

describe('text scope — plain leaf', () => {
  it('translates exactly the selected range and keeps the rest of the string', () => {
    const extraction = extract(canvas(), declarations, {
      kind: 'text',
      componentId: 'h3',
      selectedText: 'nagłówek',
    });
    expect(extraction.segments.map((s) => s.text)).toEqual(['nagłówek']);
    expect(extraction.scope).toEqual({ kind: 'text', widened: false });
    const out = inject(canvas(), extraction, new Map([[extraction.segments[0]!.id, 'heading']]))
      .data as ReturnType<typeof canvas>;
    expect(out.content[3]!.props.text).toBe('Ostatni heading z dodatkiem');
    expect(out.content[0]).toEqual(canvas().content[0]);
  });

  it('matches across collapsed whitespace and searches the whole canvas without a component', () => {
    const extraction = extract(canvas(), declarations, {
      kind: 'text',
      componentId: null,
      selectedText: 'Drugi\n nagłówek',
    });
    expect(extraction.segments.map((s) => s.text)).toEqual(['Drugi nagłówek']);
  });
});

describe('text scope — rich text', () => {
  it('splits one run when the selection stays inside it, keeping its marks', () => {
    const extraction = extract(canvas(), declarations, {
      kind: 'text',
      componentId: 'txt',
      selectedText: 'pogrubionym',
    });
    expect(extraction.segments.map((s) => [s.kind, s.text])).toEqual([['plain', 'pogrubionym']]);
    expect(extraction.scope.widened).toBe(false);
    const out = inject(canvas(), extraction, new Map([[extraction.segments[0]!.id, 'bold']]))
      .data as ReturnType<typeof canvas>;
    const paragraph = (out.content[2]!.props.tiptapContent as { content: Array<{ content: unknown[] }> }).content[0]!;
    expect(paragraph.content).toEqual([
      { type: 'text', text: 'Zwykły tekst przed  ' },
      { type: 'text', text: 'bold', marks: BOLD },
      { type: 'text', text: ' fragmentem', marks: BOLD },
      { type: 'text', text: ' i po nim.' },
    ]);
    const second = (out.content[2]!.props.tiptapContent as { content: unknown[] }).content[1];
    expect(second).toEqual(canvas().content[2]!.props.tiptapContent!.content[1]);
  });

  it('widens to the paragraph when the selection crosses a formatting boundary', () => {
    const extraction = extract(canvas(), declarations, {
      kind: 'text',
      componentId: 'txt',
      selectedText: 'przed pogrubionym',
    });
    expect(extraction.segments.map((s) => [s.kind, s.text])).toEqual([
      ['inline', 'Zwykły tekst przed  <0>pogrubionym fragmentem</0> i po nim.'],
    ]);
    expect(extraction.scope).toEqual({ kind: 'text', widened: true });
  });

  it('widens to every paragraph a multi-paragraph selection touches', () => {
    const extraction = extract(canvas(), declarations, {
      kind: 'text',
      componentId: 'txt',
      selectedText: 'po nim.\nDrugi akapit',
    });
    expect(extraction.segments.map((s) => s.kind)).toEqual(['inline', 'inline']);
    expect(extraction.scope.widened).toBe(true);
  });

  it('refuses a selection that is not in the block', () => {
    expect(() =>
      extract(canvas(), declarations, { kind: 'text', componentId: 'txt', selectedText: 'nie ma tego' }),
    ).toThrow(SelectionNotFoundError);
  });
});
