# Contract — Admin UI: the *Price matrix* tab (148)

Owner: `price_lists` admin layer (`packages/modules/price_lists/src/admin/`). UX rules:
`.claude/skills/ux-laws/SKILL.md` (WCAG 2.2 AA floor, required component states). Strings: the
module's own bundle (`packages/modules/price_lists/i18n/{en,pl}.json`, flat keys), read with
`useTranslation('price_lists')`; nothing new goes into `_i18n`'s `core` bundle.

## 1. Placement

- `pages/PriceListDetailPage.tsx`: `type Tab = 'details' | 'products' | 'rule' | 'matrix'`; a fourth
  `TabBtn` (icon `Grid3x3` from `lucide-react`, already a peer) labelled `priceMatrix.tab`.
  `?tab=matrix` selects it on load (the page already reads `useSearchParams`).
- No new route, nav entry or palette action (research R16). The tab is visible to
  `price_lists:read`; every write control is rendered only when `useAuth().hasPermission('price_lists:write')`.

## 2. Components

| File | Responsibility |
| --- | --- |
| `components/PriceMatrixTab.tsx` | filters, table, paging, empty/loading/error states, row actions |
| `components/PriceMatrixEntryDialog.tsx` | create/edit form in `ModalDialog` |
| `lib/price-matrix-api.ts` | typed `apiClient` calls for contract `admin-price-matrix-api.md` §1–§6, parsing with the contracts schemas |
| `lib/price-matrix-format.ts` | pure formatting: selection summary, quantity window, price (`12.50 PLN`, `−12%`) — unit-tested |

## 3. Table

Columns: **Applies to** (product `SKU — name` / category name / `Attribute: value` / `Category ∩ Attribute: value` / *All products*), **Organization** (name or *All buyers*), **Quantity** (`500+`, `1–99`), **Price** (`9.50 PLN` / `−12%`, with *All currencies* hint for percentages), **Status** (badge *Inactive* with tooltip text from `inactiveReason` when `active=false`), row actions (*Edit*, *Delete* with confirm).
Filters: selection kind (segmented), organization (rule-target organization search + *Not organization-specific*). `PaginationFooter` with page size 50. Counter "`total` of `limit`" near the add button.

States: loading skeleton rows; empty state with one-sentence explanation and (write only) **Add entry**; error state with retry; read-only notice for users without write.

## 4. Dialog

1. **Applies to** — radio group: *Product*, *Category*, *Attribute value*, *Category and attribute value*, *All products*.
   - Product: `ProductPicker` (admin-kit). Selecting *Product* makes **Organization** required (hint `priceMatrix.form.organizationRequiredForProduct`).
   - Category: options from `GET /api/v1/admin/pricing/rule-targets/categories` rendered as a tree select.
   - Attribute: attribute select from `GET /api/v1/admin/pricing/rule-targets/attributes`, then value select from its `options`. Empty list ⇒ inline hint pointing to *Catalog → Attributes → Price list rules* (text only, no cross-module link).
2. **Organization** — optional search select over `GET /api/v1/admin/pricing/rule-targets/organizations`; empty = *All buyers*.
3. **Quantity** — *From* (required, integer ≥ 1) and *To* (optional, ≥ From).
4. **Price** — radio *Fixed unit price* (amount + currency from `…/rule-targets/currencies`) or *Discount %* (0 < p ≤ 100). *Fixed* is disabled for *All products*, with the reason shown.
5. Server errors map to fields: `PRICE_MATRIX_ENTRY_OVERLAP` → banner naming the conflicting row (and a *Show* action that filters the table to it when `conflictingEntryId` is present); `PRICE_MATRIX_ATTRIBUTE_NOT_ELIGIBLE` → attribute field; `PRICE_MATRIX_ENTRY_LIMIT` → banner; `VALIDATION_FAILED` with `details.field` → that field. The envelope's translated `message` is shown; codes are only used for placement.

Keyboard: the dialog traps focus (`ModalDialog` does), Enter submits, Escape cancels; every control has a visible label; the radio groups are `fieldset`/`legend`.

## 5. i18n keys (both `en` and `pl`)

```
priceMatrix.tab
priceMatrix.intro
priceMatrix.empty.title / priceMatrix.empty.body
priceMatrix.add / priceMatrix.edit / priceMatrix.delete / priceMatrix.delete.confirm
priceMatrix.readOnly
priceMatrix.counter                      ("{count} of {limit} entries")
priceMatrix.column.appliesTo / .organization / .quantity / .price / .status
priceMatrix.selection.product / .category / .attribute / .categoryAttribute / .all
priceMatrix.organization.all
priceMatrix.quantity.from / .to / .openEnded   ("{min}+")
priceMatrix.price.fixed / .discountPercent / .allCurrencies
priceMatrix.status.inactive
priceMatrix.targetDeleted                ("deleted item" marker when `targetDeleted`)
priceMatrix.inactive.attribute_not_flagged / _not_found / _language_scoped / _channel_scoped / _value_type
priceMatrix.form.organizationRequiredForProduct
priceMatrix.form.fixedNotForAll
priceMatrix.form.noEligibleAttributes
priceMatrix.attribute.boolean.true / .false
priceMatrix.error.overlap.show
errors.PRICE_MATRIX_ENTRY_NOT_FOUND
errors.PRICE_MATRIX_ENTRY_OVERLAP
errors.PRICE_MATRIX_ATTRIBUTE_NOT_ELIGIBLE
errors.PRICE_MATRIX_ENTRY_LIMIT
activity.verb.price_list.matrix_entry_create / _update / _delete
```

Polish wording anchors: tab *Macierz cen*; *Dotyczy*; *Wszyscy nabywcy*; *Wszystkie produkty*;
*Rabat %*; *Cena jednostkowa*; inactive reason for the flag: *Atrybut nie jest oznaczony jako
„Reguły cennika”* — reusing the catalogue's exact flag name so an operator can find it.
