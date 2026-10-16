import { describe, expect, it } from 'vitest';
import type { PriceMatrixEntryShape } from '@endora-commerce/contracts';
import {
  currenciesOverlap,
  entryShapeFromRow,
  findOverlappingEntry,
  isAtMatrixLimit,
  mergeEntryPatch,
  quantityWindowsOverlap,
  rowFieldsFromShape,
  validateEntryShape,
} from './matrix-entry-rules.js';
import type { MatrixEntryRow } from './matrix-price-resolver.js';

/**
 * Feature 148 — the write-side rules of a price matrix entry that need no
 * database: the shape refinements (mirroring the table's CHECKs), overlap
 * (FR-005), the per-list limit (FR-007) and PATCH's merge-then-validate.
 */
const ORG = 'org-1';
const CAT = 'cat-1';

function shape(over: Partial<PriceMatrixEntryShape>): PriceMatrixEntryShape {
  return {
    productId: null,
    categoryId: CAT,
    attribute: null,
    organizationId: ORG,
    minQuantity: 1,
    maxQuantity: null,
    price: { type: 'discount_percent', percent: '10' },
    ...over,
  };
}

function row(over: Partial<MatrixEntryRow>): MatrixEntryRow {
  return {
    id: 'existing',
    priceListId: 'list',
    productId: null,
    categoryId: CAT,
    attributeKey: null,
    attributeValue: null,
    organizationId: ORG,
    minQuantity: 1,
    maxQuantity: null,
    priceType: 'discount_percent',
    amount: null,
    currencyCode: null,
    discountPercent: '10.00',
    ...over,
  };
}

describe('validateEntryShape', () => {
  it('accepts a valid entry', () => {
    expect(validateEntryShape(shape({}))).toEqual([]);
  });

  it('applies the CHECK-mirroring refinements to a merged entry', () => {
    expect(validateEntryShape(shape({ productId: 'p', categoryId: CAT })).map((i) => i.path.join('.'))).toEqual([
      'productId',
    ]);
    expect(
      validateEntryShape(shape({ productId: 'p', categoryId: null, organizationId: null })).map((i) => i.path.join('.')),
    ).toEqual(['organizationId']);
    expect(validateEntryShape(shape({ minQuantity: 10, maxQuantity: 5 })).map((i) => i.path.join('.'))).toEqual([
      'maxQuantity',
    ]);
    expect(
      validateEntryShape(
        shape({ categoryId: null, price: { type: 'fixed', amount: '1', currencyCode: 'PLN' } }),
      ).map((i) => i.path.join('.')),
    ).toEqual(['price.type']);
  });
});

describe('quantityWindowsOverlap', () => {
  it('compares closed and open-ended windows', () => {
    expect(quantityWindowsOverlap({ min: 1, max: 99 }, { min: 100, max: null })).toBe(false);
    expect(quantityWindowsOverlap({ min: 1, max: 100 }, { min: 100, max: null })).toBe(true);
    expect(quantityWindowsOverlap({ min: 500, max: null }, { min: 1, max: null })).toBe(true);
    expect(quantityWindowsOverlap({ min: 10, max: 20 }, { min: 1, max: 9 })).toBe(false);
  });
});

describe('currenciesOverlap', () => {
  it('treats a percentage (no currency) as intersecting every currency', () => {
    expect(currenciesOverlap('PLN', 'PLN')).toBe(true);
    expect(currenciesOverlap('PLN', 'EUR')).toBe(false);
    expect(currenciesOverlap(null, 'EUR')).toBe(true);
    expect(currenciesOverlap('PLN', null)).toBe(true);
    expect(currenciesOverlap(null, null)).toBe(true);
  });
});

describe('findOverlappingEntry', () => {
  it('finds an entry with identical coordinates and an intersecting window', () => {
    const existing = row({ minQuantity: 100 });
    expect(findOverlappingEntry(shape({ minQuantity: 1, maxQuantity: 200 }), [existing])?.id).toBe('existing');
  });

  it('ignores entries with different coordinates', () => {
    expect(findOverlappingEntry(shape({}), [row({ organizationId: 'org-2' })])).toBeNull();
    expect(findOverlappingEntry(shape({}), [row({ organizationId: null })])).toBeNull();
    expect(findOverlappingEntry(shape({}), [row({ categoryId: 'cat-2' })])).toBeNull();
    expect(
      findOverlappingEntry(shape({ attribute: { key: 'material', value: 'steel' } }), [
        row({ attributeKey: 'material', attributeValue: 'brass' }),
      ]),
    ).toBeNull();
  });

  it('ignores a disjoint window or a disjoint fixed currency', () => {
    expect(findOverlappingEntry(shape({ minQuantity: 1, maxQuantity: 99 }), [row({ minQuantity: 100 })])).toBeNull();
    const fixed = { type: 'fixed' as const, amount: '1', currencyCode: 'PLN' };
    expect(
      findOverlappingEntry(shape({ price: fixed }), [
        row({ priceType: 'fixed', amount: '2.0000', currencyCode: 'EUR', discountPercent: null }),
      ]),
    ).toBeNull();
  });

  it('counts a percentage as overlapping a fixed price in any currency', () => {
    const fixed = row({ priceType: 'fixed', amount: '2.0000', currencyCode: 'EUR', discountPercent: null });
    expect(findOverlappingEntry(shape({}), [fixed])?.id).toBe('existing');
  });

  it('excludes the entry being edited', () => {
    expect(findOverlappingEntry(shape({}), [row({})], 'existing')).toBeNull();
  });
});

describe('isAtMatrixLimit', () => {
  it('refuses the 5 001st entry', () => {
    expect(isAtMatrixLimit(4999)).toBe(false);
    expect(isAtMatrixLimit(5000)).toBe(true);
  });
});

describe('mergeEntryPatch', () => {
  it('overlays present fields and keeps the rest', () => {
    const merged = mergeEntryPatch(shape({}), { minQuantity: 50, organizationId: null });
    expect(merged).toEqual(shape({ minQuantity: 50, organizationId: null }));
  });

  it('can move an entry between selection kinds', () => {
    const merged = mergeEntryPatch(shape({}), { categoryId: null, productId: 'p-1' });
    expect(merged.productId).toBe('p-1');
    expect(merged.categoryId).toBeNull();
  });
});

describe('row ↔ shape', () => {
  it('round-trips a fixed and a percentage entry', () => {
    const fixed = shape({ price: { type: 'fixed', amount: '9.5', currencyCode: 'PLN' }, attribute: { key: 'm', value: 'v' } });
    expect(rowFieldsFromShape(fixed)).toEqual({
      productId: null,
      categoryId: CAT,
      attributeKey: 'm',
      attributeValue: 'v',
      organizationId: ORG,
      minQuantity: 1,
      maxQuantity: null,
      priceType: 'fixed',
      amount: '9.5',
      currencyCode: 'PLN',
      discountPercent: null,
    });
    expect(entryShapeFromRow(row({ discountPercent: '12.50' })).price).toEqual({
      type: 'discount_percent',
      percent: '12.5',
    });
    expect(
      entryShapeFromRow(row({ priceType: 'fixed', amount: '9.5000', currencyCode: 'PLN', discountPercent: null })).price,
    ).toEqual({ type: 'fixed', amount: '9.5', currencyCode: 'PLN' });
  });
});
