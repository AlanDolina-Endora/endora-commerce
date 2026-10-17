# Quickstart: Admin global search

How to stand the feature up, walk it by hand, and the command block to run before calling any phase
done. Paths are relative to the repository root.

## 1. Bring-up

```bash
source ~/.nvm/nvm.sh && nvm use 22
pnpm run build:packages            # every package resolves at ./dist
pnpm run dev:infra                 # Postgres, Redis, Meilisearch
pnpm run setup                     # db:fresh THEN module:install --all (runs installHooks)
pnpm run dev
```

`admin_search` has no migration and no install hook; `module:install --all` registers it and its
activation row. Sign in to the admin as the seeded platform administrator.

## 2. Manual walk — User Story 1 (palette)

1. Press ⌘K / Ctrl+K (or click the sidebar search field). Type `ze` — only screens/actions appear
   (below the minimum length of 3).
2. Type an existing order number fragment (e.g. the first 6 characters of one shown on `/orders`).
   Within ~1 s an **Orders** group appears after *Actions*; the exact number, if typed in full, is
   first. ↓/↑ moves through screens, actions and records as one list; Enter opens `/orders/<id>`.
3. Type a company name without diacritics (`lodz` for an organization named `Łódź …`): it appears
   under **Organizations**, and its orders appear under **Orders** (field *Organization name*).
4. Type a SKU fragment → **Products**; a category name → **Categories**; Enter on a category opens
   `/catalog/categories?focus=<id>` with that row expanded, scrolled to and highlighted.
5. Paste a record UUID from any detail URL → that record is found.
6. Sign in as a **sales representative** assigned to one organization: the same searches show only that
   organization's orders, quote requests, opportunities and customers. Organizations show what the
   Organizations list shows them — every business organization — with their assigned organization
   first (owner answer to Q2).
7. Sign in with a role lacking `orders:read`: no **Orders** group at all.
8. On `/platform/modules`, switch **CRM** off: no **Sales Opportunities** group, no CRM entry on the
   configuration screen. Switch it back on: both return unchanged.
9. Switch **Global search** off: the palette shows screens and actions only; `/global-search` and
   `/global-search/configuration` are absent; its settings are read-only. Switch back on: everything
   returns.

## 3. Manual walk — User Story 2 (configuration)

1. Sidebar → System → **Global search** (or ⌘K → "Configure global search").
2. Orders: untick *Organization name*, save. Search an organization name: its orders no longer appear,
   the organization does.
3. Orders: **Restore defaults**, save → they appear again.
4. Untick every field of Products while it is included → Save is disabled with an explanation. Untick
   *Include in global search* instead → no Products group.
5. Open the screen in two tabs; save in one, then in the other → "changed by someone else, reload?".
6. Audit log: both saves are listed with before/after values.
7. Settings screen → group **Global search**: set *Minimum search length* to 2 and *Results per record
   type* to 3; the palette follows on the next open. Values outside 2–10 / 1–10 are refused.

## 4. Manual walk — User Story 3 (results page)

1. In the palette, type a text matching more than five orders; choose **See all results for “…”**.
2. `/global-search?q=…` shows up to 20 per type; choose the **Orders** chip → `&type=orders.order`,
   only orders shown.
3. Paste the URL into a sales representative's session → their own scope applies.

## 5. API smoke (with an admin session cookie in `$COOKIE`)

```bash
curl -s -b "$COOKIE" 'http://localhost:3000/api/v1/admin/global-search/capability?language=en' | jq
curl -s -b "$COOKIE" 'http://localhost:3000/api/v1/admin/global-search?q=acme&language=pl' | jq '.data.groups[] | {entityType, status, n: (.hits|length), hasMore}'
curl -s -b "$COOKIE" 'http://localhost:3000/api/v1/admin/global-search?q=a%25_&language=en' | jq '.data.groups | length'   # literal wildcards
curl -s -b "$COOKIE" 'http://localhost:3000/api/v1/admin/global-search/configuration?language=en' | jq '.data.entities[] | {entityType, enabled, fields: [.fields[] | select(.selected) | .code]}'
```

## 6. Before calling a phase done

```bash
pnpm run build:packages
pnpm -r run typecheck
pnpm -r run lint
pnpm --filter backend run test:unit:fast
pnpm --filter '!backend' run test --workspace-concurrency=1      # packages incl. admin-search, admin
pnpm --filter backend exec vitest run test/contract/admin_search test/integration/admin_search
pnpm --filter backend exec vitest run test/contract/admin_users/permission-inventory.test.ts \
  test/unit/_i18n/registered-bundles-shape.test.ts
pnpm --filter backend run check:port-dependencies
pnpm --filter backend run check:port-catches
pnpm --filter backend run check:module-boundary
pnpm --filter backend run check:subscribe-seam
pnpm --filter backend run check:entry-presence
pnpm --filter backend run check:container-imports
pnpm --filter backend run check:action-route-permissions
pnpm --filter backend run check:off-state-coverage
pnpm --filter backend run check:command-coverage -- --strict
pnpm --filter backend run check:admin-zones
pnpm --filter backend run check:module-docs
pnpm --filter backend run check:docs-translations
pnpm --filter backend run check:port-shape
pnpm --filter backend run check:bundle-pairing
pnpm --filter backend run i18n:hardcoded
pnpm --filter backend run composer:check && pnpm --filter backend run manifests:check
pnpm install --frozen-lockfile
pnpm run check:naming && pnpm run check:language
pnpm --filter backend exec tsx scripts/check-release-intent.ts --since origin/master
```

Phase 5 additionally: `PERF_CORPUS_SIZE=<reference> pnpm --filter backend run test:perf -- test/perf/admin_search`.
The full `pnpm --filter backend run test` (~1 h, all services) runs once before the merge request —
a merge-request pipeline does not run the contract and integration suites (D-198).

If a `check-*` reports a read-size drift you did not mean to move, read
`specs/conventions/check-estate.md` **first**; do not re-record from a delta.
