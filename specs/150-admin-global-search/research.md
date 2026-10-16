# Research: Admin global search

**Feature**: `specs/150-admin-global-search/` | **Date**: 2026-10-16

Every decision is stated as **decision → rationale → alternatives rejected**. Evidence cites the
files read on `origin/master` at `91f7aaa26`.

## Starting point — what exists

| Concern | Today | Evidence |
| --- | --- | --- |
| Admin "search" UI | The ⌘K **command palette** in the shell. The sidebar search field is `readOnly` and only opens the palette. Groups: *Assistant*, *Navigate* (static `PALETTE_ITEMS`), *Actions* (server-fed). One list, one cursor, one Arrow/Enter loop; `matchesQuery` folds diacritics. No record search. | `packages/admin-shell/src/components/AppShell.tsx` (`CommandPalette`, `matchesQuery`, `b2b-sidebar__search-input`) |
| Palette actions | Manifest-declared `actions`, reconciled into `module_actions` by `admin_actions`, served by `GET /api/v1/admin/admin-actions` already filtered by module presence and permission, labels resolved server-side. `admin_actions` is deactivatable. | `packages/modules/admin_actions/src/manifest.ts`, `.../backend/routes.admin.ts` |
| `search` module | **Storefront product** search: per-sales-channel Meilisearch indexes, typeahead, phrase analytics, LLM hybrid search. Switch `search.enabled` describes storefront behaviour; depends on `catalog`, `price_lists`, … | `packages/modules/search/src/manifest.ts` |
| Twin-repo history | `specs/020-admin-search-actions/` (pre-migration) explicitly put *content search from the palette* out of scope. No later spec picked it up. | `/home/mzabielski/www/b2b-platform/specs/020-admin-search-actions/spec.md` § Background |
| Per-entity list search | Organizations: `nameSearch` (diacritic-folded) or `taxId` ILIKE. Customers: `CustomerAccountAdminSearchPort.search` (email/first/last). Orders: `OrderListService.list({q})` (business id, org name via `organizationDetails.searchIdsByName`, customer via `customerAccountRead`). CRM: `OpportunityService.list({q})` (title, number, org name). Products: `CatalogAdminService.listProducts({q})` (sku, slug, `name::text`). **Quote Requests: no text search** (`RfqAdminService.listAll` loads every row and filters scope in memory). **Categories: no text search** (tree screen). | `packages/modules/organizations/src/backend/routes.admin.ts:205-235`, `packages/modules/customers/src/backend/services/customer-admin-query-service.ts`, `packages/modules/orders/src/backend/services/order-list-service.ts`, `packages/modules/crm/src/backend/services/opportunity-service.ts:486`, `packages/modules/catalog/src/backend/services/catalog-admin.service.ts:1252`, `packages/modules/quote_requests/src/backend/services/rfq-admin-service.ts:145` |
| Tenant scope | Admin requests carry a tenant context derived from the role: `all` for platform admins, `allowed-set` for sales reps. `@OrgScoped` entities (`orders`, `quote_requests`, `crm_opportunities`, `customer_accounts`) are filtered by the global filter; `@GlobalEntity` ones (`organizations`, `products`, `categories`) are not. `orgConstraintFor()` / `orgScopeWhere()` are the published helpers. | `packages/platform/src/tenancy/derived-scope.ts`, entity decorators |
| Contributed-capability precedent | `promptActionToolRegistry`: an **ungated** registration owned by `prompt_actions`; `catalog`, `inventory`, `orders` push tool descriptors (with `execute` callbacks over their own services) from a contribution-only boot hook; manifest `nonBindingDependencies` kind `contributes-to`; the host filters by `effectiveState` and permission **at enumeration**. A contribution into an uninstalled host is dropped by the platform. | `packages/contracts/src/prompt-actions.ts:330-398`, `packages/modules/orders/src/backend/index.ts:1073`, `packages/platform/src/kernel/contribution-sinks.ts`, `specs/conventions/module-composition.md` items 4a–4b |
| Allow-listed field selection in a Setting | `crm.board_card_fields`: a `json` Setting written through `settingsAdminService.setValueForAllChannels` (audited, cache dropped as part of the write), validated against the offered set at write and **resolved at read** (unknown refs drop out). | `packages/modules/crm/src/backend/services/board-card-field-service.ts`, `packages/modules/crm/src/manifest.ts:76` |
| Setting write validation seam | `settingWriteValidatorRegistry` (owner `settings`): the module that declared a setting registers a validator for its exact codes; skipped while the contributor is absent. | `packages/modules/settings/src/backend/services/setting-write-validators.ts`, `packages/modules/seo/src/backend/index.ts:180-195` |
| Settings value types | `string`, `number`, `boolean`, `json`, `string_list`, `secret`, `credential_ref`; `enumOptions` only for `string`; `hidden: true` keeps a setting off the generic screen while it stays writable through its owner's surface. | `packages/contracts/src/settings.ts:16-140` |
| Trigram indexes | `pg_trgm` is created `if not exists` by `product_feeds` only; nothing else uses it. `unaccent` is not enabled anywhere. | `packages/modules/product_feeds/src/migrations/20260802T110630_product_feeds_taxonomies.ts:33`, `packages/modules/admin_users/src/backend/services/admin-user-service.ts:235` |

## R-1 — Which module hosts global search

**Decision**: a **new module `admin_search`** (`packages/modules/admin_search/`, package
`@endora-commerce/mod-admin-search`). It owns the provider registry, the federated query endpoint,
the search configuration (Settings), the configuration and results screens, one permission code,
two palette actions, and its activation switch. It owns **no table**.

**Rationale** — by domain ownership, not size: "find a record of any type from the admin, and
decide which fields that uses" is a capability no existing module owns. It has its own operator
switch (an operator may want ⌘K actions but not record search — e.g. not to expose customer e-mails
in a fast lookup surface), its own permission (who configures it), and its own failure mode (a slow
provider). Detaching it leaves every provider module working: their contributions are dropped by the
platform (`contribution-sinks.ts`).

**Alternatives rejected**:

- *Extend `search`.* Its domain is storefront product discovery on Meilisearch; `search.enabled`'s
  description promises storefront behaviour, and a shop that turns storefront search off (PostgreSQL
  fallback) would silently lose admin lookup. Its dependency set (`price_lists`, `credentials`, …) is
  irrelevant to the admin.
- *Extend `admin_actions`.* Closest neighbour (it is "the read API behind ⌘K"), but its data is
  static, manifest-declared and reconciled at install; record search is live, per-request, scoped,
  configurable and may time out. One switch would govern two capabilities with different privacy
  profiles. Its name, docs and permission story would all have to change.
- *Put it in the platform kernel.* A business capability with UI and settings is a module (D-52: the
  platform may not name a module, and every provider is one).

## R-2 — How owning modules contribute searchable record types (Principle I)

**Decision**: a **contribution registry** `adminSearchProviderRegistry`, owned by `admin_search`,
registered with plain `ctx.di.register` (ungated), typed by `AdminSearchProviderRegistryPort` in
`packages/contracts/src/admin-search.ts`. Each owning module builds an `AdminSearchProvider` over its
**own** services and pushes it from a **contribution-only** `ctx.onBoot` hook, declaring
`nonBindingDependencies: [{ moduleId: 'admin_search', name: 'adminSearchProviderRegistry', kind:
'contributes-to', reason }]`. The provider is data (entity type, label key, icon, required
permission, offered fields, weight) plus one function, `search(query)`.

Seven providers in six modules: `organizations` (Organization), `customers` (Customer), `orders`
(Order), `quote_requests` (Quote Request), `crm` (Sales Opportunity), `catalog` (Product,
Category). `customers` — not `customer_accounts` — owns the Customer provider because it owns the
admin Customers surface, its permission and its scope decision
(`customer-admin-query-service.ts`); it reaches the table through the existing
`customerAccountAdminSearchPort`.

**Rationale**: exactly the `promptActionToolRegistry` idiom (`prompt-actions.ts:384-398`), which
already carries callables built over a contributor's own services. The host never names a provider
module, never reads a provider's table, and never imports a provider's class. `contributes-to`
withholds a `dependencies` claim, so `admin_search` stays switchable even though `orders`,
`catalog` and `organizations` are `nonDeactivatable` (the reason `catalog`'s
`promptActionToolRegistry` edge gives). Presence is answered at enumeration, so runtime
(de)activation of a provider takes effect without restart (module-activation.md item 3, boot-hook
split rule).

**Alternatives rejected**:

- *A gated port per provider module* (`orderAdminSearchPort`, …) *resolved by the host*: the host
  would have to name seven ports and seven modules in its manifest `dependencies`, making `crm`,
  `quote_requests` and `customers` impossible to switch off while global search is installed, and
  every new record type a change to the host.
- *The host queries other modules' tables* (raw SQL or entity imports): forbidden by Principle I
  and `check:module-boundary`; it would also duplicate each module's scope rules.
- *An `EventBus`-fed index* (each module emits create/update/delete events; the host maintains its
  own copy): seven event families to add and backfill, a second copy of personal data, eventual
  consistency, and the scope/permission problem of R-3 on top.
- *A manifest-declared provider* (data only, no callable): the host would still need a way to run
  the query, i.e. one of the two rejected options above.

## R-3 — Query engine: live PostgreSQL through the owners, not Meilisearch

**Decision**: each provider answers with a **live, bounded PostgreSQL query** through its module's
request-scoped `EntityManager` (or an existing service/port of its own module), under the ambient
tenant context. No index, no backfill, no new infrastructure.

**Rationale**: correctness properties come for free — tenant filters on `@OrgScoped` entities,
the owner's own visibility rules, read-your-writes (the spec's "findable as soon as saved"). The
admin's question is a lookup with a small `limit`, not ranked discovery; the bulk of queries hit
identifiers. Reuses existing per-module search code paths (R-8).

**Alternatives rejected**:

- *Meilisearch admin indexes* (one per record type). Rejected for this release: (1) tenant and
  sales-rep scope would have to be encoded into documents and filters — a second implementation of
  Principle XI that can drift from the database's; (2) seven indexing pipelines plus reindex jobs,
  consistency lag, and PII copied into another store; (3) it couples admin lookup to the `search`
  module's availability. Kept as the escalation path if R-10's measurement fails at the reference
  volume.
- *PostgreSQL full-text search (`tsvector`)*: poor for identifiers and fragments (`ZAM/2026/00`,
  `526025`), which are most of what admins type; needs generated columns per owner.

## R-4 — Visibility: presence, permission, scope

**Decision**, three filters, all on the server:

1. **Presence** — the registry enumerates only providers whose `moduleId` is effectively present
   (`effectiveState.isPresent`), at request time.
2. **Permission** — the host checks each provider's `requiredPermission` (a `PermissionRequirement`,
   so any-of is expressible: Organization uses `['customers:read', 'customers:manage']`, mirroring
   `GET /api/v1/admin/organizations`) against the caller's permission list
   (`permissionService.listPermissions`, one call per request). Each provider's code is the one its
   own admin list route enforces: Order `orders:read`, Quote Request `rfqs:handle`, Sales Opportunity
   `crm:read`, Customer `customers:read`, Product and Category `catalog:read`.
3. **Scope** — enforced **inside the provider**, by the owner, with the same rule as its admin list
   (FR-015). `@OrgScoped` reads are filtered by the ambient tenant context; `orders` additionally
   reuses `ordersAdminScopeResolver`; `customers` passes the moderation actor's
   `allowedOrganizationIds` as its list does; `organizations` (a `@GlobalEntity`) applies **exactly
   its list's rule** (`deleted_at is null`, `is_personal = false`, gate `customers:read` /
   `customers:manage`) and does **not** constrain by scope — the owner's answer to spec Q2 — but
   *ranks* by it: for an `allowed-set` context, `orgConstraintFor()` gives the assigned ids and the
   provider orders `id in (assigned)` first (FR-015a), then the usual R-9 ranking, then `id` as the
   stable tie-break.

**Rationale**: the host can only judge what it can see (presence, permission); scope is
domain-specific and already implemented by each owner — re-implementing it in the host is how two
answers drift (D-100). Hiding (not disabling) denied types matches the palette's documented rule
(`AppShell.tsx` comment on `PALETTE_ITEMS`).

**Q2, resolved by the owner (2026-10-16) — "as the list does, assigned first".** The architect's
default (scope-limited organizations) was overruled. The Organization provider therefore carries no
`orgScopeWhere` clause; it carries an `ORDER BY` key instead (`case when id = any(:assigned) then 0
else 1 end`), present only when the context is `allowed-set`. `orgScopeWhere` is in any case not on
the published `@endora-commerce/platform/tenancy` barrel; `orgConstraintFor` is, and it is what the
provider reads. Tests: the organizations integration test asserts the visible set equals
`GET /api/v1/admin/organizations?q=` for the same admin, and the order assigned-first with a stable
order inside each group.

**Alternatives rejected**: *the host post-filters hits by organization id* — not every type carries
one (products, categories), and it would load rows the caller may not see; *a single
`admin_search:use` permission* — would grant a lookup into every type regardless of the role's
read permissions (privilege widening).

## R-5 — Where the search configuration lives

**Decision**: one **host-owned, hidden `json` Setting** `admin_search.entity_fields`, value
`{ "version": 1, "entities": { "<entityType>": { "enabled": boolean, "fields": string[] } } }`,
default `{ "version": 1, "entities": {} }` (empty = every provider's defaults). Written only through
`admin_search`'s own route, which calls `settingsAdminService.setValueForAllChannels(code, value,
expectedVersion, actor)`. Two visible `number` Settings: `admin_search.minimum_query_length`
(default 3) and `admin_search.results_per_entity` (default 5).

**Rationale**:

- Settings already provides what the spec needs: the audit row with before/after (FR-025), the
  optimistic `expectedVersion` (FR-026), the cache drop as part of the write (FR-023, "no restart" —
  `settings-admin.service.ts` header), refusal of writes while the owner is off (FR-031), and
  survival across off/on (FR-027). That is the CRM board-card precedent exactly.
- One host-owned value keeps providers pure read contributions: no provider module gains a setting,
  validator or migration for configuration.
- Entries for a record type whose module is off or uninstalled are **kept** in the value and simply
  not enumerated (FR-027); a save preserves entries it did not render.

**Alternatives rejected**:

- *One `string_list` Setting per provider module* (`orders.admin_search_fields`, …): seven settings in
  six modules, seven validators, and the host's screen writing other modules' settings by code — a
  cross-module write seam per record type. Settings also offers no multi-select enum for
  `string_list`, so the generic screen would be free text.
- *A new `admin_search_configurations` table*: re-implements audit, versioning, caching and the
  off-state refusal that Settings already does; adds a migration for one row.
- *Visible on the generic Settings screen*: a JSON textarea is the wrong editor for a checklist and
  could not show translated field labels; `hidden: true` (`settings.ts` `hidden`) keeps exactly one
  editing surface, as `pwa` does.

## R-6 — The field allow-list and its validation

**Decision**: the allow-list is the provider's `fields` array (`{ code, labelKey, defaultSelected,
identifier }`), declared by the owner in code. It is enforced three times:

1. **Write, route** — `PUT /api/v1/admin/global-search/configuration` refuses (422
   `VALIDATION_FAILED`, details per offending path) an unknown entity type among the *present*
   providers, a field not offered, duplicates, and an enabled type with zero fields.
2. **Write, any path** — `admin_search` registers a `SettingWriteValidator` for
   `admin_search.entity_fields` (shape check plus the same rules for present providers), so a write
   through the generic `PUT /settings` API cannot store a field outside an allow-list either; and
   for the two numbers, their ranges (2–10, 1–10).
3. **Read** — the resolver intersects stored fields with the provider's current offer; empty after
   intersection ⇒ the provider's defaults (spec edge case "field no longer offered").

Field codes are `camelCase`, unique per provider; `fields` must contain ≥ 1 entry with
`defaultSelected: true`; checked by the registry at `register` (a boot failure names the module).

**Rationale**: the owner is the only party that knows which columns are safe and indexable; the
admin picks among them (the request's "configure which fields", within the owner's limits). Triple
enforcement because the configuration crosses three trust boundaries (UI, API, stored value that
outlives code versions).

**Alternatives rejected**: *admin-entered column names* — arbitrary column access and SQL
injection surface; *allow-list in the host* — the host would have to know every module's schema.

## R-7 — Where the UI lives

**Decision**: (a) **the existing command palette** gets one group per record type after *Actions*,
plus a final "See all results for “…”" row; (b) a **results page** `/global-search?q=&type=` and a
**configuration page** `/global-search/configuration`, both contributed by `admin_search`'s admin
layer (`contributions.routes`), the latter with a nav entry in the `system` section and a palette
action; the former reachable from the palette row and an "Open global search" palette action.

**Rationale**: the sidebar search field already opens the palette, so the palette *is* the admin's
search box; a second header box would create two "search" affordances with different results
(Jakob's law, Law of Similarity — `.claude/skills/ux-laws/SKILL.md`). Records appear after
Navigate/Actions so that typing a screen name keeps today's top results stable; a record query
(`ZAM/2026/…`) matches no screen, so its records rise to the top anyway.

**Alternatives rejected**: *a header search box with its own dropdown* — duplicate affordance, a
second keyboard model; *records before Navigate/Actions* — reorders the palette for every existing
use (typing "orders" would put order records above the Orders screen); *only a results page* —
fails SC-001 (three interactions).

## R-8 — Shell ↔ module coupling for the palette group

**Decision**: the shell (`@endora-commerce/admin-shell`) gets a small, module-agnostic client in
`packages/admin-shell/src/lib/global-search/`: on palette open it calls
`GET /api/v1/admin/global-search/capability` once (like the assistant's capability probe, cached
for that open only); a non-2xx answer (503 `MODULE_DISABLED`, 404 when not installed) hides the
records group for that open. On typing it debounces 250 ms, aborts the previous request
(`AbortController`) and calls `GET /api/v1/admin/global-search?q=…`. Group labels, result titles,
statuses and field labels are **resolved server-side** in the request language (as
`admin_actions` does with `adminI18nService`), so the shell renders strings and needs no module
bundle; its own five strings (searching, unavailable, more, see-all, records-group fallback) go in
the `core` bundle (`packages/modules/_i18n/i18n/{en,pl}.json`, `appShell.palette.records.*`).
Icons come from `KnownIconNameSchema` and are resolved with the shell's existing `resolveIcon`.

**Rationale**: the shell's single Arrow/Enter loop indexes one `items` array; record rows must be
`PaletteItem`s in that array, which a zone component cannot provide. Probing the endpoint rather
than writing `isModulePresent('admin_search')` keeps the shell free of a module-id literal (the
`visibility-gate` population of `check:admin-zones`) and also covers "installed but switched off".

**Alternatives rejected**: *a new admin zone in the palette* — breaks keyboard unity, and zones are
React components, not data; *a function-valued admin contribution* (`paletteSources`) — the admin
contribution contract allows exactly one function-valued field (the lazy `component` factory,
`admin-contributions.ts` `AdminRouteDeclaration`) for FR-013 code-splitting reasons, and widening it
is a platform change bigger than this feature.

## R-9 — Matching and ranking semantics

**Decision**:

- Normalise the text: trim; refuse > 100 chars; escape `\`, `%`, `_` for `ILIKE … ESCAPE '\'`.
- Each selected field is `ILIKE '%text%'`, OR-combined; per provider `LIMIT limit + 1` (the extra row
  answers `hasMore` without a count query).
- **Identifier fields** (`identifier: true`: order/quote/opportunity number, SKU, tax ID, e-mail,
  slug) rank: exact (case-insensitive) → prefix → others; ties by `updated_at desc` (or `created_at`
  where there is none). Implemented in the provider's `ORDER BY` with a `CASE` expression.
- **UUID text**: when the text is a UUID, every provider adds `OR id = :text` regardless of fields
  (FR-010).
- **Organization name** uses the owner's existing folded `name_search` column with
  `normalizeOrganizationName(text)` (FR-011); every other field is matched as stored (spec Q3).
- Cross-reference fields ("Organization name" on Order/Quote/Opportunity; "Customer name or
  e-mail") resolve ids first through the owners' existing ports
  (`organizationDetails.searchIdsByName`, `customerAccountRead.searchIdsByName`), then filter by
  `organization_id in (…)` / `placed_by_customer_account_id in (…)` — exactly what
  `OrderListService` and `OpportunityService` already do. The Customer provider passes the selected
  fields to `customerAccountAdminSearchPort` through two **additive** criteria,
  `qFields?: ('email' | 'name')[]` and `excludeDeleted?: boolean`
  (`packages/contracts/src/customer-accounts.ts` `CustomerAccountAdminSearchCriteria`).
- Product/Category names are per-language JSONB: match `name::text` (any language, as the product
  list already does); display `name[language] ?? name[defaultLanguage] ?? first`.

**Rationale**: matches the existing lists' semantics, so a record found in the list is found here
and vice versa; identifier-first ranking satisfies "exact order number first" (spec US1-6).

**Alternatives rejected**: *`unaccent` everywhere* — needs a new extension on every deployment's
database and a per-owner migration (spec Q3 default); *similarity ranking (`pg_trgm` `%`)* — fuzzy
matches on identifiers are wrong answers for an admin.

## R-10 — Performance budget and limits

**Decision**:

- Client: minimum length (setting, default 3), 250 ms debounce, abort superseded requests.
- Server: providers run **in parallel**; each gets a **1 500 ms deadline** (constant
  `PROVIDER_DEADLINE_MS`); a late provider is reported `status: 'timed_out'` and its result
  discarded. The palette asks `limit = results_per_entity` (default 5, max 10); the results page
  asks `limit = 20` (max 25). `entityTypes` narrows the fan-out.
- **No new indexes in this release.** Identifier columns already carry unique/btree indexes
  (`orders.business_id`, `quote_requests.business_id` `@Unique`, `products.sku` unique,
  `crm_opportunities.number`); contains-matching on them is a sequential scan bounded by `LIMIT`.
  The reference-volume check of SC-002 is a **perf bench** (`backend/test/perf/admin_search/fan-out.bench.ts`, run by `pnpm --filter backend run test:perf`) seeding
  the spec's volumes and asserting p95 < 800 ms per full fan-out.
- If the perf test fails, the follow-up — not this feature — is a per-owner migration
  `create extension if not exists pg_trgm` + `gin (… gin_trgm_ops)` on the offending columns, the
  `product_feeds` precedent.

**Rationale**: YAGNI (Constitution IV) — add indexes where measurement says so, owned by the module
whose table it is. The deadline isolates the slow type rather than slowing the palette (FR-008).

**Alternatives rejected**: *trigram indexes on ~15 columns up front* — six migrations into six
modules, an extension on every deployment, write amplification on hot tables (`orders`), all before
any measurement; *a server-side result cache* — per-admin scope and permissions make the hit rate
near zero and invalidation a cross-module problem.

## R-11 — Failure isolation, and `check:port-catches`

**Decision**: the host wraps each provider call in `try { … } catch (error) {
rethrowIfModuleDisabled(error); log; return { status: 'failed' } }`, with a comment that the
tolerance is right because one record type's failure must not blank the others (FR-008). Providers
resolve only ports of **non-deactivatable** owners (`organizationDetailsPort`,
`customerAccountReadPort`, `customerAccountAdminSearchPort` — `organizations` and
`customer_accounts` both declare `nonDeactivatable`), so a `ModuleDisabledError` cannot originate
inside a provider in practice; if one ever does, it propagates as the convention requires.

**Rationale**: module-composition.md item 7 — a narrow tolerance keeps the catch and re-throws
`ModuleDisabledError` first.

## R-12 — No caching, no phrase recording

**Decision**: no Redis cache of results or configuration beyond what the kernel's settings cache
already does; no record of search phrases (FR-017). The provider registry is in-memory, built at
boot; it changes only on restart (new code), so it needs no invalidation. Presence and permissions
are read per request from their existing caches (`effectiveState` is kept fresh by the
`b2b:module:state-changed` pub/sub; the settings cache is dropped as part of every write).

**Rationale**: the lifecycle pub/sub invalidation the cross-cutting checklist asks about is already
in place for both inputs that can change at runtime; adding a cache would add an invalidation
problem without a measured need. Phrase analytics (`search_phrase_records`) is a storefront concern;
admin texts are often personal data (e-mails, names, tax IDs).

## R-13 — Auditing (Principle XIII)

**Decision**: configuration writes go through `settingsAdminService.setValueForAllChannels`, which
records the audit row with the replaced value as `stateBefore`; the two numeric Settings are written
by the generic Settings screen through the same service. Search requests are reads and are not
audited. `admin_search` joins `MIGRATED_MODULES` in `backend/scripts/check-command-coverage.ts` so
`--strict` covers it.

**Alternatives rejected**: *a dedicated `UpdateAdminSearchConfigurationCommand`* — would audit the same
write twice (the Settings write already records it); the CRM board-card precedent does not add one.

## R-14 — Error codes

**Decision**: **none minted.** Invalid input is the platform's `VALIDATION_FAILED` (Zod / details per
path, as `BoardCardFieldService.set` does); a stale version is Settings' existing 409; a switched-off
module is the platform's `MODULE_DISABLED`. Search text below the minimum length is **not an error**:
the endpoint answers 200 with `meta.belowMinimumLength: true` and no groups.

**Rationale**: the `search` module's `QUERY_TOO_SHORT` belongs to `search` (error codes are
module-owned, feature 090); a short text is a normal state while typing, not a refusal.

## R-15 — Where a Category result opens

**Decision**: `/catalog/categories?focus=<id>`; `catalog`'s `CategoriesTree` learns to read `focus`,
expand the path to that category, scroll it into view and highlight it.

**Rationale**: categories have no detail route (the tree is the editor;
`packages/modules/catalog/src/admin/index.ts:117`), and `/catalog/categories/:id/content` is the
storefront-content editor, not the category. A query parameter needs no new route.

## R-16 — Module id and the naming check

**Decision (resolved — owner, 2026-10-16)**: id `admin_search`, mirroring `admin_actions`.
`scripts/check-naming.sh` refuses it ("looks singular": it ends in `h`, not `-ches`), so
`admin_search` is added to `allowed_singular` beside `search` — the same grammatical class the
script's comment already exempts ("singular-mass nouns and single named surfaces"). The owner
confirmed the exemption; the fallback `admin_searches` is not used.

## R-16a — Owner answers to the spec's open questions (2026-10-16)

- **Q1** (platform-wide configuration, one setting): default kept — R-5 unchanged.
- **Q2** (organization visibility for a scoped admin): **changed** — see R-4 point 3 and its
  *Q2, resolved* paragraph. Organizations follow the Organizations list's visibility; assigned
  organizations rank first.
- **Q3** (diacritics only on organization names): default kept — R-9 unchanged.
- **Quote Requests scope** (architect's note): `RfqAdminService.listAll` loads every row and filters
  scope in memory. The provider does **not** copy that shape; its scope is in the statement (T032).

## R-17 — Activation

**Decision**: `activation: { settingCode: 'admin_search.enabled', default: true }`, deactivatable.
`dependencies: ['_i18n', 'auth', 'admin_roles', 'settings']` — the ports it resolves
(`requireAdmin`, `permissionService`, `adminI18nService`, `settingsAdminService`,
`settingWriteValidatorRegistry`); all non-deactivatable, so `admin_search` holds no other module's
switch.

**Rationale**: losing record search degrades navigation, it does not remove a capability the
platform needs (the `admin_actions` argument, `admin_actions/src/manifest.ts`).

## R-18 — Records excluded from results

**Decision**: soft-deleted rows; anonymized customer accounts (`anonymizedAt` set); personal (B2C)
organizations (`isPersonal`), whose people are found as Customers; nothing else — inactive/draft
products, blocked customers/organizations, cancelled/expired orders and quotes are returned with a
status badge.

**Rationale**: an admin searching for a record usually needs it *because* it is in an exceptional
state; the Organizations list hides personal organizations by default (`routes.admin.ts:211`).

## R-19 — Sales-channel scoping (Principle XII)

**Decision**: not channel-scoped. Admin list screens for these types are cross-channel; Principle
XII governs channel-scoped *content reads* (storefront, channel-resolved requests). Results show the
channel where it disambiguates (orders, quote requests), from data the owner already returns.

## R-20 — Permission for configuration

**Decision**: a new code **`admin_search:configure`** ("Configure global search"), declared in
`admin_search`'s manifest, label in its bundle (en + pl), enforced on `GET` and `PUT
/api/v1/admin/global-search/configuration` and on the configuration route/nav/palette action. The
search endpoint and results page require only a signed-in admin (`requireAdmin()`), because per-type
permissions are checked per provider (R-4).

**Alternatives rejected**: *reuse `settings:write`* — would make every settings editor able to
reshape what every admin's search reveals, and is owned by another module; the permission inventory
derives owners from the gates, and borrowing codes is the pattern feature 091 drained.

## R-21 — Contract placement

**Decision**: `packages/contracts/src/admin-search.ts` holds the Zod schemas (query, response,
configuration, stored value) and the provider/registry TypeScript interfaces (the registry's
`Container name:` marker added in the same change that registers it — the `check:port-shape` lesson
in `specs/143-crm-sales-opportunities/research.md` N-5). The only change to another module's
published contract is additive: two optional fields on `CustomerAccountAdminSearchCriteria`
(R-9). Field selection for orders, quote requests, opportunities, products and categories is
internal to each owner's own services.
