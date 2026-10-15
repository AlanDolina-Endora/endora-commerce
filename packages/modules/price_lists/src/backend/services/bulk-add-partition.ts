import type { BulkAddPriceListProductsResult } from '@endora-commerce/contracts';

export interface BulkAddPartitionInput {
  /** The ids as the request sent them — duplicates and order included. */
  requested: readonly string[];
  /** Ids already on the price list's roster. */
  onRoster: ReadonlySet<string>;
  /** Ids the catalogue answers as live (not soft-deleted). */
  live: ReadonlySet<string>;
}

/**
 * Feature 145 / US4 — sorts a bulk-add request into the three outcomes of
 * `contracts/price-list-bulk-add.md`.
 *
 * Ids are de-duplicated keeping the first occurrence. An id on the roster is
 * `unchanged` before anything else is asked of it, so a product already on the
 * list but since soft-deleted never reads as a failure; an id that is neither
 * on the roster nor live is `failed: product_not_found`; the rest are `added`,
 * in request order.
 */
export function partitionBulkAdd(input: BulkAddPartitionInput): BulkAddPriceListProductsResult {
  const added: string[] = [];
  const unchanged: string[] = [];
  const failed: BulkAddPriceListProductsResult['failed'] = [];
  const seen = new Set<string>();
  for (const id of input.requested) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (input.onRoster.has(id)) unchanged.push(id);
    else if (!input.live.has(id)) failed.push({ productId: id, reason: 'product_not_found' });
    else added.push(id);
  }
  return { added, unchanged, failed };
}
