# Research — Price list matrix rules (148)

Every decision below is **decision → rationale → alternatives rejected**. Paths are real and were
read on `origin/master` at `e6b1494f7`.

## Ground truth read before deciding

| What | Where | What it tells us |
| --- | --- | --- |
| Price list entity | `packages/modules/price_lists/src/backend/entities/price-list.entity.ts` | `@RuleScoped()`, `type` base/sale, `status`, `applicationRule` JSONB, `isSystem`, `modifiedAt` |
| Brackets | `…/entities/price-list-price-bracket.entity.ts`, `…/price-list-product.entity.ts` | `@GlobalEntity()`, PK `(list, product, currency, minQuantity)`, decimal(14,4) |
| Engine | `…/services/pricing-service.ts` | `resolveEngine` (per product), `resolveListingPrices` (batched in priority waves), `pickAndResolveBracket(sForSet)`, `listBracketMinQuantities`, `orderByUnitPrice` (SQL over brackets) |
| List priority | `…/services/price-list-resolver.ts` | org → customer group → category → channel → other; `modifiedAt` desc, then name |
| Rule evaluator | `packages/contracts/src/price-lists.ts` `evaluateApplicationRule` | category criterion = the product's **own** assignments; org criterion ranks by inheritance chain nearness (feature 056) |
| Bracket pick | `…/services/price-bracket-resolver.ts` | `(currency, qty)` window; `null` ⇒ fall through to next list (FR-031 of 011) |
| Cache | `…/services/pricing-cache.ts` | per-process LRU, 60 s TTL, `invalidateAll()` on every write path |
| Writes | `…/services/price-list-service.ts` `#runAudited` | `CommandBus.run({ action, objectType: 'price_list', objectId })`, invalidates cache inside the run |
| Attribute flag | `packages/modules/catalog/src/migrations/20261008T080839_catalog_product_attribute_is_price_rule.ts`, `CatalogAttributeView.isPriceRule`, `CatalogAttributeReadPort.listByFlag('isPriceRule')` | exists, unconsumed; label `Price list rules` / `Reguły cennika` in `packages/modules/catalog/i18n/{en,pl}.json` |
| Attribute precedent | `packages/modules/promotions/src/backend/services/promotion-rule-service.ts` | promotion `attribute` criterion: `isPromoRule=false` ⇒ criterion silently false (FR-039 of 012); multiselect any-of |
| Tenancy | `packages/platform/src/tenancy/derived-scope.ts` | `ruleVisibleForScope`, `isOrgInScope`, `orgConstraintFor` |
| Prior spec | `/home/mzabielski/www/b2b-platform/specs/011-price-lists/spec.md` (pre-migration, cited) | brackets + application rule; no per-group pricing inside a list |

## R1 — What the attribute decides

**Decision**: An attribute value selects **products inside a price list** (a coordinate of a matrix
entry). It is *not* added as a criterion of the list-level application rule.

**Rationale**: The request is "creating prices on a Product via the intersection of
Attribute / Category / Quantity × Organization × Product" — the output is a *price per product*,
so the attribute must be a coordinate of a price, next to category, quantity and organization.
The application rule answers *which buyers* a list serves; product-side criteria there
(`category`) only gate the whole list and still require a bracket per product, which is the
maintenance problem the owner is describing. The sentence *"to decide whether a price list applies
by Attribute, we use Attributes that have the flag"* is satisfied by the flag gating which
attributes may be a matrix coordinate (R6).

**Alternatives rejected**:
- *Add `attribute` to `ruleCriterionTypeSchema`*. Cheap, but it still needs one bracket per product,
  and it changes a pure evaluator `organizations` also runs (`evaluateApplicationRule` lives in
  contracts precisely so both agree) — a wide blast radius for no price-per-group capability. It
  also adds a product-side dimension to `buildCandidateVector`'s SQL streams
  (`price-list-candidate-vector.ts`), which today only knows categories. Can be added later
  independently.
- *Both*. YAGNI; nothing in the request needs list-level attribute gating.

## R2 — Which module owns it

**Decision**: Extend `price_lists`. No new module.

**Rationale**: Matrix entries are prices; prices and their resolution are `price_lists`' domain
(Constitution I). The resolver, the cache, the audit path and the admin surface already live there,
and the feature must sit *inside* the existing fall-through walk. `price_lists` is
`nonDeactivatable`, and so is `catalog` (`packages/modules/catalog/src/manifest.ts` `activation`),
so no new activation axis appears. `catalog` and `organizations` are already declared dependencies.

**Alternatives rejected**: a `price_matrix` module — it would have to hook into the private bracket
walk of `PricingService` (no seam exists, and creating one is a port for one consumer), and its
detachment would silently change prices, which is exactly what `price_lists`' activation reason
forbids.

## R3 — Storage shape

**Decision**: One table `price_list_matrix_entries` with nullable coordinate columns
(`product_id`, `category_id`, `attribute_key` + `attribute_value`, `organization_id`), a quantity
window, and a price (`price_type`, `amount` + `currency_code` | `discount_percent`). Shape rules are
CHECK constraints *and* Zod refinements.

**Rationale**: Every coordinate is a typed, indexable column; the resolver's prefetch is one
statement filtered by list ids, product ids (or null) and the organization chain (or null). FKs to
`products`, `categories`, `organizations` give cascade-on-delete (FR-025) for free, which matches
how `price_list_products` already references `products`.

**Alternatives rejected**:
- *Reuse `price_list_price_brackets` with extra nullable columns* — its composite PK includes
  `product_id` and it is FK'd to `price_list_products`; making it nullable rewrites a hot table and
  every reader (`orderByUnitPrice`, `namedListPrices`, `summarizeBracketsForProduct`, ergonode's
  admin port).
- *A JSONB rule AST per entry* (like `applicationRule`) — unindexable, no FK cascade, and the
  overlap check (FR-005) would have to parse JSON.
- *One table per selection kind* — five tables, five prefetches, same logic.

## R4 — What an entry charges

**Decision**: `fixed` (unit price in one currency) or `discount_percent` (0 < p ≤ 100, two decimals,
currency-agnostic).

**Rationale**: A category or attribute group rarely shares one unit price, so a fixed price alone
would make the non-product selections near-useless; discount off a base price is the canonical B2B
contract term ("rabat od ceny katalogowej"). Fixed stays for product × organization cells and for
homogeneous groups (an attribute like *size = M8*).

**Alternatives rejected**: *fixed only* (does not solve the request for groups); *amount off*
(currency-bound like fixed, rarely used, adds a third arithmetic path — can be added later as a
third `price_type` without schema change beyond the CHECK); *markup* (not requested).

## R5 — Reference price for a percentage

**Decision**: The product's own bracket **on the same list** for the line's currency and quantity;
if none, the product's bracket on the **system Default list** (`isSystem = true`,
`DEFAULT_PRICE_LIST_ID`). No reference ⇒ the candidate is skipped (FR-016).

**Rationale**: Deterministic, non-recursive, at most one extra prefetch per resolution wave, and it
means what an operator expects in both common setups: an organization list with only matrix entries
("12% off catalogue price"), and the Default list carrying organization entries ("12% off our
price"). Using the same list's bracket first lets "this list's price, minus 5% for Acme" compose.

**Alternatives rejected**:
- *The price the buyer would pay without this entry* (recursive resolution excluding the entry) —
  order-dependent, can loop across lists, and costs a second full resolution per line.
- *Always the Default list* — ignores a list's own product price, so a percentage entry on a
  non-default list would discount a figure that list never charges.
- *The product's legacy `defaultPrice` attribute* — retired by feature 011 as a price source.

## R6 — Which attributes are eligible

**Decision**: `isPriceRule = true` **and** value type `select`, `enum`, `multiselect` or `boolean`
**and** `languageScoped = false` **and** `channelScoped = false`. Checked at write time (refuse with
`PRICE_MATRIX_ATTRIBUTE_NOT_ELIGIBLE`) and at resolve time (silently inactive — FR-010, the
promotions FR-039 precedent in `promotion-rule-service.ts`). Matching: scalar equality on the
stored option value; any-of for `multiselect` arrays; `'true'`/`'false'` for booleans.

**Rationale**: Option values are stable codes, so an entry cannot be broken by a label edit or a
language. Per-language values are `Record<lang, value>` and per-channel values live in
`product_value_overrides`; matching either would need the request's language or channel inside
pricing, which today keys its cache on neither (`PricingCacheKey`). Free text, numbers and dates
need operators (range, contains) — a different feature.

**Alternatives rejected**: *any flagged attribute* (silently never matches for the excluded kinds,
which is worse than a refusal); *refuse at resolve time* (an operator un-flagging an attribute would
break checkout — the flag is catalogue-owned and flipping it must be safe).

## R7 — Category selection: own assignments or subtree

**Decision**: The product's own category assignments (`CatalogCategoryReadPort.listAssignmentsForProducts`,
already read by the engine), structural — no `activeOnly`.

**Rationale**: It is the meaning the application rule's `category` criterion already has
(`evaluateApplicationRule`, and `pricing-service.ts` `#categoryMemberships` comment on why it is
structural). Two meanings of "product in category" inside one pricing engine would price the same
product differently depending on which mechanism the operator used. The memberships are already
loaded per resolution, so this costs nothing.

**Alternatives rejected**: *subtree* — needs `ancestorsOf` per assigned category on the hot path
and diverges from the rule criterion. A later `includeDescendants` flag on the entry can add it
without migration of existing rows.

## R8 — Precedence inside a list

**Decision**: Lexicographic key, first applicable candidate that yields an amount wins:

1. organization rank — nearest org in the buyer's chain (0 = own org); not organization-specific = ∞;
2. selection specificity — product (4) > category+attribute (3) > attribute (2) > category (1) > all (0);
3. higher `min_quantity` first;
4. lower resulting amount first;
5. `id` ascending (total order).

The list's own product bracket is a candidate with rank ∞, specificity 4, its own `minQuantity`.

**Rationale**: (1) mirrors the list-level chain where an organization-named list beats everything
(`price-list-resolver.ts` `PRIORITY_ORDER`) and feature 056's nearness rank — the operator learns
one rule. (2) narrower selection is the more deliberate statement; attribute above category because
attributes flagged for pricing are chosen pricing dimensions, while categories are navigation. (3)
the deeper volume tier is the one negotiated for that volume. (4) is buyer-favourable and, unlike
`modifiedAt`, does not change a price because somebody fixed a typo on an unrelated entry. (5)
makes the order total, as FR-027 of 011 requires for lists.

**Alternatives rejected**: *specificity before organization* (a global product bracket would beat a
negotiated organization discount — contradicts the list chain); *most recently modified* tie-break
(edit-time dependent); *sum/compound all matching discounts* (non-obvious, unbounded, contradicts
"exactly one source per line" which carts and orders persist as `priceListId`).

## R9 — Where the matrix plugs into the engine

**Decision**: Replace "bracket for (list, product)" in both walks (`pickAndResolveBracket` and
`pickAndResolveBracketsForSet`) with a pure **`resolveListCandidate`** (new
`services/matrix-price-resolver.ts`) over the list's brackets, the list's matrix entries, the
reference brackets and the product facts. The list priority walk, the partitions, display mode and
`lineFromEngine` are untouched. Matrix entries are prefetched once per wave
(`price_list_id = any(…)` ∧ `(product_id is null ∨ product_id = any(…))` ∧
`(organization_id is null ∨ organization_id = any(chain))`); Default-list reference brackets are
fetched only for products whose winning candidate is a percentage without an own-list bracket;
eligible attributes are read through `catalogAttributeReadPort.listByFlag('isPriceRule')` only when
a prefetched entry names an attribute. A wave whose lists carry no entries issues exactly one
extra statement — the prefetch, an index range scan answering zero rows.

**Rationale**: Keeps the "one implementation of the chain" property issue #132 bought —
`resolveListingPrices` and `resolveEngine` keep calling the same pure helpers, so the existing
identity test (`backend/test/integration/price_lists/listing-prices-batch.test.ts`) extends to the
matrix rather than being re-proved. SC-003's bound is the prefetch plus the two conditional
statements.

**Alternatives rejected**: *a separate matrix pass after list selection* (would bypass FR-031
fall-through and price from a list the walk already left); *materialise matrix prices into
brackets* (a category entry × hundreds of thousands of products × organizations; every catalogue
change becomes a re-materialisation job — a different feature, see R11).

## R10 — Where attribute values come from

**Decision**: `PricedProductRef.attributeValues` — already part of the engine's input contract
(`pricing-service.interface.ts`), documented as the product's JSONB.

**Rationale**: Every production caller passes a `CatalogProductRecord` (carts, orders, search,
catalog, comparisons, product_feeds, buyer-line-price — grepped; no `attributeValues: {}` stub
outside tests). Zero extra queries.

**Alternatives rejected**: *re-read products through `catalogProductReadPort`* — one more statement
per wave to defend against a caller bug no caller has; a test pinning the contract
(`attributeValues` is read, never re-fetched) documents the obligation instead.

## R11 — Surfaces that do not go through the resolver

**Decision** (amended 2026-10-16 by owner decision Q1) —
- `listBracketMinQuantities` **is** extended (FR-018): union with the matrix's `min_quantity`
  values on active lists for that product (or product-less entries) and currency (or null).
  Over-inclusion is harmless by that method's own contract (the caller probes and de-duplicates).
- `orderByUnitPrice` / `pricedProductIds` (feature 086 price sort) **are** extended (FR-029). A
  candidate stream whose price list carries an entry applicable to the viewer at quantity 1
  (organization null or in the chain, window containing 1, fixed in the listing currency or a
  percentage, attribute eligible) becomes a **matrix stream**: its rows come from a derived
  relation — the list's own quantity-1 brackets, plus one branch per applicable entry over the
  product ids that entry selects, a percentage priced off the own bracket else the Default list's
  bracket, rounded half-up to 4 digits — reduced per product with `distinct on` in exactly the
  precedence key of `resolveListCandidate` (R8). Its exclusion of later streams is the predicate
  "this list prices the product", evaluated per row with indexed scalar probes. Streams without an
  applicable entry keep the index-ordered bracket shape and its watermark, so a viewer who meets no
  entry pays nothing extra. Entry selections are expanded to ids in memory before the statement:
  products directly, categories through `catalogCategoryReadPort.listProductIdsInCategory` (already
  used by the candidate streams), attribute values through a new
  `catalogProductReadPort.listProductIdsByAttributeValue`, and *all products* needs no expansion
  (a percentage on *all* covers exactly the products with a reference bracket).
- `namedListPrices` (feature 067 pinned feeds) is **not** extended (Q2).

**Rationale**: The owner ruled that a listing sorted by price must agree with the prices it shows.
Computing the matrix price inside the ordering statement keeps the identity argument of feature
086 — the same rows the card resolves, sorted — without materialising matrix prices (R9's rejected
alternative, which needs a background job and invalidation on every catalogue change). The cost is
confined to matrix streams: their rows are computed rather than read from the partial index, so
the branch sorts its derived relation instead of streaming; the bench records it.

**Alternatives rejected**: *refuse price sorting whenever a matrix entry exists* — disables sorting
for every buyer once any entry exists; *materialised matrix prices* — a background job and a second
source of truth for one sort control; *compute in memory over the whole catalogue* — infeasible at
catalogue scale; *read `products.attribute_values` in the ordering SQL* — another module's table in
this module's SQL, which `check:module-boundary` refuses (D-87).

## R12 — Tenancy (Constitution XI)

**Decision**: `PriceListMatrixEntry` is `@RuleScoped()` — its organization targeting is a nullable
coordinate, exactly the shape `RuleScoped` exists for (`org-scoped.decorator.ts`: "Org targeting
lives in a rule, not a column" — here the "rule" is the entry's coordinates). Admin reads filter
with `ruleVisibleForScope(entry.organizationId ? [entry.organizationId] : [])` *after* the parent
list's own visibility check; out-of-scope ⇒ the same 404 `PRICE_MATRIX_ENTRY_NOT_FOUND` as a missing
row. Writes naming an organization require `isOrgInScope`. Storefront resolution is unfiltered, as
for brackets today — the entry's organization coordinate *is* the buyer match.

**Rationale**: `@OrgScoped()` would apply the ORM `org` filter in customer requests, hiding the
not-organization-specific entries every buyer needs and breaking resolution. `@GlobalEntity()`
would be a misclassification: the row does target tenants.

**Alternatives rejected**: `OrgScoped` (above); `GlobalEntity` (hides the targeting from the
classification check and from reviewers); `TransitivelyScoped` via `PriceList` (the parent is
`RuleScoped`, not a tenant terminus — `assertTransitiveParentsResolve` would refuse it).

## R13 — Cache invalidation

**Decision**: Matrix writes run through `PriceListService.#runAudited`, which already calls
`invalidatePricingCache()` inside the command. No new Redis pub/sub.

**Rationale**: Identical freshness to bracket writes today (FR-026): immediate on the writing
process, ≤ 60 s TTL elsewhere. Attribute flag flips and product attribute/category changes are
outside `price_lists`' writes and are bounded by the same TTL, exactly as category-membership
changes already are for category rules. The cross-process pricing cache invalidation is a
pre-existing gap of the whole engine (the `custom_fields` definitions cache shows the pub/sub
pattern it would take); closing it for matrix writes alone would make two write paths of one module
behave differently.

**Alternatives rejected**: a `price_lists`-owned Redis channel just for matrix writes (inconsistent,
see above); subscribing to catalogue attribute events (the flag is read live per resolution
anyway, so only the LRU lags, ≤ 60 s).

## R14 — Auditing (Constitution XIII)

**Decision**: Three Command Bus actions, `objectType: 'price_list'`, `objectId` = the list id:
`price_list.matrix_entry_create`, `price_list.matrix_entry_update`, `price_list.matrix_entry_delete`,
with `before`/`after` as the entry DTO. All three are added to `recentActivity` in
`packages/modules/price_lists/src/manifest.ts` (labels in the module bundle).

**Rationale**: Same object as bracket writes (`price_list.bracket_update`), so the audit reference
resolver (`services/audit-references.ts`) already links them to the list screen.

**Alternatives rejected**: `objectType: 'price_list_matrix_entry'` — would need a second audit
reference resolver and a deep link to a tab, for no operator benefit.

## R15 — Error codes

**Decision**: Four module-owned codes, declared in `ERROR_CODES` (`packages/contracts/src/errors.ts`),
in the manifest `errorCodes`, with `errors.<CODE>` sentences in `packages/modules/price_lists/i18n/{en,pl}.json`:
`PRICE_MATRIX_ENTRY_NOT_FOUND` (404), `PRICE_MATRIX_ENTRY_OVERLAP` (409, `details.conflictingEntryId`),
`PRICE_MATRIX_ATTRIBUTE_NOT_ELIGIBLE` (400, `details.reason`: `not_flagged | not_found |
language_scoped | channel_scoped | value_type`), `PRICE_MATRIX_ENTRY_LIMIT` (409, `details.limit`).
Shape errors and unknown targets reuse `VALIDATION_FAILED`, as `assertTargetsExist` does today.

**Rationale**: Each is something the admin UI must branch on (highlight the conflicting row, explain
the attribute); D-121 T1 puts a code whose noun is this module's entity in this module.
`check:error-translations` holds the sentences.

**Alternatives rejected**: everything as `VALIDATION_FAILED` with free text (the UI could not map
the overlap to the conflicting row; the bracket overlap path does this today and its message is
English-only).

## R16 — Admin surface

**Decision**: A fourth tab **Price matrix** on `PriceListDetailPage.tsx` (`Tab = 'details' |
'products' | 'rule' | 'matrix'`), new components `PriceMatrixTab.tsx` and
`PriceMatrixEntryDialog.tsx` built from admin-kit primitives (`ModalDialog`, `ResponsiveTable`,
`PaginationFooter`, `RowActionMenu`, `ProductPicker`, `CategorySelect`/the rule-target category
list, `CurrencyPicker`). Organization and category choices reuse the existing
`/api/v1/admin/pricing/rule-targets/*` endpoints the rule builder uses (so the tab needs only
`price_lists:read`); attributes get one new endpoint, `GET /api/v1/admin/pricing/rule-targets/attributes`.
New strings go into the **module's own bundle** (`useTranslation('price_lists')`), not `core`.
No new palette action and no new route: the tab lives on a screen already reachable from the
existing `open-price-lists` action (Constitution XVI), and a deep link `?tab=matrix` is enough.

**Alternatives rejected**: a separate `/price-lists/:id/matrix` route (a second screen for one
list's data); reading `/api/v1/admin/catalog/attributes/by-flag` from the tab (gated by a catalogue
permission — a pricing role would get 403; the existing rule-target pattern exists to avoid
exactly that, issue #180).

## R17 — Limits and rounding

**Decision**: 5 000 entries per list (`PRICE_MATRIX_MAX_ENTRIES_PER_LIST` constant in contracts);
percentage results rounded half-up to 4 fractional digits using integer arithmetic on
ten-thousandths (no floating point).

**Rationale**: The prefetch is bounded by entries *that can match* (product-less or this product,
org-less or in chain), but the limit bounds the worst case and the admin list size. Four digits is
the bracket column's scale (`decimal(14,4)`), so a computed price has the same precision as a typed
one and carts/orders already carry it.

**Alternatives rejected**: a Setting for the limit (YAGNI, Constitution IV); 2-digit rounding
(would make a computed price coarser than a typed bracket; B2B unit prices like 0.0525 exist).

## R18 — Dependencies

**Decision**: No new runtime dependency. Decimal arithmetic is integer-based in a ~30-line pure
helper; UI uses admin-kit.

**Alternatives rejected**: `decimal.js`/`big.js` — one multiplication and one rounding do not
justify a dependency (Constitution IV).
