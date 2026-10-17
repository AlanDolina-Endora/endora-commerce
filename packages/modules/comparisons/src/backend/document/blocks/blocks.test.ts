import { describe, expect, it } from 'vitest';
import type { ComparisonDocumentData, DocumentRenderContext } from '@endora-commerce/contracts';
import { sampleComparisonData } from '../sample-comparison.js';
import { comparisonHeaderBlock } from './header.js';
import { comparisonShareLinkBlock } from './share-link.js';
import { comparisonTableBlock } from './table.js';
import type { ComparisonBlockRenderer, ComparisonPrepared } from '../types.js';

/**
 * `contracts/comparison-document.md` §3 — each block's document definition
 * for props × data edge cases (T032, T043).
 */

const context = (language: string): DocumentRenderContext => ({
  documentType: 'comparisons.comparison',
  language,
  salesChannelId: null,
  preview: false,
  pageWidth: 760,
});
const interpolate = (text: string): string => text;
const prepared: ComparisonPrepared = { images: new Map([['00000000-0000-4000-8000-00000000c010', 'data:image/png;base64,AA']]) };

function render(
  block: ComparisonBlockRenderer,
  props: Record<string, unknown>,
  data: ComparisonDocumentData = sampleComparisonData('en-US'),
  language = 'en-US',
) {
  return block.render({ props, data, prepared, language, context: context(language), interpolate }) as Record<string, unknown>;
}

const flat = (node: unknown): string => JSON.stringify(node);
type Table = { table: { body: Record<string, unknown>[][] } };
const tables = (out: Record<string, unknown>) => (out['stack'] as unknown[]).filter((n): n is Table => !!(n as Table).table);

describe('ComparisonTable', () => {
  it('one column per product, one row per shown attribute, image, name and price by default', () => {
    const out = render(comparisonTableBlock, {});
    const [table] = tables(out);
    expect(table!.table.body).toHaveLength(1 + 3);
    expect(table!.table.body[0]).toHaveLength(1 + 3);
    const text = flat(table!.table.body[0]);
    expect(text).toContain('data:image/png;base64,AA');
    expect(text).toContain('Sample product 1');
    expect(text).toMatch(/PLN\s?100\.99|100\.99/);
  });

  it('follows the display mode and the hide-empty-rows switch (FR-020)', () => {
    const data = sampleComparisonData('en-US');
    const differences = { ...data, view: { ...data.view, displayMode: 'differences' as const } };
    expect(tables(render(comparisonTableBlock, {}, differences))[0]!.table.body).toHaveLength(1 + 2);
    const withEmpty = {
      ...data,
      hideEmptyRows: true,
      view: {
        ...data.view,
        comparableAttributes: [
          ...data.view.comparableAttributes,
          { key: 'none', label: { 'en-US': 'Nothing' }, valueType: 'string' as const, values: [null, null, null], rowClass: 'different' as const },
        ],
      },
    };
    expect(tables(render(comparisonTableBlock, {}, withEmpty))[0]!.table.body).toHaveLength(1 + 3);
    expect(tables(render(comparisonTableBlock, {}, { ...withEmpty, hideEmptyRows: false }))[0]!.table.body).toHaveLength(1 + 4);
  });

  it('hides images and shows SKUs and availability when asked', () => {
    const header = flat(tables(render(comparisonTableBlock, { showImages: false, showSku: true, showAvailability: true, unavailableText: 'Out' }))[0]!.table.body[0]);
    expect(header).not.toContain('data:image');
    expect(header).toContain('SAMPLE-100');
    expect(header).toContain('Out');
  });

  it('prints the missing-value text for a null value and a null price', () => {
    const out = flat(render(comparisonTableBlock, { emptyValue: 'n/a' }));
    expect(out.match(/n\/a/g)?.length).toBe(2);
  });

  it('splits 16 products into tables of productsPerTable, never splitting a product', () => {
    const data = sampleComparisonData('en-US');
    const products = Array.from({ length: 16 }, (_, i) => ({ ...data.view.products[0]!, id: `p-${i}`, sku: `S${i}` }));
    const many = {
      ...data,
      view: {
        ...data.view,
        products,
        comparableAttributes: data.view.comparableAttributes.map((row) => ({ ...row, values: products.map(() => 'v') })),
      },
    };
    const out = tables(render(comparisonTableBlock, { productsPerTable: 4 }, many));
    expect(out).toHaveLength(4);
    expect(out.every((t) => t.table.body[0]!.length === 5)).toBe(true);
    expect(tables(render(comparisonTableBlock, { productsPerTable: 99 }, many))).toHaveLength(2);
  });

  it('says how many products are hidden and never names them (FR-021)', () => {
    const out = flat(render(comparisonTableBlock, { hiddenNoteText: '{{hiddenCount}} hidden' }));
    expect(out).toContain('1 hidden');
    expect(flat(render(comparisonTableBlock, { showHiddenNote: false }))).not.toContain('hidden');
  });

  it('prints Polish names and Polish money in Polish (FR-022)', () => {
    const out = flat(render(comparisonTableBlock, {}, sampleComparisonData('pl-PL'), 'pl-PL'));
    expect(out).toContain('Przykładowy produkt 1');
    expect(out).toContain('Kolor');
    expect(out).toMatch(/100,99/);
  });
});

describe('ComparisonHeader', () => {
  it('title, date in the language, mode caption and priced-for note', () => {
    const en = flat(render(comparisonHeaderBlock, { title: 'Offer' }));
    expect(en).toContain('Offer');
    expect(en).toContain('October 17, 2026');
    expect(en).toContain('All attributes');
    expect(en).toContain('Prices for your organisation.');
    const pl = flat(render(comparisonHeaderBlock, { modeLabelAll: 'Wszystkie' }, sampleComparisonData('pl-PL'), 'pl-PL'));
    expect(pl).toContain('17 października 2026');
    expect(pl).toContain('Wszystkie');
  });
  it('omits what is switched off', () => {
    const out = flat(render(comparisonHeaderBlock, { showDate: false, showDisplayMode: false, showPricedFor: false }));
    expect(out).not.toContain('2026');
    expect(out).not.toContain('attributes');
  });
});

describe('ComparisonShareLink', () => {
  it('prints the address and, when asked, a QR code', () => {
    const out = render(comparisonShareLinkBlock, { showQr: true, qrSize: 90 });
    expect(flat(out)).toContain('https://shop.example.com/compare/share/sample0token');
    expect(flat(out)).toContain('"qr"');
  });
  it('prints nothing when the channel has no storefront address', () => {
    expect(render(comparisonShareLinkBlock, {}, { ...sampleComparisonData('en-US'), shareUrl: null })).toEqual({ text: '' });
  });
});
