import { describe, expect, it } from 'vitest';
import { quoteRequestHistoryChangeSchema } from '@endora-commerce/contracts';
import type { QuoteRequestRevisionLine } from '../../entities/quote-request-revision.entity.js';
import { historyDiff, type HistorySnapshot } from './history-diff.js';

/**
 * Feature 146, Phase 8 (T050) — what changed between two revision snapshots,
 * as the admin History lists it (FR-012, FR-013, FR-015, FR-016, FR-036;
 * contract §3 H3). Pure: snapshots in, change list out.
 */

const P = '11111111-1111-4111-8111-111111111111';
const Q = '22222222-2222-4222-8222-222222222222';
const R = '33333333-3333-4333-8333-333333333333';
const V1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const V2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';

function line(extra: Partial<QuoteRequestRevisionLine> = {}): QuoteRequestRevisionLine {
  return {
    productId: P,
    variantId: null,
    productName: 'Product P',
    productSlug: 'p',
    quantity: 10,
    desiredUnitPrice: null,
    agreedUnitPrice: null,
    lineNote: null,
    lineCurrency: 'PLN',
    discountPercent: null,
    packagingUnitName: null,
    packagingUnitBaseQuantity: null,
    ...extra,
  };
}

function snap(items: QuoteRequestRevisionLine[], headerNote: string | null = null): HistorySnapshot {
  return { headerNote, items };
}

const refP = { productId: P, variantId: null, productName: 'Product P', variantLabel: null };

describe('historyDiff', () => {
  it('identical snapshots list nothing (FR-013)', () => {
    const items = [line({ agreedUnitPrice: 110, desiredUnitPrice: 100, lineNote: 'n' })];
    expect(historyDiff(snap(items, 'h'), snap(items.map((l) => ({ ...l })), 'h'))).toEqual([]);
  });

  it('lists agreed price and quantity changes of one line (US2 #2)', () => {
    const changes = historyDiff(
      snap([line({ agreedUnitPrice: 110, quantity: 10 })]),
      snap([line({ agreedUnitPrice: 105, quantity: 12 })]),
    );
    expect(changes).toEqual([
      { kind: 'line_quantity', line: refP, before: 10, after: 12 },
      { kind: 'line_agreed_unit_price', line: refP, before: 110, after: 105, currency: 'PLN' },
    ]);
  });

  it('lists an added line with quantity and agreed price, a removed line and the header note (US2 #3)', () => {
    const changes = historyDiff(
      snap([line(), line({ productId: R, productName: 'Product R' })], 'old note'),
      snap(
        [line(), line({ productId: Q, productName: 'Product Q', quantity: 4, agreedUnitPrice: 9.5, lineCurrency: 'EUR' })],
        'new note',
      ),
    );
    expect(changes).toEqual([
      { kind: 'header_note', before: 'old note', after: 'new note' },
      {
        kind: 'line_added',
        line: { productId: Q, variantId: null, productName: 'Product Q', variantLabel: null },
        quantity: 4,
        agreedUnitPrice: 9.5,
        currency: 'EUR',
      },
      {
        kind: 'line_removed',
        line: { productId: R, variantId: null, productName: 'Product R', variantLabel: null },
      },
    ]);
  });

  it('lists proposed price and line note changes (US2 #4a)', () => {
    const changes = historyDiff(
      snap([line({ desiredUnitPrice: 100, lineNote: 'urgent' })]),
      snap([line({ desiredUnitPrice: 95, lineNote: 'not urgent' })]),
    );
    expect(changes).toEqual([
      { kind: 'line_proposed_unit_price', line: refP, before: 100, after: 95, currency: 'PLN' },
      { kind: 'line_note', line: refP, before: 'urgent', after: 'not urgent' },
    ]);
  });

  it('keeps two variants of one product apart and names each by its variant label (FR-015)', () => {
    const labels = new Map([
      [V1, 'colour=red'],
      [V2, 'colour=blue'],
    ]);
    const changes = historyDiff(
      snap([line({ variantId: V1, quantity: 1 }), line({ variantId: V2, quantity: 2 })]),
      snap([line({ variantId: V1, quantity: 1 }), line({ variantId: V2, quantity: 5 })]),
      labels,
    );
    expect(changes).toEqual([
      {
        kind: 'line_quantity',
        line: { productId: P, variantId: V2, productName: 'Product P', variantLabel: 'colour=blue' },
        before: 2,
        after: 5,
      },
    ]);
  });

  it('a variant swapped for another is one line removed and one added, never a merged line', () => {
    const changes = historyDiff(snap([line({ variantId: V1 })]), snap([line({ variantId: V2 })]));
    expect(changes.map((c) => c.kind)).toEqual(['line_added', 'line_removed']);
  });

  it('a variant gone from the catalogue has a null label', () => {
    const [change] = historyDiff(snap([line({ variantId: V1, quantity: 1 })]), snap([line({ variantId: V1, quantity: 2 })]), new Map());
    expect(change).toMatchObject({ line: { variantId: V1, variantLabel: null } });
  });

  it('a packaging-only change lists nothing — not even the name suffix it carries (FR-012)', () => {
    const changes = historyDiff(
      snap([line({ packagingUnitName: 'Box 12', packagingUnitBaseQuantity: 12, productName: 'Product P (Box 12)' })]),
      snap([line({ packagingUnitName: 'Box 6', packagingUnitBaseQuantity: 6, productName: 'Product P (Box 6)' })]),
    );
    expect(changes).toEqual([]);
  });

  it('legacy snapshots without packaging keys still pair (FR-016)', () => {
    const legacy = line({ agreedUnitPrice: 10 });
    delete legacy.packagingUnitName;
    delete legacy.packagingUnitBaseQuantity;
    const changes = historyDiff(
      snap([legacy]),
      snap([line({ agreedUnitPrice: 12, packagingUnitName: 'Box 12', packagingUnitBaseQuantity: 12 })]),
    );
    expect(changes.map((c) => c.kind)).toEqual(['line_agreed_unit_price']);
  });

  it('two lines of one product in different packaging pair by packaging name first', () => {
    const changes = historyDiff(
      snap([line({ packagingUnitName: 'Box 6', quantity: 1 }), line({ packagingUnitName: 'Box 12', quantity: 2 })]),
      snap([line({ packagingUnitName: 'Box 12', quantity: 2 }), line({ packagingUnitName: 'Box 6', quantity: 3 })]),
    );
    expect(changes).toEqual([{ kind: 'line_quantity', line: refP, before: 1, after: 3 }]);
  });

  it('every change it produces parses against the published schema', () => {
    const changes = historyDiff(
      snap([line({ desiredUnitPrice: 1, lineNote: 'a' }), line({ productId: R })], 'x'),
      snap([line({ desiredUnitPrice: 2, lineNote: 'b', quantity: 3, agreedUnitPrice: 4 }), line({ productId: Q })], null),
    );
    expect(changes.length).toBeGreaterThan(0);
    for (const change of changes) expect(quoteRequestHistoryChangeSchema.safeParse(change).success).toBe(true);
  });
});
