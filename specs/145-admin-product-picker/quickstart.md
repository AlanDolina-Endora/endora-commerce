# Quickstart: Admin product picker

How to see the feature work end to end on a local stack, and the targeted commands that prove
each part. Nothing here is a whole-repo command.

## 0. Prerequisites

```bash
pnpm run dev:infra                       # Postgres, Redis, Meilisearch
pnpm --filter @endora-commerce/contracts run build
pnpm --filter @endora-commerce/admin-kit run build
pnpm --filter @endora-commerce/mod-orders run build
pnpm --filter @endora-commerce/mod-price-lists run build
pnpm --filter @endora-commerce/mod-quote-requests run build
pnpm --filter @endora-commerce/mod-i18n run build
pnpm run setup                           # db:fresh then module:install --all (seeds a catalogue)
pnpm run dev
```

Sign in to the admin as a platform administrator (holds `orders:write`, `rfqs:handle`,
`price_lists:read|write`, `catalog:read`).

## 1. Create order (US1, US2)

1. Open `/orders/new`. **Items** and **Order summary** are not shown; a hint names *customer* and
   *sales channel*.
2. Choose a customer — the hint now names only the sales channel. Choose a channel — **Items**
   appears with **Browse products** and a quick search.
3. **Browse products** → the drawer opens on **Active**; grouped/bundle and draft/inactive rows
   show a reason and a disabled checkbox. Tick 5 on page 1, go to page 2, filter by type, tick 3
   more: "8 selected". **Show selected only** lists the 8. **Add 8** → 8 lines, quantity 1, unit
   price and line total each; the summary renders.
4. Change a quantity → the line and the summary re-price. Type `0` → the line is marked and submit
   is disabled.
5. Quick search a SKU, pick it → one line appended; reopen the picker → that row says *already
   added*.
6. Restrict a product to another organization (`/catalog/products/:id`, allowed organizations),
   add it → the line shows *The customer cannot see this product*; submit disabled; other lines
   keep their prices. Remove a product from the chosen channel's assortment, add it → *Not in this
   sales channel's assortment*; switch to a channel that has it → the line is priced.
7. Clear the customer → both sections hide; set it again → the lines are back.

## 2. Create quote request (US3)

1. Open `/quote-requests/new`, choose a customer with an organization.
2. **Browse products** → Draft and Inactive tabs are selectable; grouped/bundle are not. Add 10 →
   10 lines, quantity 1, agreed price prefilled where one resolves, empty otherwise.
3. Type a price on one line, then change its quantity → the typed price stays; another line's
   price re-resolves. Leave one price empty → submit is blocked and the line is marked.

## 3. Price list — Products & brackets (US4)

1. Open a non-system price list → **Products & brackets** → **Add**. The drawer opens on **All**;
   products already on the list are marked *already on this price list*.
2. Tick 30 across pages → **Add 30** → the drawer closes, the roster lists all 30 by name and SKU,
   the first added is selected with its bracket editor open; existing brackets are unchanged.
3. On a list whose roster has products older than the newest 20, every row shows a name and opens
   its editor.
4. Stop the backend, tick products, **Add** → the drawer stays open with the selection, an error
   and **Retry**. Start the backend, **Retry** → accepted.
5. Open the Default list → **Add** is disabled. Sign in as a role with `price_lists:read` only →
   **Add** is disabled with a hint.

## 4. API checks (curl against `http://localhost:<api-port>`, admin session cookie)

```bash
# accepted, mixed outcomes
curl -s -X POST .../api/v1/admin/price-lists-engine/<listId>/products/bulk-add \
  -H 'content-type: application/json' -b 'b2b_session=<cookie>' \
  -d '{"productIds":["<onList>","<new>","<softDeleted>"]}'
# → 200 {"data":{"added":["<new>"],"unchanged":["<onList>"],"failed":[{"productId":"<softDeleted>","reason":"product_not_found"}]}}

# Default list → 403 FORBIDDEN; unknown list → 404 NOT_FOUND; 201 ids → 400 VALIDATION_FAILED

# preview codes
curl -s -X POST .../api/v1/admin/orders/preview -H 'content-type: application/json' -b 'b2b_session=<cookie>' \
  -d '{"customerAccountId":"<c>","salesChannelId":"<ch>","items":[{"productId":"<restricted>","quantity":1}]}'
# → messages: [{"productId":"<restricted>","code":"PRODUCT_NOT_VISIBLE_TO_CUSTOMER"}]
```

## 5. Targeted automated checks

```bash
# contracts
pnpm --filter @endora-commerce/contracts exec vitest run src/price-lists.test.ts src/orders.test.ts
# pure domain
pnpm --filter @endora-commerce/mod-price-lists exec vitest run src/backend/services/bulk-add-partition.test.ts
pnpm --filter @endora-commerce/mod-orders exec vitest run src/backend/services/preview-line-availability.test.ts
# routes (Postgres)
pnpm --filter backend exec vitest run test/contract/price_lists/price-list-products-bulk-add.test.ts
pnpm --filter backend exec vitest run test/contract/orders/admin-order-preview-availability.test.ts
pnpm --filter backend exec vitest run test/contract/orders/admin-order-preview.test.ts
pnpm --filter backend exec vitest run test/contract/kernel/openapi-baseline.test.ts
# admin
pnpm --filter admin exec vitest run test/kit/kit-product-browser-selectability.test.ts test/kit/kit-product-browser.test.tsx
pnpm --filter admin exec vitest run test/modules/orders/OrderCreatePage.gating.test.tsx test/modules/orders/OrderCreatePage.product-browser.test.tsx
pnpm --filter admin exec vitest run test/modules/quote_requests/RfqCreatePage.product-browser.test.tsx
pnpm --filter admin exec vitest run test/modules/price_lists/PriceListProducts.bulk-add.test.tsx
```
