import type { ProductBrowserItem } from './types.js';

/**
 * What a host refuses in the product browser (feature 145, research R-4).
 *
 * The kit knows no host: each screen passes its own rules, and the same object
 * drives both entry points — the browser's row checkboxes and the quick search
 * (`ProductPicker` with `rules`).
 */
export interface ProductBrowserRules {
  /** The status tab the browser opens on. */
  initialStatus: 'all' | 'active';
  /** Types shown but not selectable (reason `typeBlocked`). */
  blockedTypes?: ReadonlyArray<ProductBrowserItem['type']> | undefined;
  /** Statuses shown but not selectable (reason `statusBlocked`). */
  blockedStatuses?: ReadonlyArray<ProductBrowserItem['status']> | undefined;
  /** `core` key for the already-added row state; default `productBrowser.reason.alreadyAdded`. */
  alreadyAddedLabelKey?: string | undefined;
}

export type ProductSelectabilityReason =
  | 'alreadyAdded'
  | 'typeBlocked'
  | 'statusBlocked'
  | 'limitReached';

export type ProductSelectability =
  | { selectable: true }
  | { selectable: false; reason: ProductSelectabilityReason };

/** An empty id set, for a context with nothing already added or selected. */
export const NO_PRODUCT_IDS: ReadonlySet<string> = new Set<string>();

export interface ProductSelectabilityContext {
  alreadyAddedIds: ReadonlySet<string>;
  selectedIds: ReadonlySet<string>;
  max: number;
}

/**
 * Whether one row may be ticked, and if not, why.
 *
 * First match wins: `alreadyAdded` → `typeBlocked` → `statusBlocked` →
 * `limitReached`. The cap applies only to a row that is not already selected, so a
 * selected row stays de-selectable when the selection is full.
 */
export function productSelectability(
  row: Pick<ProductBrowserItem, 'id' | 'status' | 'type'>,
  rules: ProductBrowserRules,
  ctx: ProductSelectabilityContext,
): ProductSelectability {
  if (ctx.alreadyAddedIds.has(row.id)) return { selectable: false, reason: 'alreadyAdded' };
  if (rules.blockedTypes?.includes(row.type)) return { selectable: false, reason: 'typeBlocked' };
  if (rules.blockedStatuses?.includes(row.status)) {
    return { selectable: false, reason: 'statusBlocked' };
  }
  if (!ctx.selectedIds.has(row.id) && ctx.selectedIds.size >= ctx.max) {
    return { selectable: false, reason: 'limitReached' };
  }
  return { selectable: true };
}

/** The `core` key that names a refusal on screen. */
export function productSelectabilityReasonKey(
  reason: ProductSelectabilityReason,
  rules: Pick<ProductBrowserRules, 'alreadyAddedLabelKey'>,
): string {
  switch (reason) {
    case 'alreadyAdded':
      return rules.alreadyAddedLabelKey ?? 'productBrowser.reason.alreadyAdded';
    case 'typeBlocked':
      return 'productBrowser.reason.groupParent';
    case 'statusBlocked':
      return 'productBrowser.reason.notActive';
    case 'limitReached':
      return 'productBrowser.reason.limitReached';
  }
}
