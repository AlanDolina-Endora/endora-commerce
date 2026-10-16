import { describe, expect, it } from 'vitest';
import type { PriceMatrixEntry } from '@endora-commerce/contracts';
import {
  formatMatrixPrice,
  formatQuantityWindow,
  matrixSelectionSummary,
} from './price-matrix-format.js';

/**
 * Feature 148 — the pure formatting of the *Price matrix* table
 * (`contracts/admin-ui-price-matrix.md` §3): the selection summary, the
 * quantity window and the price, so the table component only lays them out.
 */
const t = (key: string, params?: Record<string, string | number>): string =>
  params ? `${key}(${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(',')})` : key;

function entry(over: Partial<PriceMatrixEntry>): PriceMatrixEntry {
  return {
    id: 'e1',
    priceListId: 'l1',
    selectionKind: 'all',
    productId: null,
    categoryId: null,
    attribute: null,
    organizationId: null,
    minQuantity: 1,
    maxQuantity: null,
    price: { type: 'discount_percent', percent: '12' },
    active: true,
    inactiveReason: null,
    targetDeleted: false,
    labels: { product: null, category: null, attribute: null, organization: null },
    createdAt: '2026-10-16T00:00:00.000Z',
    updatedAt: '2026-10-16T00:00:00.000Z',
    ...over,
  };
}

describe('formatQuantityWindow', () => {
  it('writes an open window as N+ and a closed one as a range', () => {
    expect(formatQuantityWindow(500, null)).toBe('500+');
    expect(formatQuantityWindow(1, 99)).toBe('1–99');
    expect(formatQuantityWindow(5, 5)).toBe('5');
  });
});

describe('formatMatrixPrice', () => {
  it('writes a fixed price with at least two decimals and its currency', () => {
    expect(formatMatrixPrice({ type: 'fixed', amount: '9.5', currencyCode: 'PLN' })).toBe('9.50 PLN');
    expect(formatMatrixPrice({ type: 'fixed', amount: '95', currencyCode: 'EUR' })).toBe('95.00 EUR');
    expect(formatMatrixPrice({ type: 'fixed', amount: '0.0525', currencyCode: 'PLN' })).toBe('0.0525 PLN');
  });

  it('writes a percentage as a discount with a true minus sign', () => {
    expect(formatMatrixPrice({ type: 'discount_percent', percent: '12' })).toBe('−12%');
    expect(formatMatrixPrice({ type: 'discount_percent', percent: '12.5' })).toBe('−12.5%');
  });
});

describe('matrixSelectionSummary', () => {
  it('names every selection kind from the server-resolved labels', () => {
    expect(matrixSelectionSummary(entry({}), t)).toBe('priceMatrix.selection.allProducts');
    expect(
      matrixSelectionSummary(
        entry({ selectionKind: 'product', productId: 'p', labels: { product: { sku: 'SKU-1', name: 'Bolt' }, category: null, attribute: null, organization: null } }),
        t,
      ),
    ).toBe('SKU-1 — Bolt');
    expect(
      matrixSelectionSummary(entry({ selectionKind: 'category', categoryId: 'c', labels: { product: null, category: 'Fasteners', attribute: null, organization: null } }), t),
    ).toBe('Fasteners');
    expect(
      matrixSelectionSummary(
        entry({
          selectionKind: 'attribute',
          attribute: { key: 'material', value: 'steel' },
          labels: { product: null, category: null, attribute: { label: 'Material', valueLabel: 'Steel' }, organization: null },
        }),
        t,
      ),
    ).toBe('Material: Steel');
    expect(
      matrixSelectionSummary(
        entry({
          selectionKind: 'category_attribute',
          categoryId: 'c',
          attribute: { key: 'material', value: 'steel' },
          labels: { product: null, category: 'Fasteners', attribute: { label: 'Material', valueLabel: 'Steel' }, organization: null },
        }),
        t,
      ),
    ).toBe('Fasteners ∩ Material: Steel');
  });

  it('translates a boolean attribute value', () => {
    expect(
      matrixSelectionSummary(
        entry({
          selectionKind: 'attribute',
          attribute: { key: 'atex', value: 'true' },
          labels: { product: null, category: null, attribute: { label: 'ATEX', valueLabel: 'true' }, organization: null },
        }),
        t,
        new Set(['atex']),
      ),
    ).toBe('ATEX: priceMatrix.attribute.boolean.true');
  });

  it('marks a deleted target instead of leaving a blank', () => {
    expect(
      matrixSelectionSummary(entry({ selectionKind: 'category', categoryId: 'c', targetDeleted: true }), t),
    ).toBe('priceMatrix.targetDeleted');
  });
});
