import { describe, expect, it } from 'vitest';
import type { DocumentRenderContext } from '@endora-commerce/contracts';
import { CORE_BLOCK_RENDERERS } from './core-blocks.js';

/** T018 — the six general-purpose blocks, with default and hostile props. */
const context: DocumentRenderContext = {
  documentType: 'acme.note',
  language: 'en-US',
  salesChannelId: null,
  preview: false,
  pageWidth: 500,
};
const interpolate = (text: string): string => text.replace('{{date}}', '17 October 2026');
const images = new Map([['logo', 'data:image/png;base64,AAAA']]);
const render = (name: keyof typeof CORE_BLOCK_RENDERERS, props: Record<string, unknown>) =>
  CORE_BLOCK_RENDERERS[name]({ props, interpolate, images, context }) as Record<string, unknown>;

describe('core blocks — defaults', () => {
  it('Heading prints its text at the level size, bold', () => {
    const out = render('document_templates.Heading', { text: 'Offer', level: 2 });
    expect(out).toMatchObject({ text: 'Offer', fontSize: 16, bold: true, alignment: 'left' });
  });
  it('Text interpolates merge fields', () => {
    expect(render('document_templates.Text', { text: 'Today {{date}}' })).toMatchObject({ text: 'Today 17 October 2026' });
  });
  it('Image prints the inlined asset, fitted', () => {
    expect(render('document_templates.Image', { assetId: 'logo', width: 120, maxHeight: 60, align: 'center' })).toMatchObject({
      image: 'data:image/png;base64,AAAA',
      fit: [120, 60],
      alignment: 'center',
    });
  });
  it('Image prints nothing for an asset that did not load', () => {
    expect(render('document_templates.Image', { assetId: 'gone' })).toEqual({ text: '' });
  });
  it('Spacer reserves its height', () => {
    expect(render('document_templates.Spacer', { height: 30 })).toMatchObject({ margin: [0, 0, 0, 30] });
  });
  it('Divider draws a line across the given share of the usable width', () => {
    const out = render('document_templates.Divider', { thickness: 2, widthPercent: 50, style: 'dashed', color: '#ff0000' });
    const line = (out['canvas'] as Record<string, unknown>[])[0]!;
    expect(line).toMatchObject({ type: 'line', x1: 0, x2: 250, lineWidth: 2, lineColor: '#ff0000', dash: { length: 4 } });
  });
  it('PageBreak breaks the page after itself', () => {
    expect(render('document_templates.PageBreak', {})).toMatchObject({ pageBreak: 'after' });
  });
});

describe('core blocks — hostile props never throw and never leak', () => {
  const hostile = {
    text: { toString: 'x' },
    level: 'nine',
    fontSize: -50,
    color: 'red; font-size: 400',
    align: 'justify',
    assetId: ['logo'],
    width: 1e9,
    maxHeight: Number.NaN,
    height: 1e9,
    thickness: -2,
    widthPercent: 500,
    style: 'wavy',
    marginTop: 'a lot',
    bold: 'yes',
  };
  it.each(Object.keys(CORE_BLOCK_RENDERERS))('%s answers a node with clamped values', (name) => {
    const out = render(name as keyof typeof CORE_BLOCK_RENDERERS, hostile);
    expect(out).toBeTypeOf('object');
    const json = JSON.stringify(out);
    expect(json).not.toContain('font-size: 400');
    expect(json).not.toContain('1000000000');
  });
  it('a text that is not a string prints empty', () => {
    expect(render('document_templates.Text', hostile)['text']).toBe('');
  });
  it('a level outside 1–3 falls back to 1', () => {
    expect(render('document_templates.Heading', { text: 'x', level: 9 })['fontSize']).toBe(20);
  });
});
