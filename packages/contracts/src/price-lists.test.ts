import { describe, expect, it } from 'vitest';
import { ADMIN_PRODUCT_SELECTION_MAX } from './catalog.js';
import {
  bulkAddPriceListProductsRequestSchema,
  bulkAddPriceListProductsResponseSchema,
  bulkAddPriceListProductsResultSchema,
  priceListIdParamsSchema,
} from './price-lists.js';

/** A distinct, valid v4-shaped uuid per index. */
function uuid(i: number): string {
  return `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`;
}

function ids(count: number): string[] {
  return Array.from({ length: count }, (_, i) => uuid(i + 1));
}

describe('ADMIN_PRODUCT_SELECTION_MAX', () => {
  it('is the 200-product cap of one selection', () => {
    expect(ADMIN_PRODUCT_SELECTION_MAX).toBe(200);
  });
});

describe('bulkAddPriceListProductsRequestSchema', () => {
  it('rejects a body without productIds', () => {
    expect(bulkAddPriceListProductsRequestSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an empty selection', () => {
    expect(bulkAddPriceListProductsRequestSchema.safeParse({ productIds: [] }).success).toBe(false);
  });

  it('rejects one id over the cap', () => {
    const body = { productIds: ids(ADMIN_PRODUCT_SELECTION_MAX + 1) };
    expect(bulkAddPriceListProductsRequestSchema.safeParse(body).success).toBe(false);
  });

  it('rejects a member that is not a uuid', () => {
    const body = { productIds: [uuid(1), 'not-a-uuid'] };
    expect(bulkAddPriceListProductsRequestSchema.safeParse(body).success).toBe(false);
  });

  it('accepts a single id', () => {
    const body = { productIds: [uuid(1)] };
    expect(bulkAddPriceListProductsRequestSchema.parse(body)).toEqual(body);
  });

  it('accepts exactly the cap', () => {
    const body = { productIds: ids(ADMIN_PRODUCT_SELECTION_MAX) };
    expect(bulkAddPriceListProductsRequestSchema.parse(body).productIds).toHaveLength(200);
  });
});

const RESULT = {
  added: [uuid(1)],
  unchanged: [uuid(2)],
  failed: [{ productId: uuid(3), reason: 'product_not_found' }],
};

describe('bulkAddPriceListProductsResultSchema', () => {
  it('parses added, unchanged and failed with product_not_found', () => {
    expect(bulkAddPriceListProductsResultSchema.parse(RESULT)).toEqual(RESULT);
  });

  it('rejects a failure reason it does not know', () => {
    const result = { ...RESULT, failed: [{ productId: uuid(3), reason: 'product_archived' }] };
    expect(bulkAddPriceListProductsResultSchema.safeParse(result).success).toBe(false);
  });
});

describe('bulkAddPriceListProductsResponseSchema', () => {
  it('wraps the result in data', () => {
    expect(bulkAddPriceListProductsResponseSchema.parse({ data: RESULT })).toEqual({ data: RESULT });
  });

  it('rejects the bare result', () => {
    expect(bulkAddPriceListProductsResponseSchema.safeParse(RESULT).success).toBe(false);
  });
});

describe('priceListIdParamsSchema', () => {
  it('accepts a uuid id and rejects anything else', () => {
    expect(priceListIdParamsSchema.parse({ id: uuid(1) })).toEqual({ id: uuid(1) });
    expect(priceListIdParamsSchema.safeParse({ id: 'default' }).success).toBe(false);
  });
});
