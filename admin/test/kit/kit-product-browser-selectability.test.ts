import { describe, expect, it } from 'vitest';
import {
  ADMIN_PRODUCT_SELECTION_MAX,
  productStatusSchema,
  productTypeSchema,
} from '@endora-commerce/contracts';
import {
  productSelectability,
  type ProductBrowserRules,
} from '@endora-commerce/admin-kit/components';

/**
 * `productSelectability` is the one predicate both entry points of the product
 * browser apply — the table's row checkbox and the quick search's options
 * (feature 145, research R-4 and R-5). It is pure so that the rules every host
 * passes are pinned here, without a DOM.
 *
 * The status × type matrix is derived from the contracts' own enums rather than
 * written out by hand: a sixth product type added to `productTypeSchema` lands in
 * this file's population on the day it is added, instead of being silently
 * absent from a table nobody re-reads.
 */

const STATUSES = productStatusSchema.options;
const TYPES = productTypeSchema.options;

const EMPTY = new Set<string>();

function ctx(overrides: {
  alreadyAddedIds?: ReadonlySet<string>;
  selectedIds?: ReadonlySet<string>;
  max?: number;
} = {}): { alreadyAddedIds: ReadonlySet<string>; selectedIds: ReadonlySet<string>; max: number } {
  return {
    alreadyAddedIds: overrides.alreadyAddedIds ?? EMPTY,
    selectedIds: overrides.selectedIds ?? EMPTY,
    max: overrides.max ?? ADMIN_PRODUCT_SELECTION_MAX,
  };
}

/** The three host rule sets of research R-4, as the hosts will pass them. */
const ORDER_RULES: ProductBrowserRules = {
  initialStatus: 'active',
  blockedTypes: ['grouped', 'bundle'],
  blockedStatuses: ['draft', 'inactive'],
};
const QUOTE_RULES: ProductBrowserRules = {
  initialStatus: 'active',
  blockedTypes: ['grouped', 'bundle'],
};
const PRICE_LIST_RULES: ProductBrowserRules = {
  initialStatus: 'all',
  alreadyAddedLabelKey: 'priceLists.detail.picker.alreadyOnList',
};

/** FR-012 in words: what each host refuses, independent of the rules object. */
const GROUP_PARENTS = new Set<string>(['grouped', 'bundle']);
const NOT_LIVE = new Set<string>(['draft', 'inactive']);

describe('productSelectability — FR-012, the three host rule sets over every status × type', () => {
  for (const status of STATUSES) {
    for (const type of TYPES) {
      const row = { id: `p-${status}-${type}`, status, type };

      it(`create order: ${status} ${type}`, () => {
        const expected = GROUP_PARENTS.has(type)
          ? { selectable: false, reason: 'typeBlocked' }
          : NOT_LIVE.has(status)
            ? { selectable: false, reason: 'statusBlocked' }
            : { selectable: true };
        expect(productSelectability(row, ORDER_RULES, ctx())).toEqual(expected);
      });

      it(`create quote request: ${status} ${type}`, () => {
        const expected = GROUP_PARENTS.has(type)
          ? { selectable: false, reason: 'typeBlocked' }
          : { selectable: true };
        expect(productSelectability(row, QUOTE_RULES, ctx())).toEqual(expected);
      });

      it(`price list: ${status} ${type}`, () => {
        expect(productSelectability(row, PRICE_LIST_RULES, ctx())).toEqual({ selectable: true });
      });
    }
  }

  it('covers every status and type the contracts declare', () => {
    expect(STATUSES.length).toBeGreaterThan(0);
    expect(TYPES.length).toBeGreaterThan(0);
  });
});

describe('productSelectability — reason order', () => {
  // A grouped draft that is already added and arrives at the cap: every rule
  // matches it, so the first one in the order is the only answer.
  const row = { id: 'p-1', status: 'draft' as const, type: 'grouped' as const };
  const full = new Set(Array.from({ length: 3 }, (_, i) => `other-${i}`));

  it('alreadyAdded wins over everything', () => {
    expect(
      productSelectability(row, ORDER_RULES, ctx({ alreadyAddedIds: new Set(['p-1']), selectedIds: full, max: 3 })),
    ).toEqual({ selectable: false, reason: 'alreadyAdded' });
  });

  it('typeBlocked comes before statusBlocked and limitReached', () => {
    expect(productSelectability(row, ORDER_RULES, ctx({ selectedIds: full, max: 3 }))).toEqual({
      selectable: false,
      reason: 'typeBlocked',
    });
  });

  it('statusBlocked comes before limitReached', () => {
    const simpleDraft = { ...row, type: 'simple' as const };
    expect(productSelectability(simpleDraft, ORDER_RULES, ctx({ selectedIds: full, max: 3 }))).toEqual({
      selectable: false,
      reason: 'statusBlocked',
    });
  });

  it('limitReached applies to an unselected, otherwise selectable row once the selection is full', () => {
    const live = { id: 'p-2', status: 'active' as const, type: 'simple' as const };
    expect(productSelectability(live, ORDER_RULES, ctx({ selectedIds: full, max: 3 }))).toEqual({
      selectable: false,
      reason: 'limitReached',
    });
    // One below the cap: still selectable.
    const almost = new Set(['other-0', 'other-1']);
    expect(productSelectability(live, ORDER_RULES, ctx({ selectedIds: almost, max: 3 }))).toEqual({
      selectable: true,
    });
  });

  it('a selected row stays de-selectable at the cap', () => {
    const live = { id: 'other-0', status: 'active' as const, type: 'simple' as const };
    expect(productSelectability(live, ORDER_RULES, ctx({ selectedIds: full, max: 3 }))).toEqual({
      selectable: true,
    });
  });

  it('uses ADMIN_PRODUCT_SELECTION_MAX as the cap hosts pass', () => {
    const live = { id: 'next', status: 'active' as const, type: 'simple' as const };
    const atCap = new Set(Array.from({ length: ADMIN_PRODUCT_SELECTION_MAX }, (_, i) => `s-${i}`));
    expect(productSelectability(live, PRICE_LIST_RULES, ctx({ selectedIds: atCap }))).toEqual({
      selectable: false,
      reason: 'limitReached',
    });
  });
});
