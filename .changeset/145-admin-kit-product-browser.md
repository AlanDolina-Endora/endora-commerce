---
'@endora-commerce/admin-kit': minor
---

A shared product browser for admin screens that add many products at once, and selectability rules for the quick product search.

**New in `@endora-commerce/admin-kit/components`.**

- `ProductBrowserDialog` — a wide side drawer that lists the catalogue from
  `GET /api/v1/admin/catalog/products` in a paginated table (status tabs with counts, a type
  filter, a debounced SKU / slug / name search) and keeps a selection across pages, page sizes
  and filters. Props: `open`, `rules`, `alreadyAddedIds`, `title?`, `onConfirm(items)`,
  `onCancel`, `confirmErrorMessage?`. `onConfirm` receives the selected `ProductBrowserItem`s in
  the order they were ticked. Return nothing for a local append; return a promise to make the
  confirm a server write — the dialog shows pending, and on rejection stays open with the
  selection kept and a **Retry** that sends the same items again. **The host owns `open`**: close
  the dialog in `onConfirm`, or once its promise resolves. One confirm takes at most
  `ADMIN_PRODUCT_SELECTION_MAX` (200) products. Its first page size follows the operator's
  Products-list preference, and changing it inside the dialog does not change that preference.
- `ProductBrowserTrigger` — the **Browse products** button. It is disabled, with a visible hint,
  for an operator without `catalog:read`; `disabled` and `disabledReason` add a host's own reason.
- `productSelectability(row, rules, { alreadyAddedIds, selectedIds, max })` — the pure rule both
  entry points apply: `{ selectable: true }` or `{ selectable: false, reason }`, the reason being
  the first of `alreadyAdded`, `typeBlocked`, `statusBlocked`, `limitReached`. A row already
  selected stays de-selectable at the cap. `productSelectabilityReasonKey(reason, rules)` gives
  the `core` translation key for a reason.
- Types: `ProductBrowserRules` (`initialStatus: 'all' | 'active'`, `blockedTypes?`,
  `blockedStatuses?`, `alreadyAddedLabelKey?`), `ProductBrowserItem`, `ProductBrowserStatus`,
  `ProductBrowserType`, `ProductSelectability`, `ProductSelectabilityReason`,
  `ProductSelectabilityContext`, `ProductBrowserDialogProps`, `ProductBrowserTriggerProps`.

**`ProductPicker` gains three optional props; without them nothing changes.**

- `rules` and `alreadyAddedIds` — every option is judged by `productSelectability`; one the host
  refuses is shown disabled with its translated reason instead of hidden. Passing `rules` also
  disables the picker, with the same hint as the trigger, for an operator without
  `catalog:read`. A picker given no `rules` adds no permission check and needs no signed-in
  session, exactly as before.
- `onPickProduct(item)` — receives the full summary of the picked product (`id`, `sku`, `slug`,
  `name`, `status`, `type`), in both `select` and `multiselect` mode.

Every new string is read from the `core` namespace, so a host needs `@endora-commerce/mod-i18n`
at the version that ships the `productBrowser.*` keys.
