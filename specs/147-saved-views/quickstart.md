# Quickstart: Saved list views (`specs/147-saved-views/`)

How to exercise the feature by hand and which commands prove it. The per-phase commands are in
[tasks.md](./tasks.md); this page is the tour.

## Setup

```bash
pnpm install --frozen-lockfile
pnpm run build:packages        # every package resolves at ./dist
pnpm run dev:infra             # Postgres, Redis, Meilisearch
pnpm run setup                 # db:fresh, then module:install --all
pnpm run dev
```

Sign in to the admin as a platform administrator. For the cross-admin checks, also have a
second administrator whose role is `sales_representative` with at least one organization
assigned, and a third with a role holding `catalog:read` but not `catalog:write`.

## Order list (US1, #288)

1. `/orders` → apply a status and a date range → **Save view**. A dialog opens with the name
   field focused and *Share* unchecked. No browser prompt appears.
2. Press Enter with the field empty → inline message, announced; nothing saved.
3. Type 161 characters → inline length message before any request.
4. Save as `Unpaid EU`. Save again as ` unpaid eu ` → inline "already have a view" message.
5. Tab repeatedly → focus stays inside the dialog. Escape → closes, focus back on **Save view**.
6. Select the view in **Saved views**; select a colleague's shared view → listed as
   `Name (shared)`; **Delete view** is disabled unless you own it or are a platform admin.
7. **Delete view** → a confirmation naming the view (and warning for a shared one). Confirm →
   gone from the selector, filters unchanged, focus on the selector.
8. Switch the admin language to Polish and repeat 1 and 7.

## Product list (US2, #289)

1. `/catalog/products` → status *Draft*, type *Configurable*, search `chair`, Stock *Low* →
   **Save view**.
2. Reset the filters; select the view → status, type and search return, Stock is *All*, page 1.
3. As the `catalog:read`-only admin: save, load and delete your own view.

## Quote Request list (US3, #290)

1. Quote requests → scope *All*, an organization, two statuses, a search, sort *Oldest*, hide a
   column → save as shared.
2. Reset; load it → all six return.
3. As the sales representative: load the platform admin's shared view → only requests of your
   organizations; the organization filter shows no name you could not otherwise see.
4. `/platform/modules` → switch *Quote requests* off → the list and its saved views are gone;
   `GET /api/v1/admin/quote-requests/list-views` answers as the other quote-request routes do.
   Switch it on → the views are all back.

## The tests that prove it

```bash
# contracts
pnpm --filter @endora-commerce/contracts exec vitest run src/saved-list-views.test.ts src/orders.test.ts

# kit + pages (admin)
pnpm --filter admin exec vitest run test/components/ModalDialog.test.tsx test/components/SavedViewsControl.test.tsx \
  test/modules/orders/OrdersList.saved-views.test.tsx test/modules/catalog/ProductsList.saved-views.test.tsx \
  test/modules/quote_requests/RfqList.saved-views.test.tsx

# backend, from backend/, with services running
TEST_DATABASE_URL=postgresql://b2b:b2b@localhost:5432/b2b_test REDIS_URL=redis://localhost:6380 \
MEILISEARCH_URL=http://localhost:7700 MEILISEARCH_API_KEY=devMasterKeyChangeMe \
pnpm exec vitest run test/integration/saved-list-views test/contract/orders/list-and-views.test.ts \
  test/contract/catalog/product-list-views.test.ts test/contract/quote_requests/list-views.test.ts \
  test/integration/quote_requests/off-state.test.ts
```

Merge-request pipelines do not run the contract and integration suites (D-198); run them
locally before opening the pull request.
