import { describe, expect, it } from 'vitest';
import { decodeInline, encodeInline, textblockPaths, type TiptapNode } from './tiptap-inline-codec.js';

/** Feature 151, T015 — one segment per textblock, marked runs as numbered tags (research R6). */

const LINK = { type: 'link', attrs: { href: 'https://example.com/promo', target: '_blank' } };
const BOLD = { type: 'bold' };

const paragraph: TiptapNode = {
  type: 'paragraph',
  attrs: { textAlign: 'center' },
  content: [
    { type: 'text', text: 'Kup ' },
    { type: 'text', text: 'teraz', marks: [BOLD] },
    { type: 'text', text: ' i ' },
    { type: 'text', text: 'oszczędź', marks: [LINK] },
    { type: 'hardBreak' },
    { type: 'text', text: 'Cześć {{customer.firstName}} <3' },
    { type: 'mention', attrs: { id: 'x' } },
  ],
};

describe('encodeInline', () => {
  it('wraps marked runs in numbered tags, breaks as <br/>, inline nodes as <n/>', () => {
    const { text } = encodeInline(paragraph);
    expect(text).toBe('Kup <0>teraz</0> i <1>oszczędź</1><br/>Cześć {{customer.firstName}} &lt;3<2/>');
  });

  it('never puts a link target in the text', () => {
    expect(encodeInline(paragraph).text).not.toContain('example.com');
  });
});

describe('decodeInline', () => {
  const encoded = encodeInline(paragraph);

  it('restores marks, breaks and inline nodes, and keeps node attrs to the caller', () => {
    const content = decodeInline(
      'Buy <0>now</0> and <1>save</1><br/>Hi {{customer.firstName}} &lt;3<2/>',
      encoded,
    );
    expect(content).toEqual([
      { type: 'text', text: 'Buy ' },
      { type: 'text', text: 'now', marks: [BOLD] },
      { type: 'text', text: ' and ' },
      { type: 'text', text: 'save', marks: [LINK] },
      { type: 'hardBreak' },
      { type: 'text', text: 'Hi {{customer.firstName}} <3' },
      { type: 'mention', attrs: { id: 'x' } },
    ]);
  });

  it('accepts reordered tags', () => {
    expect(decodeInline('<1>Save</1> <0>now</0><br/>x<2/>', encoded)).not.toBeNull();
  });

  it.each([
    ['a missing tag', 'Buy now and <1>save</1><br/>x<2/>'],
    ['a duplicated tag', '<0>a</0><0>b</0><1>c</1><br/>x<2/>'],
    ['an unknown tag', '<0>a</0><1>c</1><9>d</9><br/>x<2/>'],
    ['an unclosed tag', '<0>a<1>c</1><br/>x<2/>'],
    ['nested tags', '<0>a <1>c</1></0><br/>x<2/>'],
    ['a missing break', '<0>a</0><1>c</1> x<2/>'],
    ['a missing inline node', '<0>a</0><1>c</1><br/>x'],
    ['a stray angle bracket', '<0>a</0><1>c</1><br/>x<2/> <b>'],
  ])('rejects %s', (_label, translated) => {
    expect(decodeInline(translated, encoded)).toBeNull();
  });

  it('drops empty text nodes', () => {
    const plain: TiptapNode = { type: 'paragraph', content: [{ type: 'text', text: 'A', marks: [BOLD] }] };
    const enc = encodeInline(plain);
    expect(decodeInline('<0></0>', enc)).toEqual([]);
  });
});

describe('textblockPaths', () => {
  it('finds paragraphs and headings inside lists, quotes and tables, and skips code blocks', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'T' }] },
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'L' }] }] }],
        },
        { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Q' }] }] },
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'C' }] }] }],
            },
          ],
        },
        { type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1;' }] },
        { type: 'paragraph' },
      ],
    };
    expect(textblockPaths(doc)).toEqual([[0], [1, 0, 0], [2, 0], [3, 0, 0, 0]]);
  });
});
