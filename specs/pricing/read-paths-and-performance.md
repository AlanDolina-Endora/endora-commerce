# Pricing — read paths and performance

Every place a price is **read** — listings, PDP, search, typeahead, cart, checkout, quotes, promotions — with its query shape, caching, measured cost and known N+1 paths. The summary table comes first; the detailed audit follows.

**Verified against** `master` at `b1021c71b` on 2026-10-21. File:line citations are as of that commit; re-check them before relying on one.

**Section numbers.** `§N` references follow the numbering of the original analysis, which is split across this directory: §1 → `current-model.md`; §2 → `read-paths-and-performance.md` (its summary table); §3–§9, §11, §12 → `decision-record.md`; §10 → `worked-examples.md`. `read-paths §N` points into `read-paths-and-performance.md`, `peers §N` into `peer-platforms.md`. Path abbreviations: `PL/` = `packages/modules/price_lists/src/`, `CON/` = `packages/contracts/src/`, `CAT/` = `packages/modules/catalog/src/`, `SF/` = `storefront/`.

---

## Summary

| Path | Cost (cold) | Notes |
| --- | --- | --- |
| Listing page, 50 cards (`resolveListingPrices`) | 14–15 statements, p95 ≈ 22 ms on 120 products | batched; CPU O(products × active lists); `listing-price-viewer-cost.bench.ts:43-68` |
| Same with matrix entries | p95 11–15 ms on 2 000 products | `backend/test/perf/price_lists/matrix-resolver.bench.ts:37-45` |
| `resolveEngine` (PDP, cart line) | ≈ 7 statements; p95 8.5–11 ms, 50 lists | `backend/test/perf/price_lists/resolver.bench.ts:39-46`; PDP prices the product twice (read-paths §2.1) |
| Price-sorted first page | 3.1 ms no matrix; 41.4 ms category %; 21.3 ms all-products % (2 000 products) | merge of index streams (`PL/backend/services/unit-price-ordering.ts:1-41`) |
| Search (Meilisearch) | index carries **no price**; hits re-priced from Postgres; price sort/range routed to Postgres | `packages/modules/search/src/backend/services/search-query.service.ts:78-84, 262-291` |
| N+1 survivors | home bestsellers, typeahead, external catalog API, cart GET recompute, buyer line price | read-paths §2.3, §5 |

Not measured anywhere: > 5 000 products on the listing path, hundreds of org-targeted lists,
category-heavy rules, multi-replica cache behaviour (read-paths §7).

---

## Detailed audit

Read-only audit. "Inferred" marks a conclusion drawn from code that was not executed or measured.

## 0. The data model in one paragraph

| Table | Role | Key / indexes |
| --- | --- | --- |
| `price_lists` | header: `type base|sale`, `status draft|active|scheduled|expired`, `starts_at/ends_at`, `application_rule` JSONB, `is_system`, `modified_at`; legacy `code/currency/priority/is_default` still present | `PL/migrations/20260426T075235…:24-38`, engine cols `20260504T125655…:44-91`; `status`, `type`, `modified_at` idx (`…engine.ts:80-92`); singleton `is_system` partial unique (`20260817T055457…:49-51`) |
| `price_list_products` | (list, product) assignment | PK `(price_list_id, product_id)`, idx `product_id` (`…engine.ts:97-111`) |
| `price_list_price_brackets` | the actual price: per (list, product, currency, min_qty) with `max_quantity`, `amount numeric(14,4)` | PK `(price_list_id, product_id, currency_code, min_quantity)`, FK to assignment (`…engine.ts:117-138`); partial covering `(price_list_id, currency_code, amount, product_id) where min_quantity = 1` (`20260821T135907…:37-45`). **No index leading with `product_id`.** No variant column. |
| `price_list_matrix_entries` (feature 148) | rule-based rows: product / category / attribute / all × optional org × qty window × fixed or %-off | `20261016T131148…:26-87`, 5 indexes (`:73-87`) |
| `price_display_mode_overrides` | gross/net/both/none per org/category/product | PK `(scope, target_id)` (`…engine.ts:143-156`) |
| `price_list_items`, `price_list_assignments` | feature-014 legacy tables, still created, not read by the engine (inferred: no reference in `PL/backend/services/pricing-service.ts`) | `20260426T075235…:41-82` |

Rule targeting (org / customer group / category / sales channel / currency) lives **inside
`application_rule` JSONB**, not in columns (`20260817T055457…:14-18`). So "which lists apply to
this buyer" cannot be answered by an index — every resolution loads **all active lists** and
evaluates every rule in memory (`PL/backend/services/pricing-service.ts:440-455`, `:664-694`,
`:993-1004`).

Priority (`PL/backend/services/price-list-resolver.ts:7-16, 27-57`): org (nearest in the org
inheritance chain) → customer group → category → sales channel → anything else (Default lives
here); tie-break newest `modifiedAt`, then name. The legacy `priority` column is ignored by the
engine (only `PriceListReadService.listAll/listActive` order by it, `price-list-read-port.ts:39-55`).
Sale partition wins whenever it resolves anything (`pricing-service.ts:88-110`).

---

## 1. Base price — where it lives, and is it guaranteed?

**There are two sources of a base price, and neither is guaranteed.**

1. **System `Default` price list** — deterministic id `00000000-0000-4000-8000-00000000d51b`,
   `is_system = true`, `application_rule {kind:'all'}`, seeded by
   `PL/migrations/20260504T125655_price_lists_engine.ts:167-218` and
   `PL/backend/services/default-price-list-migration.ts:22, 47-60`. DB-enforced singleton since
   `20260817T055457…:38-52`; cannot be deleted (`price-list-service.ts:338-343`), cannot leave
   `active` or narrow its rule (`price-list-service.ts:360, 379`). Its brackets are the
   platform's intended catalogue price.
2. **`products.attribute_values.defaultPrice` (fallback `price`)** — a bare number, no currency,
   **still edited by the admin Product editor** (`CAT/admin/pages/ProductEditor.tsx:267-278`) and
   whitelisted as a "virtual attribute" (`CAT/backend/services/catalog-admin.service.ts:114-125`).

The migration copied (2) into (1) **once** (`…engine.ts:226-301`: identity-copy per channel
currency, fallback PLN). Nothing keeps them in sync afterwards: `price_lists` has no event
subscriber and no product-create hook (grep of `PL/backend` for `subscribe|eventBus|product.created`
returns nothing). So a product created or re-priced in the Product editor after the migration has
**no Default-list bracket** unless an operator adds one in the price-list editor.

Consequences:
- The listing chain is *"applicable list → product's own `defaultPrice` → nothing"*
  (`PL/backend/services/listing-price-chain.ts:7-11, 24-53`). The own-price arm applies only when
  the requested currency equals the channel default (`:49`).
- The cart applies the same fallback but labels it **hard-coded `PLN`**
  (`packages/modules/carts/src/backend/services/cart-line-pricing.ts:69, 143-145`) — it does not
  apply the currency guard the listing chain does. On a non-PLN channel the card and the cart line
  disagree on currency (inferred from the two code paths).
- Price-sort and price-range ignore the own-price arm entirely; those products go to the
  "unpriced tail" (`CAT/backend/services/catalog-query.service.ts:949-959`).
- Variant prices do not exist: brackets have no `variant_id` (`…engine.ts:117-138`); `variantId`
  is only part of the cache key (`pricing-service.ts:410-418`), never a lookup dimension. (Issue
  #377 asks for variant prices.)
- Guarantee: **no** — not every product has a Default bracket, and not every product has a
  `defaultPrice`. "No price" is a first-class answer (`source: 'none'`).

---

## 2. Storefront PLP / category / PDP — endpoints, buyer context, round trips, caching

### 2.1 Which endpoints the storefront calls

| Surface | Storefront code | Backend endpoint | Price resolution |
| --- | --- | --- | --- |
| Category page `/c/[slug]`, `/catalog`, `/search` | `SF/app/(catalog)/c/[slug]/page.tsx:82`, `SF/app/(catalog)/catalog/page.tsx:49`, `SF/app/(catalog)/search/page.tsx:49` → `SF/lib/api/catalog.ts:82-110` | `GET /api/v1/catalog/products` | batched `resolveListingPrices` (qty 1) |
| PLP card | `SF/components/ProductGrid.tsx:43` renders `<ProductCard>` **without** `resolved` | — | uses `ProductSummary.price` = `{amount,currency}` only (`packages/contracts/src/price-lists.ts:540-546`) → **no sale/strikethrough, no display-mode on PLP cards** |
| Home "bestsellers" | `SF/app/page.tsx:62-78` | `GET /api/v1/catalog/products?limit=4` **plus** `getResolvedPricesBulk` → N × `GET /api/v1/storefront/products/:id/resolved-price` | **N+1 HTTP** (fan-out, concurrency 8, `SF/lib/api/pricing.ts:116-137`; comment `:10-13` says the batch route "is not yet implemented") |
| PDP `/p/[slug]` | `SF/app/(catalog)/p/[slug]/page.tsx:130, 138-141` | `GET /api/v1/catalog/products/:slug` **and** `GET /api/v1/storefront/products/:id/resolved-price?quantity=1` | the product is priced **twice**: once by `resolveListingPrices([product])` (`CAT/backend/services/catalog-query.service.ts:1293-1299`), once by `resolveEngine` (`PL/backend/routes.storefront.ts:148-209`). PDP passes no `variantId` (`page.tsx:140`). |
| Cart page | `SF/app/(commerce)/cart/page.tsx:152` | `GET /api/v1/storefront/pricing/display-mode/:productId` (first item only) | display-mode chain |
| Typeahead | `SF/components/SearchAutocomplete.tsx:346-355` | `GET /api/v1/search/suggest` | per-item `resolveEngine` (see §4) — the one listing-like surface that **does** show strikethrough |
| External catalog API (`/api/v1/external/catalog/*`) | n/a (B2B integrations) | `CAT/backend/services/catalog-org-price-decorator.ts` | **N+1**: sequential `resolveLinePrice` per summary (`:102-125`), per bulk line (`:175-214`), and per tier quantity for the ladder (`:224-256`) |

### 2.2 Buyer context

- **Organization**: from the session's `ProductAudience.organizationId`, loaded through
  `OrganizationDetailsPort` once per page (`CAT/backend/services/catalog-query.service.ts:533-544`;
  storefront routes `PL/backend/routes.storefront.ts:60-74`). Org inheritance chain via
  `organizationInheritancePort.priceListOrgChain` (`PL/backend/index.ts:142-143`).
- **Customer group**: only the **organization's** group (`pricing-service.ts:624-625`). The
  customer's own group override (feature 040) is *not* resolved on listings, the PDP endpoint
  (`routes.storefront.ts:172-175` says so explicitly), or the cart (`cart-line-pricing.ts:111-120`
  passes no `customerGroupId`). It **is** resolved by `BuyerLinePriceService`
  (`PL/backend/services/buyer-line-price-service.ts:119`) and admin order preview
  (`packages/modules/orders/src/backend/routes.ts:974-983`). → Same buyer can get different list
  winners on PLP vs. quote vs. admin order (inferred from the inputs).
- **Sales channel**: resolved once by middleware (`getResolvedChannel`, `routes.storefront.ts:125, 166`).
  A non-public channel skips pricing entirely (`catalog-query.service.ts:516`).
- **Currency**: `?currency=` from the `currency` cookie (`SF/lib/api/catalog.ts:39-43`), normalised
  to "omit if equal to channel default" (`packages/contracts/src/price-lists.ts:775-785`). The cart
  and the typeahead ignore it: cart prices in the channel default (`cart-line-pricing.ts:111-120`),
  suggest passes no currency (`packages/modules/search/src/backend/services/suggestion-pricing-enricher.ts:83-86`).

### 2.3 Query cost per listing page (`resolveListingPrices`, `PL/backend/services/pricing-service.ts:616-757`)

Batched — one call for the whole page (`catalog-query.service.ts:735-749`). Statements on a cold
cache, independent of page size except where noted:

1. category memberships for the page, one `in(...)` via catalog port (`:654`, `:337-347`);
2. org chain, if signed in (`:658-663`);
3. **all active price lists** (`:664`), each row carrying a correlated `exists()` on matrix entries
   (`PL/backend/entities/price-list.entity.ts:90-94`);
4. per product, in memory: evaluate every active list's rule (`:668-694`) — **O(products × active lists)** CPU;
5. matrix entries for matched lists, 0–1 statement (+1 attribute read if an entry names an
   attribute) (`:231-272`, `:701-714`);
6. brackets in **priority waves** — one `price_list_id in(…) and product_id in(…)` statement per
   fall-through level per partition (`:1268-1354`); normally 1 for base, 0–1 for sale; +1 for
   Default brackets when a %-matrix entry needs a reference (`:278-291`);
7. display modes for the page (`:729-735`, `price-list-service.ts:1190+`).

The method's own header records the history: the previous per-product loop was **7 sequential
queries per product — 350 round trips / 315 ms for a 50-card page** (`pricing-service.ts:575-583`).
Measured after batching: a 50-card page cold = **14 statements, 61.9 ms anon / 15 statements,
32.1 ms signed-in; p95 22 ms** (`backend/test/perf/catalog/listing-price-viewer-cost.bench.ts:43-68`;
corpus only 120 products, no categories — `:70-82`).

Per-product, non-batched paths still in production use (all cache-miss cost ≈ 7 statements each,
sequential):
- PDP `resolved-price` → `resolveEngine` (1 product, fine).
- Home page bestsellers: 4 × HTTP × `resolveEngine` (`SF/app/page.tsx:74-78`).
- Typeahead: `Promise.all` of `resolveEngine` per hit (`suggestion-pricing-enricher.ts:78-102`).
- External catalog API summaries, bulk and tier ladder (`catalog-org-price-decorator.ts:109, 186, 238`).
- Cart GET recompute, cart add/merge, placement drift check, buyer line price, order intake —
  all loop `resolveLinePrice` per line (§5).
- `resolveEngine` additionally **constructs a new `PriceListService` per call** via dynamic import
  to resolve display mode (`pricing-service.ts:491-504`) — 1–4 more statements
  (`price-list-service.ts:1070-1125`).

### 2.4 Caching

| Layer | Where | Key | TTL | Invalidation |
| --- | --- | --- | --- | --- |
| **`PricingCache` — in-process LRU, not Redis** | `PL/backend/services/pricing-cache.ts:1-106`, one instance per process (`PL/backend/plugin.ts:138-164`) | `(productId, variantId, quantity, currency, salesChannelId, organizationId, customerGroupId)` (`:25-33, 96-106`) | 60 s (`:40`), capacity 5 000 (`:41`); tests use 0 (`PL/backend/index.ts:50-56`) | `invalidateAll()` on every audited `PriceListService` write (`price-list-service.ts:236-238, 284-303`), incl. matrix writes (`price-matrix-service.ts:41-46`) |
| cart recompute | Redis `b2b:cart:recompute:<cartId>` (`packages/modules/carts/src/backend/services/cart-recompute-cache.ts:20-21`) | cartId | 30 s | `invalidate(cartId)` on cart writes (`:77-80`); hit check is by cartItemId only, not quantity (`cart-pricing-recompute.ts:176-179`) |
| Next Data Cache (storefront) | `SF/lib/api/client.ts:120-156` | URL (+channel/lang headers) | 60 s, **anonymous only**; signed-in = `no-store` | tags `pricing:resolved`, `pricing:product:<id>`, `catalog:products` (`SF/lib/api/pricing.ts:95, 159`, `SF/lib/api/catalog.ts:108`) — **no backend code posts these tags** (grep of `packages`/`backend/src` for them is empty; the shared tag vocabulary covers only CMS/megamenu, `packages/contracts/src/storefront-cache-tags.ts:20-38`) |
| HTTP | backend sets `Cache-Control: private, no-store` for org-bound responses (`markPersonalisedPricing`, `routes.storefront.ts:112, 156`) | | | |

Gaps (code-verified unless marked):
- **Multi-process staleness**: `invalidateAll` clears only the writer's process. `PricingCache` is
  not registered in the kernel's `InProcessCacheRegistry` (`packages/platform/src/kernel/cache/in-process-cache-registry.ts`; no registration in `PL/`), and there is no pub/sub. Every other API/worker replica serves the old price for up to 60 s.
- **Scheduler does not invalidate**: `PriceListStatusWorker.sweep` flips `scheduled→active` /
  `active→expired` with no cache call (`PL/backend/services/price-list-status-worker.ts:63-96`), and
  sweeps every 5 min (`:8`) → a sale "starting at 00:00" goes live 0–5 min + 0–60 s late.
- **Catalog-side writes do not invalidate**: category membership (drives category rules and display
  mode) and `defaultPrice` (own-price arm) are written by `catalog`, which never touches the pricing
  cache (grep).
- **Invalidate-before-commit race (inferred)**: inside the Command Bus path the cache is cleared in the
  `run` callback (`price-list-service.ts:289-293`), i.e. before the transaction commits; a concurrent
  read in that window re-caches the pre-write value for 60 s.
- **Worst-case anonymous staleness ≈ 60 s Next + 60 s backend LRU** (inferred from both TTLs, no tag
  revalidation).
- **Hit rate collapses for B2B**: 99.0 % anonymous vs **5.3 % at 50 organizations**
  (`listing-price-viewer-cost.bench.ts:24-27`) because `organizationId` is in the key even when the
  org's winning list is the same as everyone's.

---

## 3. Sort by price / price range on listings

- Route: `CAT/backend/routes.public.ts:219-226` refuses a price sort when the page shows no prices;
  any price sort or range **forces Postgres**, never Meilisearch (`:256-275`).
- Implementation: `CatalogQueryService.#listByViewerPrice` (`CAT/backend/services/catalog-query.service.ts:924-1125`)
  → `PricingService.orderByUnitPrice` (`PL/backend/services/pricing-service.ts:791-883`) →
  SQL builder `PL/backend/services/unit-price-ordering.ts`.
- **Buyer-specific**: yes. The viewer's candidate vector (`price-list-candidate-vector.ts:8-67`) is
  built from the same rules/priority as the card; sale streams lead base streams (`:35-41`). Every
  candidate list = one "stream". Identity with the card price is asserted by
  `test/integration/price_lists/unit-price-ordering.test.ts` (cited at `pricing-service.ts:773-776`).
- **Unit price only (qty 1)**: `min_quantity = 1` everywhere (`unit-price-ordering.ts:168-172`);
  the storefront says so to the buyer (`SF/components/CatalogToolbar.tsx:46-53`).
- SQL shape (`unit-price-ordering.ts:136-241`):
  ```sql
  select product_id, amount, stream_index from (
    (select b.product_id, b.amount, 0 from price_list_price_brackets b
      where b.price_list_id = $L0 and b.currency_code = $C and b.min_quantity = 1
        [and b.product_id = any($ids::uuid[])]            -- category rule / category filter
        [and (b.amount, b.product_id) > ($a, $p)]         -- keyset cursor
        [and b.amount between …]                          -- price range
      order by b.amount, b.product_id limit $n)
    union all
    (select … where b.price_list_id = $L1 …
        and b.amount <= $watermark                        -- bound from stream 0
        and (select 1 from price_list_price_brackets x0
              where x0.price_list_id = $L0 and … and x0.product_id = b.product_id limit 1) is null
      order by … limit $n)
    …) t order by amount, product_id
  ```
  Two statements per chunk: probe of stream 0 (fixes watermark), then merge of the rest
  (`pricing-service.ts:810-866`). Served from the partial covering index
  (`20260821T135907…:17-31`: 7.4 MB per 112k assignments, 132 MB per 1.6M; without it 206 ms + disk
  sort). Design measurements: `not exists` 208 ms vs scalar `limit 1` 0.69 ms; unbounded shadowed
  stream 179 ms vs watermark 2.88 ms (`unit-price-ordering.ts:13-41`).
- Matrix-bearing lists replace the index scan with a derived `distinct on` relation over
  `unnest(uuid[])` + correlated reference subqueries (`unit-price-ordering.ts:256-324`) — not index-ordered.
  Bench: ordered first page 3.1 ms without matrix, 41.4 ms with a category %, 21.3 ms with all-products % (`backend/test/perf/price_lists/matrix-resolver.bench.ts:37-45`).
- Cost drivers that scale with catalogue size (code-verified, magnitude inferred):
  - `restrictToProductIds` = **all product ids in the category tree** loaded into memory and shipped as
    a `uuid[]` literal in every chunk (`catalog-query.service.ts:972-974`, `unit-price-ordering.ts:176-179`).
  - Category rules: `listProductIdsInCategory` **sequentially per category id** (`pricing-service.ts:1160-1177`);
    matrix category/attribute selections the same (`:1085-1112`).
  - Visibility/channel/attribute filtering happens **after** each chunk in Node; scan budget
    `8 × limit` (`catalog-query.service.ts:199, 985, 1001-1004`) → short pages (open issue **#235**).
  - Unpriced tail: products-by-createdAt chunk + `pricedProductIds` per chunk (`:1038-1100`).
  - No total count on price-sorted pages by design (`:1120-1123`).
- **Price range without price sort** (`#listWithPriceRange`, `catalog-query.service.ts:1127-1200+`):
  not pushed into SQL — walks the default ordering in chunks, resolving prices per chunk, same
  8× budget → short pages under a selective range.

---

## 4. Search (Meilisearch) and admin_search

- **No price in the index**, deliberately: `IndexedDocument` has no price field
  (`packages/modules/search/src/backend/services/search-indexer.ts:135-153`). The legacy
  `attributes.defaultPrice` is still present inside `attributes` (`:150-152, 169`).
- Sortable attributes: only `createdAt`, `name` (`search-indexer.ts:69`). So **no price
  sort/filter in Meilisearch**; a request with `q` + price sort/range is routed to the Postgres ILIKE
  path (`CAT/backend/routes.public.ts:270-275`), losing typo tolerance (`:31-34`) (inferred consequence).
- **Re-priced after the hit, buyer-specific**: hits are re-read from Postgres and priced with the
  same batched `resolveListingPrices` for the viewer and currency (`packages/modules/search/src/backend/services/search-query.service.ts:262-291`) — "four statements" per page (`:273-275`). Audience filtering also post-hoc → short pages (#235).
- **Typeahead** (`suggestion-pricing-enricher.ts:65-103`): per-hit `resolveEngine` in `Promise.all`
  (N parallel, ≈7 statements each on miss), returns `basePrice`/`salePrice`/`displayMode` — so
  suggestions show strikethrough while PLP cards don't. No currency passed (`:85`).
- `admin_search`: no price references in `packages/modules/admin_search/src` (grep for `price`
  returns nothing) — irrelevant.

---

## 5. Carts / orders / quote requests

**Two different "cart line price" implementations exist.**

1. `CartLinePricing.orderablePrice` (`packages/modules/carts/src/backend/services/cart-line-pricing.ts:20-146`):
   agreed price **only at the agreed quantity** (`:22-26, 150-159`) → `resolveLinePrice` at the
   line's quantity (brackets apply to the actual qty, `:27-28`) → own `defaultPrice` in PLN
   (`:143-145`) → unpriced. Display mode `none` = quote-only (`:122-134`). Amount rounded to 2 dp
   (`:138`) while brackets store 4 dp. Used on add/merge/qty change (`cart-service.ts:572, 672, 699, 917, 1188`) and at placement.
2. `CartPricingRecompute.recompute` (`cart-pricing-recompute.ts:68-158`) for `GET /api/v1/cart`
   (`carts/src/backend/routes.ts:268-291`): plain `resolveLinePrice` per line, **no agreed price,
   no own-price fallback, no display-mode check**; Redis 30 s. Header admits "per-line today (no
   batched variant)" (`:25-28`). `writeBackTo` (`:161-174`) has no caller (grep).
   → The cart page and checkout can show different figures — open issue **#168**.

**Re-resolution at checkout: yes.** Order placement calls `cartPlacementApply.findPriceDrift` inside
the placement transaction, which re-runs chain (1) per line and refuses with `409 CART_PRICE_CHANGED`
on any difference (`packages/modules/orders/src/backend/services/order-service.ts:1696-1727`;
`carts/src/backend/services/cart-placement-apply-port.ts:130-178`). Note it goes through the
in-process `PricingCache`, so "current" can be up to 60 s old / another replica's view (inferred
from §2.4).

Quote requests: reference price at submit via `BuyerLinePricePort`
(`packages/modules/quote_requests/src/backend/services/reference-price.ts:5-16, 66-90`) →
`BuyerLinePriceService` (chunks of 100, **sequential `resolveLinePrice` per line**,
`buyer-line-price-service.ts:122-162`); resolves the account's own customer group (`:119`). An
accepted quote seeds the cart with the agreed price + agreed quantity (chain 1, step 1). Quote line
currency is hard-coded PLN (open issue **#303**).

Orders: admin order preview prices per line with currency and customer group
(`orders/src/backend/routes.ts:974-984`); external order intake only probes "is there any price"
with `defaultPrice` fallback (`order-api-intake-service.ts:352-376`).

---

## 6. Promotions vs. sale price lists vs. compare-at

- Price lists have `type base | sale` (`…engine.ts:58-61`). A sale list is a separate partition;
  when it prices the product it **wins outright** (`pricing-service.ts:88-110`). There is no
  "compare-at" field — the "was" price is simply the base partition's bracket.
- Strikethrough is rendered only where the full engine result (`basePrice` + `salePrice`) reaches the
  UI: PDP (`SF/app/(catalog)/p/[slug]/page.tsx:311`, `SF/components/pricing/BaseSalePriceBlock.tsx:13-15, 80-110`),
  home bestsellers and typeahead. **PLP cards get only the winning amount** (`ProductSummary.price`;
  `listingPriceFrom` drops `isSale` on the wire via `listingPriceMoney`, `packages/contracts/src/price-lists.ts:540-546`;
  `SF/components/ProductGrid.tsx:43`).
- Promotions (`packages/modules/promotions`) are **cart-only** and compute **on top of the stored
  cart line `unitPrice`** — i.e. on the already-resolved sale/base/agreed price
  (`promotion-service.ts:324-335`, `backend/actions/util.ts:9, 24`). Rule dimensions: cart total,
  payment/delivery method, country, postcode, organization, customer group, category, attribute
  (`promotion-rule-evaluator.ts:36-80`). **No "price list" / "is on sale" criterion** — a promotion
  stacks on a sale price with no way to exclude it. Promotions are never shown on PLP/PDP; the
  toolbar note says "promotions are applied in the cart" (`SF/components/CatalogToolbar.tsx:46-53`).
  `price_lists` is only an optional rule dimension in the manifest (`promotions/src/manifest.ts:37-41`).

---

## 7. Performance tests, budgets, indexes

Benches (all `describe.skipIf(PERF_RUN !== 'true')`):

| Bench | What | Budget / measured |
| --- | --- | --- |
| `backend/test/perf/price_lists/resolver.bench.ts` | `resolveEngine`, 50 active lists, no cache | spec target p95 < 50 ms (`:24`); measured p95 8.5–11 ms; budget **35 ms** (`:39-46, 64`) |
| `backend/test/perf/catalog/listing-price-cost.bench.ts` | anonymous priced page over HTTP | measured p95 77–87 ms; budget **275 ms** (`:28-46`) |
| `backend/test/perf/catalog/listing-price-viewer-cost.bench.ts` | cold/warm, anon vs signed-in, statement counts | 14/15 statements cold, p95 ~22 ms (`:43-68`); corpus 120, no categories (`:70-87`) |
| `backend/test/perf/price_lists/matrix-resolver.bench.ts` | listing + ordered page with matrix entries | listing p95 11–15 ms (budget 60), ordered 3–41 ms (budget 150) (`:37-58`) |
| `backend/test/perf/catalog/price-sort-cost.bench.ts` | query plans of the merge, 5 000 products | plan-shape comparisons (`:17-41`) |
| `backend/test/perf/catalog/listing-filtered-page.bench.ts`, `listing-card-reads-cost.bench.ts`, `carts/cart-routes.bench.ts` | adjacent | not pricing-specific |

What is **not** measured (gap): catalogue scale beyond 5 000 products for the listing path; many
(100s) active price lists with org-targeted rules (the resolver loads and evaluates all of them per
request); category-rule-heavy configurations; multi-replica cache behaviour; typeahead and
external-API N+1 paths; cart/checkout with large baskets.

Specs: the canonical tree carries only `specs/148-price-list-matrix-rules/` for pricing
(plan `:55` "budget test"); features 011 (engine) and 086 (price sort) are pre-migration and
reachable only as citations (`specs/pre-migration-history/`). `specs/deferred-defects.md` **does not
exist** in this checkout.

Complexity summary (per request, cache miss):

| Path | Statements | Scaling |
| --- | --- | --- |
| Listing page (batched) | ~8–15 | constant in page size; CPU O(products × active lists) |
| `resolveEngine` / `resolveLinePrice` | ~7 (+1 per bracket fall-through) | per product / per line |
| Cart GET, add, placement drift, quote reference, order preview, external API, typeahead | ~7 × lines | **linear, sequential** (typeahead parallel) |
| PDP | listing batch(1) + resolveEngine | 2 resolutions |
| Price-sorted page | 2 per chunk + visibility/tail reads; up to 8×limit rows scanned | O(category size) for the id array; O(categories in rules) sequential reads |

---

## 8. Known issues — why pricing keeps coming back

Public tracker (`gh issue list … --search price`), pricing-related:

| # | State | Title (short) | Theme |
| --- | --- | --- | --- |
| 378 | open | Replace "Products & brackets" with a rebuilt multi-currency Price matrix | two authoring models (brackets vs matrix) |
| 377 | open | PDP: configurable products (variant price) | no variant dimension |
| 168 | open | `GET /cart` shows re-resolved prices, checkout uses stored | two cart price chains |
| 166 | open | Reorder seeds the basket at old order prices | stored vs resolved price (now caught by placement drift 409 — inferred) |
| 165 | open | Quote-seeded line keeps agreed price at any quantity | addressed in code by `cart-line-pricing.ts:150-159` (commit `7d2d00fcc`) but issue still open |
| 167 | open | Quote validity checked at seeding, not placement | agreed-price lifecycle |
| 303 | open | Quote lines always stored in PLN | hard-coded currency |
| 235 | open | Search and price-ordered lists answer short pages | post-hoc filtering + scan budget |
| 96 | open | `DisplayModeOverrideRow` untranslated | — |
| 236 | closed | Quote-only product could be added to cart when no list held it | display mode vs unpriced |
| 249 | closed | Currency never forwarded by the storefront | currency plumbing |
| 151 | closed | Product list filtered after cutting the page | pagination correctness |
| 279, 284, 291 | closed | base price in quote view; disable negotiation; picker in tier editor | admin UX |

**Caveat on issue numbers in code comments**: most `issue #NNN` citations in pricing code (#50,
#84, #124, #132, #143, #227, #263, #265, #271, #287) refer to the **pre-migration** tracker; on the
public GitHub tracker the same numbers are unrelated PRs/issues (e.g. #132 = a docs fix, #265 = an
SEO feature). #151, #236, #249 do match. Cite slugs/MRs, not bare numbers, in the redesign.

Recurring root causes visible in code:
1. **Multiple sources of truth for "the price"**: `defaultPrice` attribute vs Default list brackets
   vs matrix entries vs stored `cart_items.unit_price` vs agreed quote price vs reorder snapshot (§1, §5).
2. **Multiple resolution chains** written by each consumer: listing chain, cart `orderablePrice`,
   cart `recompute`, order intake probe, buyer-line-price — each with different inputs
   (currency, customer group, agreed price, own-price currency) (§2.2, §5).
3. **Rules in JSONB** → no indexable "which lists apply to me", full active-list scan + in-memory
   evaluation every request, and price-sort needs a bespoke stream-merge SQL engine (§0, §3).
4. **Per-viewer prices can't be indexed** in Meilisearch → search can't sort/filter by price (§4).
5. **Cache is per-process, coarse, and not wired to scheduler or catalog writes** (§2.4).
6. **Currency and variant are second-class**: hard-coded PLN in cart/quote, no variant column,
   currency not passed on cart/typeahead (§1, §2.2, #303, #377).
7. **N+1 survives on every non-listing path** (§2.3, §7).
