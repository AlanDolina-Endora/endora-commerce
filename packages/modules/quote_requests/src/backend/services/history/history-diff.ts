/**
 * Feature 146 (FR-012, FR-013, FR-015, FR-016, FR-036; contract
 * `admin-quote-request-api.md` §3, rule H3) — what changed between two
 * revision snapshots, as the admin History lists it.
 *
 * Pure: two snapshots and the variant labels in, a change list out. Lines pair
 * by the same rule the rewrites use (`pairLines`, customer mode: product and
 * variant, then packaging name, then order), so two variants of one product
 * never merge and a legacy snapshot without packaging keys still pairs by
 * product and variant. The validity change is not a snapshot property; the
 * projection adds it from the event payload (research R7).
 *
 * Packaging-unit and custom-field changes are never listed, and neither is the
 * product name — it carries the packaging suffix, so listing it would list a
 * packaging change under another name.
 */
import type {
  QuoteRequestHistoryChange,
  QuoteRequestHistoryLineRef,
} from '@endora-commerce/contracts';
import type { QuoteRequestRevisionLine } from '../../entities/quote-request-revision.entity.js';
import { pairLines } from '../line-carry-over.js';

/** The part of a revision the diff compares. */
export interface HistorySnapshot {
  headerNote: string | null;
  items: readonly QuoteRequestRevisionLine[];
}

export function historyDiff(
  before: HistorySnapshot,
  after: HistorySnapshot,
  variantLabels: ReadonlyMap<string, string> = new Map(),
): QuoteRequestHistoryChange[] {
  const changes: QuoteRequestHistoryChange[] = [];

  const beforeNote = before.headerNote ?? null;
  const afterNote = after.headerNote ?? null;
  if (beforeNote !== afterNote) {
    changes.push({ kind: 'header_note', before: beforeNote, after: afterNote });
  }

  const rows = before.items.map((item, index) => ({
    id: String(index),
    productId: item.productId,
    variantId: item.variantId ?? null,
    packagingUnitName: item.packagingUnitName ?? null,
    item,
  }));
  const { paired, removed } = pairLines(
    rows,
    after.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId ?? null,
      // An absent key (a snapshot written before feature 146) says nothing
      // about packaging: only product, variant and order decide.
      packagingUnitName: 'packagingUnitName' in item ? (item.packagingUnitName ?? null) : undefined,
    })),
    'customer',
  );

  const ref = (item: QuoteRequestRevisionLine): QuoteRequestHistoryLineRef => {
    const variantId = item.variantId ?? null;
    return {
      productId: item.productId,
      variantId,
      productName: item.productName,
      variantLabel: variantId !== null ? (variantLabels.get(variantId) ?? null) : null,
    };
  };

  after.items.forEach((next, index) => {
    const previous = paired[index]?.item ?? null;
    const line = ref(next);
    if (previous === null) {
      changes.push({
        kind: 'line_added',
        line,
        quantity: next.quantity,
        agreedUnitPrice: price(next.agreedUnitPrice),
        currency: next.lineCurrency,
      });
      return;
    }
    if (previous.quantity !== next.quantity) {
      changes.push({ kind: 'line_quantity', line, before: previous.quantity, after: next.quantity });
    }
    if (!samePrice(previous.agreedUnitPrice, next.agreedUnitPrice)) {
      changes.push({
        kind: 'line_agreed_unit_price',
        line,
        before: price(previous.agreedUnitPrice),
        after: price(next.agreedUnitPrice),
        currency: next.lineCurrency,
      });
    }
    if (!samePrice(previous.desiredUnitPrice, next.desiredUnitPrice)) {
      changes.push({
        kind: 'line_proposed_unit_price',
        line,
        before: price(previous.desiredUnitPrice),
        after: price(next.desiredUnitPrice),
        currency: next.lineCurrency,
      });
    }
    if ((previous.lineNote ?? null) !== (next.lineNote ?? null)) {
      changes.push({
        kind: 'line_note',
        line,
        before: previous.lineNote ?? null,
        after: next.lineNote ?? null,
      });
    }
  });

  for (const row of removed) {
    changes.push({ kind: 'line_removed', line: ref(row.item) });
  }

  return changes;
}

/** Two snapshot prices, compared as numbers (a legacy snapshot may hold a string). */
function samePrice(a: number | null | undefined, b: number | null | undefined): boolean {
  return price(a) === price(b);
}

/** A snapshot price as a number, or `null`. */
function price(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value);
}
