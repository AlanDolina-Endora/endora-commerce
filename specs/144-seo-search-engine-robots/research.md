# Research: search engine robots (`specs/144-seo-search-engine-robots/`)

**Date**: 2026-10-11 · **Tree**: `origin/master` at `ca1e265a1` plus this branch's two spec commits.

Every decision is written as decision → rationale → alternatives rejected. Each fact is marked
**[read]** (I opened the file and the line is cited), **[measured]** (a command, given), or
**[inferred]** (not verified here; the slice that depends on it starts with a test that proves or
refutes it). Nothing in this document was run against a built tree: the worktree has no
`node_modules`, so no Next.js behaviour below is measured.

---

## R1 — Where the three settings and the preview live

**Decision**: on the generic Settings screen, as A8 says. The preview is contributed by `seo`
through the **admin zone** mechanism that already exists, with one new zone member mounted by the
Settings screen beside every setting row.

**Evidence**

- The zone seam is built and in use **[read]**: `packages/contracts/src/admin-contributions.ts`
  (`AdminZoneNameSchema`, `AdminZonePropsMap`), `packages/admin-kit/src/zones/AdminZone.tsx`,
  `packages/admin-kit/src/zones/use-admin-zone.ts`. Eight modules contribute to zones
  **[measured]**: `grep -rn "zones:" packages/modules/*/src/admin/index.ts`.
- It already does the three things this feature needs from it **[read]**
  (`use-admin-zone.ts` header): a contribution is filtered by its owner's **presence at
  enumeration**, so it vanishes when `seo` is off with no code in `settings`; it is filtered by
  `requiredPermission`; and a `match` on string props narrows it to one mount **before** the
  chunk is fetched. `crm` is the worked example — three `zoneComponent(...)` lines contributing
  panels to `organizations`, `orders` and `quote_requests`
  (`packages/modules/crm/src/admin/index.ts`).
- `check:admin-zones` refuses a contribution to an undeclared zone and a declared zone no host
  mounts **[read]** (`specs/conventions/check-inventory.md`, its row), so the new member cannot be
  half-added.
- The Settings row editor already special-cases settings by code and by naming convention
  **[read]**: `SettingRowEditor.tsx` branches on `SELLER_COMPANY_DATA_CODE`, `isAssetIdSetting`
  (`code.endsWith('_asset_id')`) and `isImageUrlSetting`. Those are `settings` knowing about
  other modules' settings — the shape this decision avoids repeating.

**The seam**: one new member, `settings.setting.after`, mounted once per setting row with props
`{ settingCode, ownerModule, channelContext, draftText, dirty }` (contract:
`contracts/admin-surfaces.md` §2). `seo` contributes two components with
`match: { settingCode: 'seo.robots_txt_custom' }` and `{ settingCode: 'seo.llms_txt_additional' }`.
`settings` learns nothing about `robots.txt`; it learns that a row has an "after" slot.

**Alternative rejected — move the configuration to `seo`'s own screen and mark the settings
`hidden`.** Compared honestly, because it is cheaper in platform changes:

| | Generic Settings screen + zone (chosen) | `seo`'s own screen + `hidden: true` |
| --- | --- | --- |
| Changes outside `seo` | one zone member and its mount; multi-line editing (R5); translated names (R6) | none |
| Code in `seo` | two zone components, one preview endpoint | a whole settings form: channel scope picker, three-tier "inherits / overrides" display, reset per scope, optimistic-concurrency conflict handling |
| Reuse (Principle IX) | the row editor's per-channel behaviour is reused as it is (`SettingRowEditor.tsx`, 430 lines **[measured]**: `wc -l`) | reimplemented, or `settings` has to export its editor as a kit component — a larger extraction than the zone |
| Permission | `settings:read` / `settings:write`, as for every setting | `seo`'s screen is gated by `catalog:write` today **[read]** (`packages/modules/seo/src/admin/index.ts`); either catalog editors can now de-index the shop, or the screen takes a second code |
| What the next module gets | multi-line settings and translated setting names, for all 45 modules that declare settings **[measured]**: `grep -l "valueType:" packages/modules/*/src/manifest.ts \| wc -l` | nothing |
| Precedent | — | `pwa` and `newsletter` use `hidden` (5 settings **[measured]**: `grep -n "hidden: true" packages/modules/*/src/manifest.ts`), each with its own screen and API |

The own-screen route is a real option and would ship the first slice no faster (the first slice
needs none of the three generic changes — see R12). It is rejected because it departs from A8,
which the owner accepted; because it duplicates the per-channel editing UX the Settings screen
already owns; and because the two gaps it sidesteps — single-line-only text settings and
English-only setting names — stay open for every other module. **No departure from A8 is
proposed.**

---

## R2 — How the Admin UI obtains the storefront-owned system rules (FR-041, FR-042)

**Decision**: the **backend asks the storefront**. A new admin endpoint in `seo` fetches the
channel's own storefront, server to server, for the system part only, and returns it with a state.
The Admin UI composes the preview from that system part and the text in the field, with one
shared pure function. Nothing stores the rules.

**Evidence**

- The backend already knows each channel's storefront address, in three rungs **[read]**:
  `SitemapGeneratorService.resolveStorefrontUrlSource` in
  `packages/modules/seo/src/backend/services/sitemap-generator.service.ts` — the per-channel
  setting `sales_channels.storefront_url`, then `STOREFRONT_BASE_URL`, then a fallback, and it
  reports which rung answered (`'setting' | 'env' | 'fallback'`).
- The backend already calls the storefront over HTTP **[read]**:
  `packages/platform/src/http/storefront-revalidator.ts`, used by seven modules. A backend →
  storefront request is an established direction, including across hosts.
- The Admin UI does **not** know the storefront's address and is a different origin from it;
  a browser fetch would need CORS on the storefront, which sends none **[measured]**:
  `grep -n -i "Access-Control\|cors" storefront/next.config.js storefront/middleware.ts` is empty.

**Shape** (contract: `contracts/crawler-policy.md` §4 and `contracts/admin-surfaces.md` §3)

- The storefront answers `GET /robots.txt?part=system` with the system-generated rules alone,
  and stamps every answer of the new handler with `X-Endora-Crawler-Files: 1`. Crawlers do not
  send a query string to `robots.txt`; the plain address is unchanged.
- The backend maps what it got to one of five states: `ok`, `address-unknown` (the address came
  from the fallback rung — no fetch is made), `storefront-unreachable` (timeout, refusal, a
  non-2xx), `storefront-outdated` (a 2xx **without** the capability header), `not-served`
  (`llms.txt` only: a 404 with the header present).
- **Version skew is the reason for the capability header.** A storefront older than this feature
  ignores `?part=system` and returns its whole file — which *is* its system rules, since it
  appends nothing. Without the header the preview would then show the operator's text appended to
  a file whose storefront will never append it, and SC-010 would be false exactly where an
  instance has upgraded its backend and not its storefront. With it, the preview says "this
  storefront does not serve custom instructions yet", shows the rules it does serve, and saving
  stays possible.
- The request carries `x-sales-channel`, which a storefront that is reached directly honours and
  a proxy overwrites with its own answer **[read]** (`storefront/lib/server-context.ts`: the
  header is "stamped per-host" by the proxy). When the address came from the `env` rung — one
  address for every channel — the response says so, because the preview is then of that shared
  storefront rather than provably of the selected channel.
- Bounded: `GET` only, two fixed paths, 3 s timeout, 512 KiB cap, response treated as text. The
  address is an operator-written setting, so the endpoint is a constrained request to an
  operator-chosen host; `settings:write` is what it takes to change that host, `settings:read`
  what it takes to trigger the fetch. That is the same trust the sitemap's base URL already has.

**Alternatives rejected**

- *A field pre-filled with the rules* — rejected by the spec's A9, on grounds that survive this
  reading: there is one statement of the rules (`storefront/app/robots.ts`) and it mirrors the
  route families.
- *The Admin UI fetches the storefront from the browser* — needs the storefront's address in the
  admin, CORS on a public file, and fails on mixed content when the admin is HTTPS and a
  development storefront is not.
- *The backend holds its own copy of the list* (for example in `@endora-commerce/contracts`) —
  two statements of one fact (FR-041), and wrong whenever storefront and backend versions differ.
- *The storefront reports its rules to the backend at boot* — a stored copy with a refresh
  problem, and a write path from an anonymous client.
- *A marker line inside the served file to split on* — changes the default file's bytes
  (FR-019, SC-005) to carry information only the preview needs.

---

## R3 — How the storefront reads the per-channel configuration

**Decision**: two public, channel-resolved endpoints owned by `seo`, defined in
`packages/contracts/src/seo.ts` first; read by the storefront through **one in-process cache with
a 60-second freshness window and an unbounded last-known value**, in both the middleware and the
two file handlers. No cache tag, no revalidation push.

**Endpoints** (contract: `contracts/crawler-policy.md` §1–§2)

- `GET /api/v1/storefront/seo/robots-policy` → `{ data: { index, follow } }`. A few bytes; read
  on the request path.
- `GET /api/v1/storefront/seo/crawler-files` → `{ data: { robotsTxtCustom, llmsTxtAdditional,
  index, follow, shop: { name } } }`. Up to ~130 KiB; read only when a crawler file is served.

Two rather than one, because the first is consulted for every document and the second carries
operator text the document path never needs.

**Evidence and reasoning**

- Channel resolution is the platform's **[read]**: `getResolvedChannel(request)` in
  `packages/modules/settings/src/backend/routes.storefront.ts` is the pattern (header, else the
  system default). Principle XII's fail-closed rule is met by resolving always.
- The off state needs no code **[read]**: `seo` registers through `ctx.routes`
  (`packages/modules/seo/src/backend/index.ts`), so both routes answer `503 MODULE_DISABLED` when
  the module is not effectively present, and the storefront already has the predicate for it —
  `isModuleDisabled` in `storefront/lib/api/module-absence.ts`.
- **A definitive "no policy" is not a failure.** `MODULE_DISABLED`, and a `404` from a backend
  that has no such route (FR-031: never installed, or older than this feature), are *answers*:
  the storefront caches "none" and applies nothing. Only a transport failure, a timeout or any
  other status is "could not be read" and falls to the last-known value. Conflating the two is
  the trap `getGoogleAnalyticsConfig` is free to fall into (it treats every
  `StorefrontApiError` as disabled, `storefront/lib/api/analytics-config.ts` **[read]**) and this
  feature is not.
- **Why not Next's data cache and tags**, which every other storefront read uses
  (`{ revalidate: 300, tags: [...] }`):
  1. the middleware cannot use it, and the middleware is where the header has to be set (R4);
  2. FR-017 and FR-022 need a guaranteed *stale-on-error* answer, and whether a tag-invalidated
     entry is still served when its refetch fails is **[inferred]** to be "no" — not something to
     build a requirement on;
  3. the push half depends on `STOREFRONT_BASE_URL` **and** `REVALIDATE_SECRET` being configured,
     and `StorefrontRevalidator.enabled` is silently false otherwise **[read]**
     (`storefront-revalidator.ts`), which would leave the bound at the 300 s backstop — exactly
     five minutes, with nothing to spare.
- **Precedent for module-level state in the middleware** **[read]**:
  `storefront/lib/api/backend-reachability.ts` keeps `let cached` and `let inFlight` at module
  scope with a 5 s / 1 s window, and `middleware.ts` awaits it on every document request.
- **The bound**: 60 s in the process, plus `Cache-Control: public, max-age=60` on the two files,
  is two minutes worst case — inside FR-010's five. A12 allowed tightening and forbade loosening.
- **Cost**: at most one request per endpoint, per channel, per storefront process, per minute,
  and only while there is traffic.

**Last-known value** (FR-017, FR-022): the cache keeps the last successfully read value per
channel for the life of the process. Fresh → serve it. Stale → refetch; on success replace; on
failure serve the stale value and retry on the next request after a short back-off. No value at
all and a failure → documents get "no policy" (FR-017); `robots.txt` and `llms.txt` answer `503`
with `Retry-After` and `Cache-Control: no-store` (FR-022). The middleware and the Node route
handlers are separate module instances **[inferred]** and each keeps its own copy; that is
harmless, since each is bounded by the same 60 s.

**Alternatives rejected**: the data cache (above); reading through the existing settings
`shop-info`-style resolver in `settings` (puts `seo`'s vocabulary in `settings` and survives `seo`
being off); a single endpoint (operator text on the document path); a Redis-shared last-known
value (a new storefront dependency on Redis, for a 60-second problem).

---

## R4 — How the directive reaches every response, and how FR-012 is built

**Decision**: **one seam, the middleware.** It resolves the channel's policy once per request,
sets `X-Robots-Tag` on the response when the policy restricts anything, and hands the policy to
the render as a request header. The root layout renders one additional `<meta name="robots">`
from that header. **No route file changes.**

**Evidence**

- The middleware already is the storefront's response-header and request-header seam **[read]**
  (`storefront/middleware.ts`): it sets `x-pathname` on the request for the root layout and
  rewrites with a `503` when the backend is down; `storefront/app/layout.tsx` reads those headers
  through `headers()` and is `dynamic = 'force-dynamic'` (line 90), so no page loses a rendering
  mode by reading one more.
- `next.config.js`' `headers()` block is evaluated at build time **[read]** and cannot vary by
  channel or by a setting.
- The matcher excludes `robots.txt`, `sitemap.xml`, `manifest.webmanifest`, `_next/image` and
  every path ending in a static extension **[read]** — exactly the non-document responses FR-014
  names. So the matcher is widened to everything except `_next/static` (the build-generated
  script and style files FR-014 exempts), and the function branches first: a non-document path
  gets the header and nothing else — no reachability probe, no `x-pathname`, no rewrite.
- **Next metadata replaces, it does not merge** **[inferred]** — a page's `robots` wins over a
  layout's. That is why the default is *not* put into the layout's `metadata`: it would be
  silently dropped on the 53 route files that declare `index: false` **[measured]**
  (`grep -rl "index: false" storefront/app | wc -l`) and the `follow` half of an
  `INDEX, NOFOLLOW` default would never reach them.
- The layout instead renders its own `<meta name="robots" content="…">` element, outside the
  metadata API, so no page can replace it. React 19 hoists a `<meta>` rendered in a server
  component into `<head>` **[inferred]**.

**How the combination is built.** FR-012 asks for the restrictive combination of the route
declaration and the channel default. The response carries up to three directive sources — the
page's own `<meta name="robots">` (from its route declaration, unchanged), the layout's `<meta
name="robots">` (the channel default, when it restricts), and `X-Robots-Tag` (the same default).
Search engines combine multiple robots directives for one URL restrictively — `noindex` anywhere
means not indexed, `nofollow` anywhere means not followed — so the union *is* the combination,
and the storefront never computes a merge that could be wrong. The property "the default never
loosens" (FR-013) then holds structurally: the feature only ever **adds** a tag and a header and
never touches the page's own.

**This is a reinterpretation of FR-012's wording** — "every document MUST carry *a* robots
directive that is the combination" is delivered as *directives whose union is the combination*,
not as one merged tag. It is recorded in `plan.md` § *Deviations from the spec*.

**`check:storefront-indexability` keeps its meaning** because nothing it reads changes: it reads
each `page.tsx`' own `metadata` / `generateMetadata` **[read]** (its header), and not one of them
is edited. Two guards keep it that way: a storefront unit test asserts the root layout declares
no `robots` through the metadata API (which would be a silent second author), and the policy →
tag function is pure and unit-tested to emit nothing for `INDEX, FOLLOW`.

**The request header is trusted only because the middleware always writes it.** It sets
`x-robots-default` to the resolved value or deletes it, on every request it sees, so a client
cannot supply one.

**Alternatives rejected**

- *Edit every route's metadata to merge the default* — 53 files today and every route added
  later, each a place to forget; and it would change what the indexability check reads.
- *A shared `generateMetadata` helper the routes call* — same population, same check impact.
- *Header only, no tag* — meets the letter of indexing control but not User Story 1 scenario 2
  ("both in the document and in the response's headers"), and a saved copy of the page would
  carry nothing.
- *Set the header in each route handler* — `sitemap.ts` is a `MetadataRoute` and cannot set one;
  files under `storefront/public/` have no handler at all.

---

## R5 — Multi-line text settings, for every module

**Decision**: a `multiline` flag on the setting declaration, valid only for `valueType: 'string'`
without `enumOptions`, carried to the Settings screen like `enumOptions` and `hidden` are — a
manifest field, a column, the reconciler, the DTO — and rendered as a `<textarea>` that preserves
line breaks.

**Evidence**

- `renderInput` in `SettingRowEditor.tsx` gives a `<textarea>` to `json` and `string_list` only;
  a `string` gets `<input type="text">` **[read]**, which discards line breaks on paste.
- Manifest-driven presentation facts are persisted on the `settings` row and synchronised on
  every boot **[read]**: `enum_options`, `configuration_type` and `hidden` in
  `packages/platform/src/kernel/settings/setting.entity.ts`, kept in step by
  `manifest-reconciler.ts` (lines 322–339, 373–375). `multiline` follows that pattern exactly.
- The `settings` table is the platform's, so the migration is `--module core`
  (`specs/conventions/module-migrations.md` **[read]**: "`--module core` is the platform's own
  `migrations/` directory").

**Cost**: one optional field and one refinement in `SettingManifestEntrySchema`; one field in
`SettingDtoSchema`; one `boolean not null default false` column; two lines in the reconciler; one
line in `serializeSetting`; one branch in `renderInput`. Additive: no existing manifest changes.

**Alternatives rejected**

- *A new value type `text`* — `value_type` is a native PostgreSQL enum **[read]**
  (`setting_value_type`, altered by two earlier platform migrations), so it costs a migration as
  well, plus a new case in every `switch` over the value type and in `valueSchemaForType`.
- *Derive the flag from the registered manifests at serialise time, no column* — no migration,
  but a second source for one DTO next to a row that already carries the same kind of fact three
  times; the next reader would have to learn which presentation facts live where.
- *Give `seo` an editor zone that replaces the input* — makes multi-line text a `seo` special
  case, which is what this point was asked not to be.
- *Render a textarea whenever the value contains a line break* — a field that changes shape as
  you type.

---

## R6 — Translated setting names and descriptions, for every module

**Decision**: the Settings screen resolves a setting's name and description from its **owner
module's own bundle** by convention, and falls back to the declared (English) string when the key
is absent. Keys: `settingLabels.<code>.name`, `settingLabels.<code>.description`,
`settingGroups.<code>.name`. No backend change.

**Evidence**

- The screen renders `setting.name`, `setting.description` and `group.name` verbatim **[read]**
  (`SettingRowEditor.tsx` lines 111 and 175; `SettingsPage.tsx` line 475), and the server sends
  the manifest strings (`serializeSetting` in `routes.admin.ts`).
- The identical problem is already solved for permission labels **[read]**:
  `packages/modules/admin_users/src/admin/permission-label.ts` resolves
  `adminRoles.permission.<code>` over the merged bundle and returns the manifest `label` as the
  last resort when the resolver reports `outcome: 'placeholder'`. The same shape, with the scope
  known up front — the DTO carries `ownerModule`.
- The i18n convention's policy is English by default, Polish shipped, Polish falling back to
  English **[read]** (`specs/conventions/module-i18n.md`); a fallback to the declared English
  string is that policy, not an exception to it.

**Cost**: one small resolver beside the row editor, three call sites, its unit tests, and the
keys this feature's four settings need. **It translates nothing by itself**: 198 settings in 45
modules **[measured]** (`grep -c "valueType:" packages/modules/*/src/manifest.ts`, summed) keep
their English names until their owners add keys. A ratchet that would make that drain visible is
deliberately **not** in this feature — it is a second instrument with its own ledger, and FR-008
asks only for this feature's settings.

*That the bundle scope equals the module id is* **[inferred]** *from `permission-label.ts`
scanning scopes and from the `i18n/` convention; the slice's first test pins it.*

**The dropdown's choices need no translation.** The four stored values are the directive pairs
themselves — `INDEX, FOLLOW`, `NOINDEX, FOLLOW`, `INDEX, NOFOLLOW`, `NOINDEX, NOFOLLOW` — which
`enumOptions` accepts (`z.string().min(1)`), which is what Magento shows, and which reads the same
in every language. FR-008's "label of each choice … in English and in Polish" is met by the
choices being language-neutral tokens; what they *mean* is in the translated description. The
storefront never sees these strings: the public endpoint answers `{ index, follow }`.

**Alternatives rejected**

- *The backend translates in `serializeSetting`* — the i18n convention's "the backend can resolve
  the reader's language, so it translates" case. Rejected here because the admin already holds
  every module's bundle and resolves nav labels, palette labels and permission labels from them
  client-side; a fourth manifest-declared label resolved server-side would be the odd one, and
  `settings` would need a translation dependency it does not have.
- *Translated names in the manifest* (`name: { en, pl }`) — a contract change for every module,
  and a second home for strings the bundles already exist to hold.
- *Translatable option labels* (`settingLabels.<code>.option.<value>`) — not needed by this
  feature (above) and not built speculatively.

---

## R7 — Command palette and permissions

**Decision**

- `seo` declares **two** palette actions: `open-seo` → `/seo`, `requiredPermission:
  'catalog:write'`; and `open-search-engine-robots` → `/settings`, `requiredPermission:
  'settings:read'`.
- `seo` declares **no permission code of its own**. The settings are written through the
  `settings` module's routes (`settings:write`); the new preview endpoint is gated by
  `settings:read`; the two public endpoints are ungated.

**Evidence**

- `seo` has an admin route and no action **[read]**:
  `backend/test/integration/_admin_surfaces/batch-eight-palette-off-state.test.ts` line 62
  asserts `{ module: 'seo', actions: [] }`. That is a standing Principle XVI gap, and FR-009
  cannot be met without touching the same declaration, so both are repaired together.
- `check:action-route-permissions` requires the declared code to be **sufficient for the gate on
  the action's own target route** **[read]** (`packages/cli/src/rules/action-route-permissions.ts`,
  "the property is sufficiency, not equality"). `/settings` is gated by `settings:read`
  **[read]** (`packages/modules/settings/src/admin/index.ts`), and the `settings` module's own
  `open-settings` action declares `settings:read` for the reason written beside it.
- The Settings screen has no per-group address **[measured]**: `grep -n
  "useSearchParams\|useParams\|location.hash" packages/modules/settings/src/admin/pages/SettingsPage.tsx`
  is empty; its routes are `/settings`, `/settings/groups`, `/settings/cache`. A palette
  `targetRoute` may not carry a query string (`module-admin-surfaces.md` item 5), so the action
  opens `/settings` and the operator opens the SEO group. A per-group route would be a `settings`
  feature serving every module; it is not built here.
- A module gating a route with a code another module owns is a derived fact, not a declaration
  **[read]** (`module-admin-surfaces.md`, D-173). `settings` is non-deactivatable **[read]**
  (`packages/modules/settings/src/manifest.ts` line 239), so the code is always grantable.

**This reinterprets FR-009** ("MUST NOT be offered to one who is not [allowed to change it]"):
the entry is offered to an administrator who may **see** the settings, since that is what the
target route enforces and FR-045 gives such an administrator the previews. Declaring
`settings:write` on a route that enforces `settings:read` is the disagreement the check exists to
refuse. Recorded in `plan.md` § *Deviations from the spec*.

---

## R8 — What "off" has to prove (Principle XVII, `specs/conventions/module-activation.md`)

Read against the six items of the convention:

1. **Routes** — all three new routes are registered inside the existing `ctx.routes` call, so
   the gate is the registration seam's. No per-handler check.
2. **Workers and subscribers** — none are added. (The in-process cache of R3 removed the need for
   a `settings.value_changed` subscriber.)
3. **Cross-module calls** — the preview service resolves `settingsReadPort` and
   `salesChannelMembershipPort` through `lazyPort`, as the sitemap service does. No new port is
   published. `check:port-dependencies` decides whether an edge is owed; none is expected,
   because both ports are already resolved by this module **[read]** (`backend/index.ts`).
4. **Manifest** — the activation declaration is unchanged. FR-033 changes two strings: the
   module `description` and the `seo.enabled` setting's `description`.
5. **Admin and Storefront** — the zone contributions and both palette actions disappear through
   the presence filter that already exists; the three settings become read-only through
   `editable: false`, which the settings API already computes per setting. The storefront's
   absence is the "definitive none" branch of R3.
6. **Tests** — `backend/test/integration/seo/off-state.test.ts` exists and is extended (below).
   `check:off-state-coverage` keys on the `expectModuleAbsent` call argument, which that file
   already carries.

**What the off-state proof gains** (FR-034), in the deactivated-while-available case and with
restoration: the two public endpoints and the preview endpoint answer `503 MODULE_DISABLED`; the
three settings report `editable: false` and a write is refused; both palette actions are absent;
and after reactivation the stored values are served unchanged. The storefront half cannot be an
integration test — the storefront's suite is SSR-only with no running backend — so it is three
unit tests over the pure decision (`MODULE_DISABLED` → none; `404` → none; transport failure with
no last-known value → none for documents, `503` for files) plus one conformance scenario.

**FR-033 cannot be met in Polish where the switch is.** The platform modules screen renders the
module's manifest `description` verbatim **[read]**
(`packages/admin-shell/src/modules/platform/ModulesPage.tsx` lines 278–281), and that string is
English. The plan puts the warning in the module description (English, shown at the switch) and
in the `seo.enabled` setting description (English and Polish through R6, shown on the Settings
screen). Translating module descriptions on a kernel-served screen is a platform change this
feature does not make. Recorded as a deviation and as a decision for the owner.

---

## R9 — `robots.txt` and `llms.txt` as route handlers

**Decision**: `storefront/app/robots.ts` is replaced by `storefront/app/robots.txt/route.ts`, and
`storefront/app/llms.txt/route.ts` is added. The system-generated rules move, unchanged in
content, to `storefront/lib/seo/robots-system-rules.ts`, which stays the single statement of them.

**Evidence**

- `MetadataRoute.Robots` is a structured object **[read]** (`storefront/app/robots.ts`); it
  cannot carry operator text verbatim (FR-018, A7), and it cannot answer `503` (FR-022).
- The file is prerendered at build time today **[read]** (`storefront/.env.example`,
  `deploy/compose.prod.yml`); a route handler with `dynamic = 'force-dynamic'` is the shape
  `storefront/app/manifest.webmanifest/route.ts` already uses for a per-channel generated file.
- A directory named `robots.txt` or `llms.txt` under `app/` is a first path segment produced by
  a `route.ts`, which `storefront/app/reserved-segments.ts` says it covers **[read]**; both names
  are added to `RESERVED_TOP_LEVEL_SEGMENTS`. That is FR-028 — and it is belt and braces, since a
  CMS slug cannot contain a dot (same file).
- One test imports the old module **[read]**: `storefront/test/seo/route-declarations.test.ts`
  (`import robots from '../../app/robots'`). It is rewritten against the rules module and the
  handler.

**Composition** — one pure function, `composeCrawlerFile(base, extra)`, exported from
`@endora-commerce/contracts` and imported by the storefront's handlers and by `seo`'s preview
component, so the served file and the preview cannot disagree about the join (SC-010). An empty
`extra` returns `base` byte for byte (FR-019).

**The `llms.txt` generated base** (FR-025) is built in the storefront from what it already
declares: the shop name from the `crawler-files` response, and `SITEMAP_STATIC_ROUTES` from
`storefront/app/sitemap.ts` — the hand-written list of public, indexable, static addresses
**[read]** — plus the sitemap's own address. Using that list means FR-025's "only public and
indexable addresses" is inherited from the list `check:storefront-indexability` already
reconciles, rather than restated.

**Size limit** (FR-006): 65 536 bytes of UTF-8 per field, enforced by a `SettingWriteValidator`
that `seo` registers for its two codes **[read]** (`packages/contracts/src/settings.ts`,
`SettingWriteValidatorRegistryPort`; `setting-write-validators.ts`). The system rules are under
1 KiB, so the whole file stays far below the 500 KiB search engines read.

**Alternative rejected**: keeping `robots.ts` and appending parsed operator rules to the
structured object — it would require parsing and re-serialising operator text, which A7 rules out.

---

## R10 — Documentation and release intent

**Documentation** (`specs/conventions/module-documentation.md` **[read]**)

- English: `packages/modules/seo/docs/seo.md`, the module's own page. It is also stale today — it
  documents `POST /api/v1/admin/seo/sitemap/regenerate` and `…/status` without the
  `:channelCode` segment the routes actually have **[read]** (`routes.ts`) — and is corrected in
  the same change.
- Polish: the convention says translations of module-owned pages "are not copied" and are
  updated by hand under `docs/i18n/pl/` in the same pull request, then held by
  `check:docs-translations`. Two files exist **[measured]** (`find docs/i18n/pl -iname '*seo*'`):
  `…/current/modules/seo.md` and `…/current/module-reference/seo.md`.
- No relative link to a sibling module's page or to the site's own tree (items 1a, 1b).
- `composer:generate` is re-run because the page's `description` front matter feeds the generated
  module map.

**Release intent** (`specs/conventions/release-intent.md` **[read]**)

- The rule is "a pull request that changes what a package **publishes** carries a changeset";
  `backend`, `admin`, `storefront` and `docs` are in the `ignore` list.
- **The storefront is not exempt in practice.** `@endora-commerce/cli`'s build runs
  `scripts/write-storefront-reference.mjs` and its `prepack` asserts it **[read]**
  (`packages/cli/package.json`), and `new-storefront/reference.ts` says a published CLI carries
  the reference storefront. A change under `storefront/` therefore changes what the CLI package
  emits, and `check:release-intent -- --since origin/master` is the instrument that decides —
  not the directory.
- Versioning is lockstep with one `fixed` group; `major` is refused in `0.x`. Every changeset in
  this feature is **`minor`**: each slice adds published surface (schema members, a zone member,
  a manifest field, routes, a migration).
- One changeset per meaning, written for the consumer. Per slice, in `plan.md` § *Slices*.

---

## R11 — The reference storefront, and the copies of it

**Evidence**: the storefront in this repository is the template client instances are scaffolded
from **[read]** (`storefront/next.config.js`: "the scaffold copies this file verbatim";
`packages/cli/src/new-storefront/reference.ts`: `git ls-files` decides which files it is).

**What an instance scaffolded earlier has to change** — the same list, taken through
`specs/140-instance-upgrade/`:

| File | Change |
| --- | --- |
| `app/robots.ts` | **deleted** (it conflicts with the directory below) |
| `app/robots.txt/route.ts` | new |
| `app/llms.txt/route.ts` | new |
| `lib/seo/robots-system-rules.ts` | new — the list moved out of `app/robots.ts`; an instance that edited its list carries its edits here |
| `lib/seo/crawler-policy.ts` | new — the reader and the last-known cache |
| `lib/seo/robots-directive.ts` | new — the policy → header / tag decision the middleware and the layout share |
| `lib/seo/llms-txt-base.ts` | new — the generated `llms.txt` base |
| `middleware.ts` | policy resolution, the response header, the request header, the widened matcher |
| `app/layout.tsx` | the additional `<meta name="robots">` |
| `app/reserved-segments.ts` | two entries |
| `test/seo/route-declarations.test.ts` and the new tests | follow the files they test |

Two comments also go stale and travel with the copy: `storefront/.env.example` and
`deploy/compose.prod.yml` both say `/robots.txt` is prerendered, which stops being true.

An instance that takes the backend upgrade and not the storefront one keeps working: its old
`robots.ts` serves its own rules, its pages carry only their own declarations, and the Admin UI
says `storefront-outdated` in the preview (R2). **It also means the default-robots setting does
nothing on that instance**, and nothing but the preview's state says so. The documentation states
it; a louder signal is an open point for the owner (`plan.md` § *Decisions for the owner*).

**The paid repository's demo storefront** (a copy of `storefront/` in GitLab
`endora-commerce/paid-modules`, not touched here) needs exactly the files in the table. It is
what `demo-pro` is built from, so until that copy is updated the feature is released but one of
the two motivating instances cannot use it.

---

## R12 — Sequencing

The first slice needs none of the three Settings-screen changes: a closed-list setting already
renders as a dropdown and already resolves per channel **[read]** (`SettingRowEditor.tsx` line
203; `SettingDtoSchema`). So *Default robots* ships first, alone, and takes both demos out of
search. Everything else is additive on top. The slice list, with dependencies, sizes and the
tests each starts from, is `plan.md` § *Slices*.

---

## Open points carried into the plan

None blocks the first slice. Each is in `plan.md` § *Decisions for the owner* or § *Inferred, to
be proven by the first test of the slice*.
