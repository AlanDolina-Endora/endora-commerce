# Contract: `ProductBrowserDialog` and friends (admin-kit UI contract)

**Owner**: `@endora-commerce/admin-kit` (design system; no module owns it) · **Published from**:
`packages/admin-kit/src/components/index.ts` (explicit named exports) · **FRs**: FR-001…FR-014,
FR-020, FR-030, FR-040, FR-041 · **Decisions**: research.md R-1…R-5, R-9

## Files

```text
packages/admin-kit/src/components/product-browser/
├── ProductBrowserDialog.tsx      # the overlay: tabs, filters, table, pagination, selection, footer
├── ProductBrowserTrigger.tsx     # "Browse products" button with the catalog:read gate (FR-013)
├── selectability.ts              # productSelectability(), ProductBrowserRules, reasons (pure)
├── product-browser-api.ts        # list request builder over GET /api/v1/admin/catalog/products
└── types.ts                      # ProductBrowserItem, ProductType, ProductStatus
packages/admin-kit/src/components/product-picker/ProductPicker.tsx   # + rules, alreadyAddedIds, onPickProduct
```

## Public API

```ts
export interface ProductBrowserItem {
  id: string; sku: string; slug: string;
  name: Record<string, string>;
  status: 'draft' | 'active' | 'inactive';
  type: 'simple' | 'configurable' | 'grouped' | 'bundle' | 'virtual';
}

export interface ProductBrowserRules {
  initialStatus: 'all' | 'active';
  blockedTypes?: ReadonlyArray<ProductBrowserItem['type']>;
  blockedStatuses?: ReadonlyArray<ProductBrowserItem['status']>;
  /** core key for the already-added row state; default 'productBrowser.reason.alreadyAdded'. */
  alreadyAddedLabelKey?: string;
}

export type ProductSelectability =
  | { selectable: true }
  | { selectable: false; reason: 'alreadyAdded' | 'typeBlocked' | 'statusBlocked' | 'limitReached' };

export function productSelectability(
  row: Pick<ProductBrowserItem, 'id' | 'status' | 'type'>,
  rules: ProductBrowserRules,
  ctx: { alreadyAddedIds: ReadonlySet<string>; selectedIds: ReadonlySet<string>; max: number },
): ProductSelectability;

export interface ProductBrowserDialogProps {
  open: boolean;
  rules: ProductBrowserRules;
  alreadyAddedIds: readonly string[];
  /** Title of the drawer; host-specific (core key resolved by the host). */
  title: string;
  /**
   * Called with the selection in selection order. Return a promise to make the confirm a server
   * write: the dialog shows pending, closes on resolve, and on reject stays open with the
   * selection kept and a Retry inside (FR-010). Return void for a local append.
   */
  onConfirm: (items: ProductBrowserItem[]) => void | Promise<void>;
  onCancel: () => void;
  /** Optional message to render in the failure state instead of the generic one. */
  confirmErrorMessage?: (error: unknown) => string;
}

export interface ProductBrowserTriggerProps {
  onOpen: () => void;
  disabled?: boolean;          // host-level reason (e.g. system price list) — combined with the gate
  disabledReason?: string;
  label?: string;              // default core 'productBrowser.trigger'
}
```

`ProductPicker` (existing) gains, all optional and additive:

```ts
rules?: ProductBrowserRules;            // option disabled + reason in description when not selectable
alreadyAddedIds?: readonly string[];    // evaluated through productSelectability
onPickProduct?: (item: ProductBrowserItem) => void;   // full summary of the picked option
```

## Behaviour (normative)

| # | Behaviour | FR |
| --- | --- | --- |
| B1 | Requests `GET /api/v1/admin/catalog/products?includeArchived=1&page=<0-based>&pageSize=<n>[&status][&type][&q]`; `q` debounced 250 ms; stale responses discarded by sequence. | FR-002, FR-004 |
| B2 | Status tabs All / Active / Draft / Inactive with counts from `counts`; type chip cycling the five types and "all"; search placeholder says SKU, slug or name. Opens on `rules.initialStatus`. | FR-002, FR-012 |
| B3 | Columns: checkbox, product (name `en-US` + `pl-PL` second line when different, truncated with full text in `title`), SKU, status (translated badge), type (translated). | FR-003, FR-014 |
| B4 | `PaginationFooter` with `usePageSizePreference('catalog-products')`. | FR-004 |
| B5 | Selection persists across page / page-size / filter changes; header checkbox adds or removes the selectable rows of the current page only. | FR-005 |
| B6 | Footer: "N selected", **Clear selection**, **Show selected only** toggle, **Cancel**, **Add N** (disabled at 0). | FR-006, FR-007 |
| B7 | At `ADMIN_PRODUCT_SELECTION_MAX` further unselected rows render disabled with `productBrowser.reason.limitReached`, and a notice says the per-Add limit is reached. | FR-008 |
| B8 | Non-selectable rows render with a disabled checkbox and a visible reason text (`aria-describedby`). | FR-009, FR-012 |
| B9 | Distinct loading, empty (selection count stays, Add stays enabled) and load-error (message + Retry) states; none alters the host. | FR-010 |
| B10 | Async confirm: pending disables Add and Retry; reject → stays open, selection unchanged, error + **Retry** re-invokes `onConfirm` with the same items. | FR-010 |
| B11 | `role="dialog"`, `aria-modal="true"`, `aria-labelledby` the title; focus moves in on open (`useFocusTrap`), Tab is trapped, Esc and scrim click cancel, focus returns to the trigger on close; every checkbox has an accessible name including the product name. | FR-011 |
| B12 | `ProductBrowserTrigger` is disabled with `productBrowser.trigger.noPermission` as hint when `useAuth().hasPermission('catalog:read')` is false. The quick search (`ProductPicker`) is disabled with the same hint. | FR-013 |
| B13 | Every string from `useTranslation('core')`, keys `productBrowser.*`, in `en` and `pl`. | FR-014 |
| B14 | Table scrolls horizontally inside its own container at tablet width (`ResponsiveTable mode="table-scroll"`). | Edge Cases |

## Host usage

| Host | rules | `alreadyAddedIds` | `onConfirm` |
| --- | --- | --- | --- |
| `orders` `OrderCreatePage` | `{ initialStatus: 'active', blockedTypes: ['grouped','bundle'], blockedStatuses: ['draft','inactive'] }` | line product ids | sync: append lines (qty 1) in order |
| `quote_requests` `RfqCreatePage` | `{ initialStatus: 'active', blockedTypes: ['grouped','bundle'] }` | line product ids | sync: append lines (qty 1, price per R-11) |
| `price_lists` `PriceListDetailPage` | `{ initialStatus: 'all', alreadyAddedLabelKey: 'priceLists.detail.picker.alreadyOnList' }` | roster product ids | async: bulk-add request; resolve on 2xx, reject otherwise |

## Keys (core bundle, `packages/modules/_i18n/i18n/{en,pl}.json`)

`productBrowser.trigger`, `productBrowser.trigger.noPermission`, `productBrowser.title.default`,
`productBrowser.tab.{all,active,draft,inactive}`, `productBrowser.filter.type`,
`productBrowser.filter.type.all`, `productBrowser.search.placeholder`,
`productBrowser.column.{product,sku,status,type}`, `productBrowser.status.{draft,active,inactive}`,
`productBrowser.type.{simple,configurable,grouped,bundle,virtual}`,
`productBrowser.reason.{alreadyAdded,groupParent,notActive,limitReached}`,
`productBrowser.selection.{count,clear,showSelected,showAll}`, `productBrowser.limit.notice`,
`productBrowser.action.{cancel,confirm,retry}` (`confirm` takes `{count}` → "Add {count}" /
"Dodaj {count}"), `productBrowser.state.{loading,empty,loadError,confirmError}`,
`productBrowser.selectRow`, `productBrowser.selectPage`. Plus host keys listed in tasks.md.

## Tests that pin this contract

`admin/test/kit/kit-product-browser-selectability.test.ts` (pure, B5/B7/B8 and the rules table),
`admin/test/kit/kit-product-browser.test.tsx` (B1–B14, rendering `_i18n`'s shipped bundle in en and
pl, as `kit-core-namespace.test.tsx` does), `admin/test/kit/kit-pickers.test.tsx` (extended for the
`ProductPicker` props), `admin/test/kit/admin-kit-identity.test.ts` and
`admin/test/kit/kit-core-namespace.test.tsx` (still green).
