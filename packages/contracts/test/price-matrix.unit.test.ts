import { describe, expect, it } from 'vitest';
import {
  PRICE_MATRIX_MAX_ENTRIES_PER_LIST,
  priceMatrixEntryInputSchema,
  priceMatrixEntryPatchSchema,
  priceMatrixEntrySchema,
  priceMatrixListQuerySchema,
  priceMatrixSelectionKind,
} from '../src/price-lists.js';

/**
 * Feature 148 — price list matrix entries. The schemas mirror the CHECK
 * constraints of `price_list_matrix_entries` (data-model §1) so a shape the
 * database would refuse is refused at the edge with a field path, not as a
 * constraint violation.
 */
const ORG = '11111111-1111-4111-8111-111111111111';
const PRODUCT = '22222222-2222-4222-8222-222222222222';
const CATEGORY = '33333333-3333-4333-8333-333333333333';

function issues(input: unknown): string[] {
  const out = priceMatrixEntryInputSchema.safeParse(input);
  return out.success ? [] : out.error.issues.map((i) => i.path.join('.'));
}

describe('priceMatrixEntryInputSchema', () => {
  it('accepts a category × organization × percentage entry and defaults the absent coordinates', () => {
    const parsed = priceMatrixEntryInputSchema.parse({
      categoryId: CATEGORY,
      organizationId: ORG,
      minQuantity: 500,
      price: { type: 'discount_percent', percent: '12' },
    });
    expect(parsed).toEqual({
      productId: null,
      categoryId: CATEGORY,
      attribute: null,
      organizationId: ORG,
      minQuantity: 500,
      maxQuantity: null,
      price: { type: 'discount_percent', percent: '12' },
    });
  });

  it('accepts a product × organization × fixed entry', () => {
    expect(
      issues({
        productId: PRODUCT,
        organizationId: ORG,
        minQuantity: 1,
        maxQuantity: 99,
        price: { type: 'fixed', amount: '95.00', currencyCode: 'PLN' },
      }),
    ).toEqual([]);
  });

  it('requires an organization on a product selection', () => {
    expect(
      issues({
        productId: PRODUCT,
        minQuantity: 1,
        price: { type: 'fixed', amount: '95', currencyCode: 'PLN' },
      }),
    ).toEqual(['organizationId']);
  });

  it('refuses a product selection combined with a category or an attribute', () => {
    expect(
      issues({
        productId: PRODUCT,
        categoryId: CATEGORY,
        organizationId: ORG,
        minQuantity: 1,
        price: { type: 'discount_percent', percent: '5' },
      }),
    ).toEqual(['productId']);
    expect(
      issues({
        productId: PRODUCT,
        attribute: { key: 'material', value: 'steel' },
        organizationId: ORG,
        minQuantity: 1,
        price: { type: 'discount_percent', percent: '5' },
      }),
    ).toEqual(['productId']);
  });

  it('refuses a fixed price on all products', () => {
    expect(
      issues({ minQuantity: 1, price: { type: 'fixed', amount: '9.50', currencyCode: 'PLN' } }),
    ).toEqual(['price.type']);
  });

  it('requires amount and a currency code on a fixed price', () => {
    expect(
      issues({ categoryId: CATEGORY, minQuantity: 1, price: { type: 'fixed', amount: '9.50' } }),
    ).toEqual(['price.currencyCode']);
    expect(
      issues({
        categoryId: CATEGORY,
        minQuantity: 1,
        price: { type: 'fixed', amount: '-1', currencyCode: 'PLN' },
      }),
    ).toEqual(['price.amount']);
    expect(
      issues({
        categoryId: CATEGORY,
        minQuantity: 1,
        price: { type: 'fixed', amount: '1.00001', currencyCode: 'PLN' },
      }),
    ).toEqual(['price.amount']);
  });

  it('bounds a percentage to 0 < p ≤ 100 with at most two decimals', () => {
    const at = (percent: string) =>
      issues({ minQuantity: 1, price: { type: 'discount_percent', percent } });
    expect(at('100')).toEqual([]);
    expect(at('0.01')).toEqual([]);
    expect(at('12.5')).toEqual([]);
    expect(at('0')).toEqual(['price.percent']);
    expect(at('0.00')).toEqual(['price.percent']);
    expect(at('100.01')).toEqual(['price.percent']);
    expect(at('12.345')).toEqual(['price.percent']);
    expect(at('-5')).toEqual(['price.percent']);
  });

  it('refuses a quantity window whose end precedes its start', () => {
    expect(
      issues({
        categoryId: CATEGORY,
        minQuantity: 100,
        maxQuantity: 99,
        price: { type: 'discount_percent', percent: '5' },
      }),
    ).toEqual(['maxQuantity']);
    expect(issues({ minQuantity: 0, price: { type: 'discount_percent', percent: '5' } })).toEqual([
      'minQuantity',
    ]);
  });

  it('bounds attribute key and value lengths', () => {
    const at = (key: string, value: string) =>
      issues({ attribute: { key, value }, minQuantity: 1, price: { type: 'discount_percent', percent: '5' } });
    expect(at('material', 'steel')).toEqual([]);
    expect(at('', 'steel')).toEqual(['attribute.key']);
    expect(at('k'.repeat(65), 'steel')).toEqual(['attribute.key']);
    expect(at('material', '')).toEqual(['attribute.value']);
    expect(at('material', 'v'.repeat(256))).toEqual(['attribute.value']);
  });
});

describe('priceMatrixSelectionKind', () => {
  it('derives the kind from which coordinates are set', () => {
    const attribute = { key: 'material', value: 'steel' };
    expect(priceMatrixSelectionKind({ productId: PRODUCT, categoryId: null, attribute: null })).toBe('product');
    expect(priceMatrixSelectionKind({ productId: null, categoryId: CATEGORY, attribute })).toBe('category_attribute');
    expect(priceMatrixSelectionKind({ productId: null, categoryId: null, attribute })).toBe('attribute');
    expect(priceMatrixSelectionKind({ productId: null, categoryId: CATEGORY, attribute: null })).toBe('category');
    expect(priceMatrixSelectionKind({ productId: null, categoryId: null, attribute: null })).toBe('all');
  });
});

describe('priceMatrixEntryPatchSchema', () => {
  it('refuses an empty body', () => {
    const out = priceMatrixEntryPatchSchema.safeParse({});
    expect(out.success).toBe(false);
    expect(out.success ? null : out.error.issues[0]?.message).toBe('patch_body_empty');
  });

  it('accepts any single field, leaving the rest absent', () => {
    expect(priceMatrixEntryPatchSchema.parse({ minQuantity: 10 })).toEqual({ minQuantity: 10 });
    expect(priceMatrixEntryPatchSchema.parse({ organizationId: null })).toEqual({ organizationId: null });
  });
});

describe('priceMatrixListQuerySchema', () => {
  it('defaults paging and coerces query-string numbers', () => {
    expect(priceMatrixListQuerySchema.parse({})).toEqual({ page: 0, pageSize: 50 });
    expect(priceMatrixListQuerySchema.parse({ page: '2', pageSize: '200' })).toMatchObject({
      page: 2,
      pageSize: 200,
    });
  });

  it('bounds the page size', () => {
    expect(priceMatrixListQuerySchema.safeParse({ pageSize: '0' }).success).toBe(false);
    expect(priceMatrixListQuerySchema.safeParse({ pageSize: '201' }).success).toBe(false);
    expect(priceMatrixListQuerySchema.safeParse({ page: '-1' }).success).toBe(false);
  });

  it("accepts 'none' or a uuid as the organization filter", () => {
    expect(priceMatrixListQuerySchema.parse({ organizationId: 'none' }).organizationId).toBe('none');
    expect(priceMatrixListQuerySchema.parse({ organizationId: ORG }).organizationId).toBe(ORG);
    expect(priceMatrixListQuerySchema.safeParse({ organizationId: 'acme' }).success).toBe(false);
  });

  it('accepts a selection-kind filter', () => {
    expect(priceMatrixListQuerySchema.parse({ selectionKind: 'category' }).selectionKind).toBe('category');
    expect(priceMatrixListQuerySchema.safeParse({ selectionKind: 'brand' }).success).toBe(false);
  });
});

describe('priceMatrixEntrySchema', () => {
  const entry = {
    id: '44444444-4444-4444-8444-444444444444',
    priceListId: '55555555-5555-4555-8555-555555555555',
    selectionKind: 'attribute',
    productId: null,
    categoryId: null,
    attribute: { key: 'material', value: 'steel' },
    organizationId: null,
    minQuantity: 1,
    maxQuantity: null,
    price: { type: 'discount_percent', percent: '10' },
    active: false,
    inactiveReason: 'attribute_not_flagged',
    targetDeleted: false,
    labels: {
      product: null,
      category: null,
      attribute: { label: 'Material', valueLabel: 'Steel' },
      organization: null,
    },
    createdAt: '2026-10-16T10:00:00.000Z',
    updatedAt: '2026-10-16T10:00:00.000Z',
  };

  it('parses an entry DTO including its derived activity and deletion markers', () => {
    expect(priceMatrixEntrySchema.parse(entry)).toEqual(entry);
  });

  it('refuses an unknown inactive reason', () => {
    expect(priceMatrixEntrySchema.safeParse({ ...entry, inactiveReason: 'because' }).success).toBe(false);
  });
});

describe('PRICE_MATRIX_MAX_ENTRIES_PER_LIST', () => {
  it('is the product decision of 5 000 entries per list', () => {
    expect(PRICE_MATRIX_MAX_ENTRIES_PER_LIST).toBe(5000);
  });
});
