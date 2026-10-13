import { describe, expect, it } from 'vitest';
import { partitionBulkAdd } from './bulk-add-partition.js';

/**
 * Feature 145 / US4 — the pure partition behind
 * `POST /api/v1/admin/price-lists-engine/:id/products/bulk-add`
 * (`specs/145-admin-product-picker/contracts/price-list-bulk-add.md`).
 *
 * Precedence is the contract: an id already on the roster is `unchanged`
 * even when its product has since been soft-deleted; only an id that is
 * neither on the roster nor live is `failed`.
 */
const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';
const D = '00000000-0000-4000-8000-00000000000d';
const E = '00000000-0000-4000-8000-00000000000e';

describe('partitionBulkAdd', () => {
  it('puts every new live id in added, in request order', () => {
    const r = partitionBulkAdd({
      requested: [C, A, B],
      onRoster: new Set(),
      live: new Set([A, B, C]),
    });
    expect(r).toEqual({ added: [C, A, B], unchanged: [], failed: [] });
  });

  it('de-duplicates, keeping the first occurrence', () => {
    const r = partitionBulkAdd({
      requested: [B, A, B, A, C],
      onRoster: new Set(),
      live: new Set([A, B, C]),
    });
    expect(r.added).toEqual([B, A, C]);
  });

  it('reports a roster id as unchanged before checking that it is live', () => {
    const r = partitionBulkAdd({
      requested: [A, B],
      onRoster: new Set([A]),
      live: new Set([B]),
    });
    expect(r).toEqual({ added: [B], unchanged: [A], failed: [] });
  });

  it('fails an id that is neither on the roster nor live, with product_not_found', () => {
    const r = partitionBulkAdd({
      requested: [A, B, C],
      onRoster: new Set(),
      live: new Set([A]),
    });
    expect(r.failed).toEqual([
      { productId: B, reason: 'product_not_found' },
      { productId: C, reason: 'product_not_found' },
    ]);
    expect(r.added).toEqual([A]);
  });

  it('places every unique id in exactly one bucket', () => {
    const requested = [A, B, C, D, E, A, D];
    const r = partitionBulkAdd({
      requested,
      onRoster: new Set([B, E]),
      live: new Set([A, B, D]),
    });
    const seen = [...r.added, ...r.unchanged, ...r.failed.map((f) => f.productId)];
    expect(seen).toHaveLength(new Set(requested).size);
    expect(new Set(seen)).toEqual(new Set(requested));
    expect(r).toEqual({
      added: [A, D],
      unchanged: [B, E],
      failed: [{ productId: C, reason: 'product_not_found' }],
    });
  });

  it('answers three empty buckets for an empty request', () => {
    expect(partitionBulkAdd({ requested: [], onRoster: new Set(), live: new Set() })).toEqual({
      added: [],
      unchanged: [],
      failed: [],
    });
  });
});
