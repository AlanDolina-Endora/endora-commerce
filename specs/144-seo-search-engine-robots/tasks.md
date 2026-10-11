# Tasks: search engine robots (`specs/144-seo-search-engine-robots/`)

**Input**: `spec.md` (amended 2026-10-11), `plan.md`, `research.md`, `data-model.md`,
`contracts/crawler-policy.md`, `contracts/admin-surfaces.md`, `quickstart.md`.

**Organisation**: by the plan's six slices. Each slice is **one pull request**, shippable on its
own, branched off `origin/master`, with its own changeset. Tests are mandatory (Principle III):
inside every slice the failing-test task precedes the task that makes it pass.

## Format

`- [ ] T### [P?] [US?] description — file path(s) — **Test:** command`

- **[P]** — may run in parallel with its neighbours (different files, no dependency).
- **[US1…US4]** — the user story of `spec.md` the task serves; a task with none serves a
  requirement shared by all (FR-004, FR-008).
- **[OD1…OD5]** — the task rests on one of five owner decisions. **All five were ruled on
  2026-10-11, as recommended** (`spec.md` § *Owner rulings*, R6 – R10); the tags are kept so a
  task can be traced to its ruling. See the table below.
- **RED** marks a task whose deliverable is a failing test. Commit it failing, or at least run it
  and paste the failure into the pull request, before starting the task that turns it green.

## Dependency chain

```text
Slice 1 ──────────────────────────────┐ (alone: the demos can be set non-indexable)
Slice 2a ─────────────────────────────┤ independent of everything
Slice 2b ──► Slice 3 ──► Slice 4 ──► Slice 5
             (also needs 1's reader)   (5's preview needs 4; 5 without it needs only 3)
```

Slices 1, 2a and 2b can be built in parallel by different implementers. Slice 3 needs 2b merged
(a single-line field destroys line breaks) and 1 merged (it extends the reader slice 1 creates).

## The five owner decisions — ruled 2026-10-11

Owner, 2026-10-11 (translated from Polish): *"Do it with the recommendations."* Each row below is
therefore a **ruling**, recorded in `spec.md` § *Owner rulings* as R6 (OD1), R7 (OD2), R8 (OD3),
R9 (OD4) and R10 (OD5). The tasks are unchanged by it. The last column is kept as provenance: it
is what would have changed under the alternative, and no longer describes pending work.

| | Ruling | Tasks affected | The rejected alternative would have meant |
| --- | --- | --- | --- |
| **OD1** (plan D2) | The palette entry for the settings is offered to `settings:read` holders | T008, T013, T017 | Requiring `settings:write` cannot be declared on `/settings` — `check:action-route-permissions` would refuse it. The alternative is a new `settings` route that is itself gated by `settings:write` (for example a per-group route); that is a new task in slice 2a and T017's `targetRoute` changes to it. |
| **OD2** (plan D3) | The FR-033 warning is English-only on the platform modules screen; Polish only on the `seo.enabled` setting row | T017, T037 | A translatable module description on `packages/admin-shell/src/modules/platform/ModulesPage.tsx` is a platform-wide change and becomes its own feature; nothing in these tasks changes. |
| **OD3** (plan D4) | The four dropdown choices are the literal tokens, untranslated | T007, T008, T015, T037 | Translated option labels add: a third key family `settingLabels.<code>.option.<value>` to T034/T035, eight keys to T037, and the stored values become machine tokens (`noindex_nofollow` …) in T015/T017 and `contracts/admin-surfaces.md` §1. Decide **before slice 1 merges** — changing stored values afterwards needs `previousDefaultValues` and a data migration. |
| **OD4** | The *Default robots* row shows the `storefront-outdated` notice | T087, and one case of T085 | Drop T087 and that case. |
| **OD5** (spec A15) | `llms.txt` gets the same preview as `robots.txt` | T091, T092 | Drop T091 and T092; slice 5 no longer needs slice 4. |

## Before any slice

Every slice starts with `bash scripts/setup-worktree.sh` in a fresh worktree off `origin/master`
and `pnpm run build:packages`. After editing anything under `packages/`, rebuild that package
before running a backend, admin or storefront test — `tsc` reads sources through `paths`, the
test run reads `dist`, and a stale `dist` makes the two disagree.

**Tenant isolation (Principle XI), once for all slices**: the feature reads and writes no
organization-scoped data and adds no entity, so it owes no cross-tenant test.
`pnpm --filter backend exec tsx scripts/check-entity-tenant-classification.ts` must stay green
and unchanged; if it reports anything, something outside this design was added.

---

## Slice 1 — Default robots (US1, and the off state for it)

**Goal**: an operator sets *Default robots* per sales channel and every storefront response for
that channel carries it. **Independent test**: `quickstart.md` § *Slice 1*.
**Depends on**: nothing. **Second-agent review before "ready": yes** — the middleware runs on
every request and its matcher widens, so a defect is a storefront outage or a silently missing
`noindex`; a reviewer mutates the classification and the early return and re-runs the suite.

### Proofs of the inferred behaviours — do these first

Nothing in the plan was run against a built storefront. T001 – T004 are throwaway spikes on a
running storefront (`pnpm run dev:infra`, then `pnpm --filter storefront run build` and
`pnpm --filter storefront run start`, backend running). **Do not commit spike code.** Paste each
command and its output into the pull request description. Each names its fallback; applying a
fallback needs no return to the architect unless it says "stop".

- [ ] T001 [US1] **Prove Next metadata replaces rather than merges `robots`** (taken from the
  brief, never verified). Temporarily add `robots: { index: false, follow: false }` to
  `storefront/app/layout.tsx`'s `metadata` export; fetch `/` and `/cart`.
  **Test:** `curl -s localhost:3000/ | grep -o '<meta name="robots"[^>]*>'` and the same for
  `/cart`. *Expected*: `/` shows the layout's value; `/cart` shows only its own page value.
  *If it merges instead* (`/cart` shows a restrictive combination): the design still holds and
  gets simpler — record it, keep the tasks as written (the extra tag is then redundant on such
  pages, never wrong). Revert the edit.
- [ ] T002 [US1] **Prove I1** — a `<meta name="robots" content="noindex, nofollow">` element
  rendered as JSX by `storefront/app/layout.tsx`, outside the metadata API, reaches `<head>` and
  survives on a page that declares its own `robots`.
  **Test:** `curl -s localhost:3000/cart | grep -o '<meta name="robots"[^>]*>'` prints **two**
  tags; `curl -s localhost:3000/ | grep -c '<meta name="robots"'` prints `1`.
  *Fallback A* (tag missing or outside `<head>`): render it from a server component placed
  inside an explicit `<head>` element of the root layout; re-run. *Fallback B* (still not
  served): ship slice 1 with the response header only, record that User Story 1 scenario 2's
  "in the document" half is unmet, and **stop** to report — that is a spec deviation the
  architect has to carry to the owner.
- [ ] T003 [US1] **Prove I2** — module-level state in the middleware persists across requests in
  the standalone server. Temporarily add a module-scope counter to `storefront/middleware.ts`
  and echo it as a response header.
  **Test:** `for i in 1 2 3; do curl -sI localhost:3000/ | grep -i x-spike; done` prints 1, 2, 3.
  *Fallback* (it resets): keep the 60 s freshness with `fetch(..., { next: { revalidate: 60 } })`
  in the middleware and hold the last-known value in `storefront/lib/seo/crawler-policy.ts` as
  imported by the Node runtime, passed to the middleware's caller through the layout instead —
  note in the pull request that FR-017's last-known value then applies to the tag and not to the
  header.
- [ ] T004 [US1] **Prove I3** — widening the matcher costs nothing measurable. With the matcher
  temporarily changed to `'/((?!_next/static).*)'` and an immediate `NextResponse.next()` for
  non-document paths, time a public file before and after.
  **Test:** `for i in $(seq 50); do curl -s -o /dev/null -w '%{time_total}\n' localhost:3000/service-worker.js; done | sort -n | sed -n '25p;48p'`
  (median and p95), on both builds. Record both pairs. *Fallback* (p95 worse by more than 5 ms):
  narrow the matcher to an explicit alternation of indexable extensions
  (`png|jpg|jpeg|gif|svg|webp|ico|pdf|csv|txt|xml|webmanifest`) plus `/_next/image`, and say so
  in `contracts/crawler-policy.md` §6.

### Contract (Principle II)

- [ ] T005 [US1] RED — schema tests for `storefrontRobotsPolicySchema` and
  `storefrontRobotsPolicyResponseSchema` (accepts the four combinations; rejects a missing key, a
  non-boolean, an extra stored token) — `packages/contracts/src/seo.test.ts` (new).
  **Test:** `pnpm --filter @endora-commerce/contracts exec vitest run src/seo.test.ts`
- [ ] T006 [US1] Add both schemas and their inferred types to `packages/contracts/src/seo.ts`
  per `contracts/crawler-policy.md` §1; re-export from `packages/contracts/src/index.ts` if the
  file's existing exports are listed there. **Test:** as T005, then
  `pnpm --filter @endora-commerce/contracts run build`

### Backend — `seo`

- [ ] T007 [P] [US1] [OD3] RED — the token ↔ `{ index, follow }` mapping is total over the four values
  and maps an unknown token to `{ index: true, follow: true }` —
  `packages/modules/seo/src/backend/services/robots-policy.test.ts` (new).
  **Test:** `pnpm --filter @endora-commerce/mod-seo exec vitest run src/backend/services/robots-policy.test.ts`
- [ ] T008 [P] [US1] [OD1] [OD3] RED — the manifest declares `seo.default_robots` (group `seo`, `string`, the
  four `enumOptions`, default `INDEX, FOLLOW`, not `hidden`, no `salesChannelCodes`) and two
  actions with the ids, routes and codes of `contracts/admin-surfaces.md` §5 —
  `packages/modules/seo/src/manifest.test.ts` (new).
  **Test:** `pnpm --filter @endora-commerce/mod-seo exec vitest run src/manifest.test.ts`
- [ ] T009 [US1] RED — contract test for `GET /api/v1/storefront/seo/robots-policy`: `200` and
  the schema for each of the four stored values; `Cache-Control: no-store`; no authentication
  required — `backend/test/contract/seo/robots-policy.contract.test.ts` (new).
  **Test:** `pnpm --filter backend exec vitest run test/contract/seo/robots-policy.contract.test.ts`
- [ ] T010 [US1] RED — **channel isolation** (Principle XII): with channel A set to
  `NOINDEX, NOFOLLOW` and channel B left at the default, a request with `X-Sales-Channel: A`
  answers `{false,false}` and one with `B` answers `{true,true}`; a request naming **no** channel
  answers the system-default channel's value and never an aggregate; a channel value overrides
  the all-channels value and resetting it restores inheritance —
  `backend/test/integration/seo/robots-policy-channel-scope.test.ts` (new).
  **Test:** `pnpm --filter backend exec vitest run test/integration/seo/robots-policy-channel-scope.test.ts`
- [ ] T011 [US4] RED — **off state**: extend `backend/test/integration/seo/off-state.test.ts` so
  that, deactivated-while-platform-available, `GET /api/v1/storefront/seo/robots-policy` answers
  `503` `MODULE_DISABLED`; `seo.default_robots` is reported `editable: false` and a write to it
  is refused; the stored value survives; and after reactivation the endpoint answers the stored
  value. **Test:** `pnpm --filter backend exec vitest run test/integration/seo/off-state.test.ts`
- [ ] T012 [US1] RED — FR-007: a `PUT` of `seo.default_robots` by an admin without
  `settings:write` is refused, a value outside the list is refused, and an accepted write leaves
  one audit entry carrying the before and after values —
  `backend/test/integration/seo/default-robots-write.test.ts` (new).
  **Test:** `pnpm --filter backend exec vitest run test/integration/seo/default-robots-write.test.ts`
- [ ] T013 [US1] [OD1] RED — update the palette expectation from `{ module: 'seo', actions: [] }`
  to the two actions, present while on and absent while off —
  `backend/test/integration/_admin_surfaces/batch-eight-palette-off-state.test.ts` (line 62 and
  the comment at line 37 that says `seo` declares none).
  **Test:** `pnpm --filter backend exec vitest run test/integration/_admin_surfaces/batch-eight-palette-off-state.test.ts`
- [ ] T014 [US1] Implement the mapping — `packages/modules/seo/src/backend/services/robots-policy.ts`
  (new). **Test:** T007's command.
- [ ] T015 [US1] [OD3] Declare `seo.default_robots` in `packages/modules/seo/src/manifest.ts`.
  **Test:** T008's command (the setting half).
- [ ] T016 [US1] Register `GET /api/v1/storefront/seo/robots-policy` inside the existing
  `registerSeoRoutes` — `packages/modules/seo/src/backend/routes.ts`; resolve the channel with
  `getResolvedChannel(request)` and read the setting through the `settingsReadPort` the module
  already resolves (`packages/modules/seo/src/backend/index.ts`: pass it into the route deps).
  No per-handler presence check. **Test:** T009, T010, T011, T012.
- [ ] T017 [US1] [OD1] [OD2] Declare the two `actions` in
  `packages/modules/seo/src/manifest.ts`; add the FR-033 sentence to the module `description`
  and to the `seo.enabled` setting's `description`; add the action keys to
  `packages/modules/seo/i18n/en.json` and `pl.json` (flat). **Test:** T008, T013, and
  `pnpm --filter backend exec vitest run test/unit/_i18n/registered-bundles-shape.test.ts`

### Storefront

Pure decisions live in `storefront/lib/seo/` and are unit-tested; `middleware.ts` stays thin, as
`gateDecision` in `storefront/lib/service-unavailable.ts` already is.

- [ ] T018 [P] [US1] RED — the directive function: `null`, unknown and `{true,true}` → no
  header and no tag; the other three → the exact strings of `contracts/crawler-policy.md` §6 —
  `storefront/test/seo/robots-directive.test.ts` (new).
  **Test:** `pnpm --filter storefront exec vitest run test/seo/robots-directive.test.ts`
- [ ] T019 [P] [US1] [US4] RED — the reader, with an injected `fetch` and clock:
  - `200` → value, fresh for 60 s, no second request inside the window;
  - stale → one refetch; on success the value is replaced;
  - `503` with `error.code: 'MODULE_DISABLED'` → **none**, cached, and it **replaces** an
    earlier last-known value (off-state, FR-030);
  - `404` → **none** (FR-031);
  - timeout, network error, `500`, a body failing the schema → the last-known value of any age;
    with no last-known value → `'unknown'` (FR-017);
  - while failing, at most one refetch per 5 s;
  - **channel isolation**: the cache is keyed by channel code — a value read for channel A is
    never returned for channel B, nor for a request naming no channel;
  - the request carries `X-Sales-Channel` when a channel is named and omits it otherwise —
  `storefront/test/seo/crawler-policy.test.ts` (new).
  **Test:** `pnpm --filter storefront exec vitest run test/seo/crawler-policy.test.ts`
- [ ] T020 [P] [US1] RED — path classification: `isDocumentPath` is `false` for `/robots.txt`,
  `/sitemap.xml`, `/manifest.webmanifest`, `/_next/image`, `/icons/x.png`, `/service-worker.js`,
  and `true` for `/`, `/p/x`, `/cart`; every path today's matcher treats as a document is still
  one (derive the cases from the current `config.matcher` regex, do not restate it); and
  the request-header decision always **deletes** `x-robots-default` when there is no restrictive
  policy (a client-supplied value never survives) — `storefront/test/seo/middleware-robots.test.ts`
  (new). **Test:** `pnpm --filter storefront exec vitest run test/seo/middleware-robots.test.ts`
- [ ] T021 [P] [US1] RED — FR-035: the root layout declares no `robots` through the metadata API
  (parse `storefront/app/layout.tsx` with the TypeScript compiler API, as
  `storefront/test/seo/route-declarations.test.ts` reads sources) —
  `storefront/test/seo/layout-robots.test.ts` (new).
  **Test:** `pnpm --filter storefront exec vitest run test/seo/layout-robots.test.ts`
- [ ] T022 [US1] Implement `storefront/lib/seo/robots-directive.ts` (new). **Test:** T018.
- [ ] T023 [US1] Implement `storefront/lib/seo/crawler-policy.ts` (new) — the reader for
  `robots-policy`, module-scope cache, classification per `contracts/crawler-policy.md` §3 (or
  T003's fallback). Validate the body with `storefrontRobotsPolicyResponseSchema`. **Test:** T019.
- [ ] T024 [US1] `storefront/middleware.ts`: widen `config.matcher` (or T004's fallback); branch
  first on non-document paths (header only, then return — no reachability probe, no `x-pathname`,
  no rewrite); for documents resolve the policy, set or delete `x-robots-default` on the
  forwarded request headers, set `X-Robots-Tag` on the response including the `503` rewrite.
  **Test:** T020, plus `pnpm --filter storefront exec vitest run test/service-unavailable.test.tsx`
  (the existing gate must be unchanged).
- [ ] T025 [US1] `storefront/app/layout.tsx`: read `x-robots-default` through the `headers()`
  call it already makes and render the extra `<meta name="robots">` in the form T002 proved; do
  not touch the `metadata` export. **Test:** T021, then the served proof of T026.
- [ ] T026 [US1] [US4] Served proof on a built storefront — the eight `curl` lines of
  `quickstart.md` § *Slice 1*, the per-channel step, the reset step, the FR-017 step, and the
  off-state paragraph. Paste the output into the pull request. **This is the only evidence of the
  served behaviour**: GitHub's workflows do not run the storefront conformance job
  (`grep -n conformance .github/workflows/*.yml` is empty).
- [ ] T027 [P] [US1] Add the same assertions as a committed instrument for whoever runs the
  conformance job — `storefront/test/conformance/robots-directive.spec.ts` (new), reading the
  policy endpoint first and asserting the header and tags on `/`, `/cart`, `/sitemap.xml`.
  **Test:** `STOREFRONT_URL=http://127.0.0.1:3000 pnpm --filter storefront run conformance -- robots-directive`

### Documentation and release

- [ ] T028 [US1] `packages/modules/seo/docs/seo.md`: a *Search engine robots* section for the
  default (what it does, that it only restricts, why `robots.txt` stays open, the off state, how
  long search engines take, the two limits FR-037 names — backend-served media, and the
  cold-start window); correct the stale route table (the admin sitemap routes carry
  `:channelCode`). No relative link to another module's page or to the site's own tree.
  Then the Polish files `docs/i18n/pl/docusaurus-plugin-content-docs/current/modules/seo.md` and
  `…/module-reference/seo.md` per `docs/docs/contributing/documentation-i18n.md`.
  **Test:** `pnpm --filter backend run check:module-docs && pnpm --filter backend run check:docs-translations`
- [ ] T029 [US1] `pnpm --filter backend run composer:generate`; commit every artefact it changes
  (the manifest index, the docs artefacts). **Test:** `pnpm --filter backend run overlay:check`
- [ ] T030 [US1] Changeset, `minor`, written for a consumer: the new setting, the new endpoint
  and its schema names, the reference storefront's new header and matcher, and the one thing an
  earlier-scaffolded instance must copy (`middleware.ts`, `app/layout.tsx`,
  `lib/seo/crawler-policy.ts`, `lib/seo/robots-directive.ts`). **Test:**
  `pnpm --filter backend run check:release-intent -- --since origin/master`
- [ ] T031 [US1] Run the slice verification list below; fix what it finds.

### Slice 1 — verification before "ready"

```bash
pnpm run build:packages
pnpm -r run typecheck && pnpm -r run lint
pnpm run check:naming && pnpm run check:language
pnpm --filter backend exec tsx scripts/check-channel-resolution.ts --enforce
pnpm --filter backend exec tsx scripts/check-entity-tenant-classification.ts
pnpm --filter backend run check:module-boundary
pnpm --filter backend run check:port-dependencies
pnpm --filter backend run check:action-route-permissions
pnpm --filter backend run check:off-state-coverage
pnpm --filter backend run check:storefront-indexability      # must be unchanged: no page.tsx touched
pnpm --filter backend run check:rsc-discipline
pnpm --filter backend run check:env-inputs                   # no new environment input is expected
pnpm --filter backend run check:bundle-pairing
pnpm --filter backend run check:default-language-prose
pnpm --filter backend run check:error-translations
pnpm --filter backend run check:module-docs && pnpm --filter backend run check:docs-translations
pnpm --filter backend run check:doc-snippets
pnpm --filter backend run check:nul-bytes
pnpm --filter backend run check:platform-surface
pnpm --filter backend run overlay:check && pnpm --filter backend run manifests:check
pnpm --filter backend run check:release-intent -- --since origin/master
pnpm --filter backend exec vitest run test/contract/seo test/integration/seo \
  test/integration/_admin_surfaces/batch-eight-palette-off-state.test.ts \
  test/contract/admin_users/permission-inventory.test.ts \
  test/unit/_i18n/registered-bundles-shape.test.ts \
  test/unit/scripts/read-size-drift.test.ts
pnpm --filter '!backend' run test
git diff --stat origin/master -- 'storefront/app/**/page.tsx'   # must print nothing
```

- **Generated artefacts to commit**: whatever `composer:generate` changes.
- **Read sizes**: adding files moves the whole-repository walks by a handful. Per
  `specs/conventions/check-estate.md` § *When a read size is re-recorded*, leave the record alone
  unless `read-size-drift.test.ts` is **red**; if it is, read § *Measuring a read size* first and
  re-measure on a pristine clone — never compute from a delta, never widen a band.
- **Not gated by the pull request**: `test:backend` contract and integration suites beyond the
  files named above. The files named above are the ones this slice can redden; run them.

**Checkpoint**: slice 1 merged and released ⇒ both demos can be set non-indexable (an operational
step outside these tasks; `demo-pro` also needs the paid repository's storefront copy updated —
`research.md` R11).

---

## Slice 2a — Setting names from the owner's bundle (FR-008)

**Goal**: the Settings screen shows a setting's name and description in the administrator's
language when its owner ships the keys, and the declared string otherwise. **Depends on**:
nothing. **Second-agent review: no** — presentation only, with a fallback to today's behaviour.

`@endora-commerce/mod-settings` has no test script and no co-located tests
(`packages/modules/settings/package.json`), so its admin tests live in `admin/test/modules/settings/`,
where `admin/test/modules/admin_users/permission-label.test.ts` sets the precedent.

- [ ] T032 RED — **prove I4 and specify the resolver**: given a merged bundle carrying
  `settingLabels.seo.default_robots.name` under scope `seo`, the resolver returns the Polish
  string for `pl`, the English one for `pl` when only `en` has it, and the DTO's `name` when
  neither has it; same for `.description` and for `settingGroups.<code>.name`; a `null`
  description stays `null` — `admin/test/modules/settings/setting-label.test.ts` (new).
  **Test:** `pnpm --filter admin exec vitest run test/modules/settings/setting-label.test.ts`.
  *Fallback for I4* (the module's keys are not under a scope equal to its id): find the scope by
  scanning, exactly as `scopeCarrying` does in
  `packages/modules/admin_users/src/admin/permission-label.ts`; the test's expectations do not
  change.
- [ ] T033 RED — the row editor and the group heading render the resolved strings —
  `admin/test/modules/settings/setting-row-labels.test.tsx` (new).
  **Test:** `pnpm --filter admin exec vitest run test/modules/settings/setting-row-labels.test.tsx`
- [ ] T034 Implement `packages/modules/settings/src/admin/components/setting-label.ts` (new),
  after `permission-label.ts`. **Test:** T032.
- [ ] T035 Use it at the three call sites — `packages/modules/settings/src/admin/components/SettingRowEditor.tsx`
  (name, line 111; description, line 175) and
  `packages/modules/settings/src/admin/pages/SettingsPage.tsx` (group name, line 475; re-locate
  by content, the line numbers are of `ca1e265a1`). **Test:** T033.
- [ ] T036 [P] RED — `seo`'s bundles carry `settingGroups.seo.name` and `settingLabels.*` name
  and description keys for every setting the manifest declares, in both languages — extend
  `packages/modules/seo/src/manifest.test.ts` (created in slice 1; create it here if slice 1 has
  not merged). **Test:** `pnpm --filter @endora-commerce/mod-seo exec vitest run src/manifest.test.ts`
- [ ] T037 [OD2] [OD3] Add those keys to `packages/modules/seo/i18n/en.json` and `pl.json` for
  the settings that exist on `origin/master` at the time (always `seo.enabled`;
  `seo.default_robots` once slice 1 has merged). The descriptions state the consequences FR-008
  and FR-033 require. **Test:** T036, `pnpm --filter backend run check:bundle-pairing`
- [ ] T038 [P] Document the convention for module authors in
  `packages/modules/settings/docs/` (the page that describes declaring settings) and its Polish
  counterpart under `docs/i18n/pl/`. **Test:** `pnpm --filter backend run check:module-docs && pnpm --filter backend run check:docs-translations`
- [ ] T039 Changeset, `minor`: "a setting's name and description resolve from
  `settingLabels.<code>.name|description` and `settingGroups.<code>.name` in its owner module's
  bundle; the declared string is the fallback". **Test:** `pnpm --filter backend run check:release-intent -- --since origin/master`
- [ ] T040 Slice verification: the Slice 1 list, minus the storefront and channel lines, plus
  `pnpm --filter backend run i18n:hardcoded` (a hard-coded string added to the admin fails it;
  never raise a baseline number).

**Channel / off-state tests owed**: none — no channel-scoped read, no gated surface.

---

## Slice 2b — Multi-line text settings (FR-004)

**Goal**: a `string` setting declared `multiline: true` is edited in a multi-line field that
preserves line breaks. **Depends on**: nothing. **Second-agent review before "ready": yes** — it
carries a migration on a platform table every instance has; the reviewer runs the migration on a
populated database, runs the whole `test/integration/settings` tree, and checks the migration is
registered.

- [ ] T041 RED — `SettingManifestEntrySchema` accepts `multiline: true` on a `string` setting;
  refuses it on any other `valueType` and together with `enumOptions`; `SettingDtoSchema` accepts
  the field and its absence — `packages/contracts/src/settings.test.ts` (new).
  **Test:** `pnpm --filter @endora-commerce/contracts exec vitest run src/settings.test.ts`
- [ ] T042 Add the field and the refinement to `packages/contracts/src/settings.ts`
  (`SettingManifestEntrySchema`, `SettingDtoSchema`) per `contracts/admin-surfaces.md` §2.1.
  **Test:** T041, then `pnpm --filter @endora-commerce/contracts run build`
- [ ] T043 RED — a manifest declaring a multi-line setting produces a row with `multiline = true`
  at boot; removing the flag and booting again sets it back to `false`; an untouched manifest
  yields `false` — extend `backend/test/integration/settings/boot-time-sync.test.ts`.
  **Test:** `pnpm --filter backend exec vitest run test/integration/settings/boot-time-sync.test.ts`
- [ ] T044 RED — the admin settings list and detail responses carry `multiline` — extend
  `backend/test/contract/settings/admin-list-and-detail.contract.test.ts`.
  **Test:** `pnpm --filter backend exec vitest run test/contract/settings/admin-list-and-detail.contract.test.ts`
- [ ] T045 Scaffold the migration — `pnpm --filter backend run migration:new -- --module core`
  (read `specs/conventions/module-migrations.md` first; **do not choose a number or a
  timestamp**). Body: `alter table "settings" add column "multiline" boolean not null default
  false;` and the matching `down`. It lands in `packages/platform/src/migrations/`.
  **Test:** `pnpm --filter backend exec vitest run test/integration/settings/migration.test.ts`
- [ ] T046 `pnpm --filter backend run composer:generate`; commit the migration registry it
  regenerates — an unregistered migration does not run and nothing reports it.
  **Test:** `pnpm --filter backend run overlay:check`
- [ ] T047 `packages/platform/src/kernel/settings/setting.entity.ts` (property and
  `OptionalProps`), `packages/platform/src/kernel/settings/manifest-reconciler.ts` (beside the
  `hidden` sync, both the update and the create branch). **Test:** T043.
- [ ] T048 `packages/modules/settings/src/backend/routes.admin.ts` — `serializeSetting` emits
  `multiline`. **Test:** T044.
- [ ] T049 RED — the row editor renders a `<textarea>` for a multi-line setting, a single-line
  input otherwise; a three-line value round-trips through edit and save unchanged; read-only and
  reset behave as for other rows — `admin/test/modules/settings/setting-row-multiline.test.tsx`
  (new). **Test:** `pnpm --filter admin exec vitest run test/modules/settings/setting-row-multiline.test.tsx`
- [ ] T050 `packages/modules/settings/src/admin/components/SettingRowEditor.tsx` — pass
  `setting.multiline` to `renderInput` and add the branch. **Test:** T049.
- [ ] T051 [P] Document `multiline` for module authors in `packages/modules/settings/docs/` and
  the Polish counterpart. **Test:** `pnpm --filter backend run check:module-docs && pnpm --filter backend run check:docs-translations`
- [ ] T052 Changeset, `minor`: "`multiline: true` on a `string` setting declaration; a new
  `settings.multiline` column; `SettingDto.multiline`". **Test:**
  `pnpm --filter backend run check:release-intent -- --since origin/master`
- [ ] T053 Slice verification: the Slice 1 list minus the storefront lines, plus
  `pnpm --filter backend exec vitest run test/integration/settings test/contract/settings`,
  `pnpm --filter backend run check:kernel-boundary`, `pnpm --filter backend run check:lock-claims`,
  and a migration run on a database that already holds settings rows. **Never run `db:fresh`,
  `db:reset` or a `module:*` command unprefixed — they read `backend/.env` and act on the dev
  database.**

**Channel / off-state tests owed**: none.

---

## Slice 3 — Custom `robots.txt` instructions (US2 without the preview)

**Goal**: the operator's text is appended to the system-generated rules in the channel's
`robots.txt`; reset removes it. **Independent test**: `quickstart.md` § *Slice 3*.
**Depends on**: slice 2b (merged) and slice 1 (merged). **Second-agent review before "ready":
yes** — it deletes a file other files import, replaces a public file every crawler reads with a
handler that can answer `503`, and may add a lifecycle edge to `seo`.

### Contract

- [ ] T054 [US2] RED — `composeCrawlerFile(base, extra)`: empty and whitespace-only `extra`
  return `base` byte for byte; otherwise one trailing line break on `base`, one blank line,
  `extra` untouched, one trailing line break; CRLF in `extra` is preserved; and
  `storefrontCrawlerFilesSchema` / its response schema — extend `packages/contracts/src/seo.test.ts`.
  **Test:** `pnpm --filter @endora-commerce/contracts exec vitest run src/seo.test.ts`
- [ ] T055 [US2] Implement both in `packages/contracts/src/seo.ts` per
  `contracts/crawler-policy.md` §2 and §4. **Test:** T054, then build the package.

### Backend — `seo`

- [ ] T056 [P] [US2] RED — the validator accepts 65 536 bytes of UTF-8 and refuses 65 537
  (measure bytes, not characters: include a multi-byte case), answering `400` with
  `SEO_CRAWLER_TEXT_TOO_LARGE` and a message naming the limit; it answers for exactly
  `seo.robots_txt_custom` (and `seo.llms_txt_additional` once declared) —
  `packages/modules/seo/src/backend/services/crawler-text-validator.test.ts` (new).
  **Test:** `pnpm --filter @endora-commerce/mod-seo exec vitest run src/backend/services/crawler-text-validator.test.ts`
- [ ] T057 [US2] RED — contract test for `GET /api/v1/storefront/seo/crawler-files`: schema,
  `no-store`, text returned exactly as stored including line breaks —
  `backend/test/contract/seo/crawler-files.contract.test.ts` (new).
  **Test:** `pnpm --filter backend exec vitest run test/contract/seo/crawler-files.contract.test.ts`
- [ ] T058 [US2] RED — **channel isolation**: channel A's custom text is returned for A and
  **never** for B or for a request naming no channel; A inherits the all-channels text when it
  has none of its own; resetting A restores inheritance; an over-limit write is refused and the
  previous value stays — `backend/test/integration/seo/crawler-files-channel-scope.test.ts` (new).
  **Test:** `pnpm --filter backend exec vitest run test/integration/seo/crawler-files-channel-scope.test.ts`
- [ ] T059 [US4] RED — **off state**: extend `backend/test/integration/seo/off-state.test.ts`:
  the `crawler-files` route answers `503` `MODULE_DISABLED`, `seo.robots_txt_custom` is
  `editable: false`, the stored text survives and is served again after reactivation.
  **Test:** `pnpm --filter backend exec vitest run test/integration/seo/off-state.test.ts`
- [ ] T060 [US2] Declare `seo.robots_txt_custom` (`multiline: true`, default `''`) in
  `packages/modules/seo/src/manifest.ts`; add its `settingLabels.*` keys to both bundles; extend
  `packages/modules/seo/src/manifest.test.ts`. **Test:**
  `pnpm --filter @endora-commerce/mod-seo exec vitest run src/manifest.test.ts`
- [ ] T061 [US2] `packages/modules/seo/src/backend/services/crawler-files.service.ts` (new) and
  the route in `packages/modules/seo/src/backend/routes.ts`. `shop.name` is read through the
  settings read port (find the code in `packages/modules/settings/src/backend/services/shop-info-resolver.ts`;
  do not call that module's route or import its resolver). **Test:** T057, T058, T059.
- [ ] T062 [US2] `packages/modules/seo/src/backend/services/crawler-text-validator.ts` (new);
  register it from a **contribution** `ctx.onBoot` hook in
  `packages/modules/seo/src/backend/index.ts`, resolving `settingWriteValidatorRegistry` with
  `lazyPort`, exactly as `packages/modules/invoices/src/backend/index.ts` does (~line 443). The
  hook must **not** probe presence. Register the error code and its `en` / `pl` sentences the way
  the `settings` manifest registers `SETTING_VALUE_SHAPE_MISMATCH`. **Test:** T056, T058, and
  `pnpm --filter backend run check:error-translations`
- [ ] T063 [US2] Run `pnpm --filter backend run check:port-dependencies` and
  `pnpm --filter backend run check:entry-presence`. *Expected*: the first asks for `'settings'`
  in `seo`'s manifest `dependencies` (as `invoices` declares it) — add it, with a one-line reason
  comment; the second asks for a `BOOT_HOOKS_WITHOUT_PRESENCE` entry for the contribution hook —
  add it with the reason "contributes an inert validator; the registry filters by contributor".
  If either asks for anything else, stop and report. **Test:** both checks green.

### Storefront

- [ ] T064 [P] [US2] RED — fixture equivalence (FR-011, FR-019): the text rendered from the
  moved rules equals, line for line, the text Next produced from `MetadataRoute.Robots` before
  this change. Capture the fixture **before** deleting anything:
  `curl -s localhost:3000/robots.txt > storefront/test/seo/__fixtures__/robots-before.txt` on a
  storefront built from `origin/master` with `NEXT_PUBLIC_SITE_URL=http://localhost:3000` —
  `storefront/test/seo/robots-system-rules.test.ts` (new).
  **Test:** `pnpm --filter storefront exec vitest run test/seo/robots-system-rules.test.ts`
- [ ] T065 [P] [US2] RED — the handler: no custom text → the fixture, `200`, `text/plain;
  charset=utf-8`, `Cache-Control: public, max-age=60`, `X-Endora-Crawler-Files: 1`; custom text →
  `composeCrawlerFile`; `?part=system` → the fixture and **no backend request**; "none" → the
  fixture; unreadable with a last-known value → that version; unreadable without → `503`,
  `Retry-After: 120`, `no-store`, and still the capability header; the policy never changes the
  body (FR-015); **channel isolation** — the request's `x-sales-channel` is forwarded and the
  cache is keyed by it — `storefront/test/seo/robots-txt-route.test.ts` (new).
  **Test:** `pnpm --filter storefront exec vitest run test/seo/robots-txt-route.test.ts`
- [ ] T066 [US2] RED — extend `storefront/test/seo/crawler-policy.test.ts` for the
  `crawler-files` read (same classification table as T019).
- [ ] T067 [US2] `storefront/lib/seo/robots-system-rules.ts` (new): the list moved **unchanged**
  out of `storefront/app/robots.ts`, with its comment, plus the renderer. **Test:** T064.
- [ ] T068 [US2] Extend `storefront/lib/seo/crawler-policy.ts` with the `crawler-files` read.
  **Test:** T066.
- [ ] T069 [US2] `storefront/app/robots.txt/route.ts` (new, `dynamic = 'force-dynamic'`).
  **Test:** T065.
- [ ] T070 [US2] **Delete `storefront/app/robots.ts`.** First:
  `grep -rn "app/robots'\|app/robots\"\|robots\.ts" backend/test backend/scripts storefront packages/cli/src --include='*.ts' --include='*.tsx' --include='*.mjs'`
  and repair every importer. Known: `storefront/test/seo/route-declarations.test.ts`
  (`import robots from '../../app/robots'`) — rewrite its `robots` cases against
  `robots-system-rules.ts`; and three comments that name the file
  (`storefront/app/reserved-segments.ts`, `backend/scripts/check-storefront-indexability.ts`,
  `storefront/.env.example` / `deploy/compose.prod.yml`, which say the file is prerendered —
  it no longer is). **Test:** `pnpm --filter storefront exec vitest run test/seo` and
  `pnpm --filter backend exec vitest run test/unit/scripts/check-storefront-indexability.test.ts`
- [ ] T071 [US2] `storefront/app/reserved-segments.ts`: add `robots.txt` (and correct the
  paragraph that explains why it was absent). **Test:**
  `pnpm --filter backend exec vitest run test/contract/cms/admin-reserved-slug-segments.contract.test.ts`
  and `pnpm --filter backend run check:storefront-indexability`
- [ ] T072 [US2] Served proof (`quickstart.md` § *Slice 3*), including a `diff` of the default
  file against the T064 fixture and the `503` case with the backend route blocked and a freshly
  started storefront. Paste into the pull request.
- [ ] T073 [US2] Docs (`packages/modules/seo/docs/seo.md` and both Polish files): what the file
  contains and in what order, reset, the size limit, why a `Disallow: /` defeats `noindex`.
  `composer:generate`. Changeset `minor`, naming for an earlier-scaffolded instance the files to
  copy and the one to **delete**. **Test:** `check:module-docs`, `check:docs-translations`,
  `check:release-intent -- --since origin/master`
- [ ] T074 [US2] Slice verification: the full Slice 1 list, plus
  `pnpm --filter backend run check:entry-presence`, `pnpm --filter backend run check:port-catches`,
  `pnpm --filter backend run check:port-shape`. Because a file was deleted, `test:unit:fast`
  proves nothing here; run the trees that can import or name it:
  `pnpm --filter backend exec vitest run test/contract/cms test/contract/seo test/integration/seo test/integration/blog/url-prefix-validation.test.ts test/unit/scripts`.

---

## Slice 4 — The preview (FR-038 – FR-043, FR-045)

**Goal**: beside *Custom robots.txt instructions* the operator sees the file as it will be
served, with their unsaved text. **Independent test**: `quickstart.md` § *Slice 4*.
**Depends on**: slice 3. **Second-agent review before "ready": yes** — the backend makes an
outbound request to an operator-configured address; the reviewer tests the bounds (timeout, size
cap, no cross-host redirect, fixed paths) and that the endpoint cannot be made to fetch anything
else.

- [ ] T075 [US2] RED — `AdminZoneNameSchema` contains `settings.setting.after` and
  `AdminZonePropsMap` types its props per `contracts/admin-surfaces.md` §2.3; the preview query
  and response schemas accept each of the five states and refuse an unknown one — extend
  `packages/contracts/src/seo.test.ts`; add a type-level case where the contracts package keeps
  its zone tests (search `packages/contracts/src` for an existing zone-name test and extend it;
  create `admin-contributions.test.ts` if there is none).
  **Test:** `pnpm --filter @endora-commerce/contracts exec vitest run`
- [ ] T076 [US2] Add the zone member and its props to `packages/contracts/src/admin-contributions.ts`
  (with the doc comment every member carries: where it is mounted, how many times, its props);
  add the preview schemas to `packages/contracts/src/seo.ts`. **Test:** T075, build the package.
- [ ] T077 [US2] RED — the row editor mounts the zone once per row with the documented props,
  passes the **unsaved** text and `dirty`, and does **not** mount it for a `secret` setting —
  `admin/test/modules/settings/setting-row-zone.test.tsx` (new).
  **Test:** `pnpm --filter admin exec vitest run test/modules/settings/setting-row-zone.test.tsx`
- [ ] T078 [US2] Mount `<AdminZone name="settings.setting.after" …>` in
  `packages/modules/settings/src/admin/components/SettingRowEditor.tsx`. **Test:** T077 and
  `pnpm --filter backend run check:admin-zones`. The check's two directions are *declared ⇒
  mounted by a host* and *contributed ⇒ declared* (the enum's own doc comment in
  `admin-contributions.ts`), so T076 alone is red and T076 + T078 is expected green with no
  contributor yet. If it also demands a contributor, do T086 in the same commit.
- [ ] T079 [P] [US2] RED — the storefront-address resolution, extracted: setting → env →
  fallback, reporting the rung — `packages/modules/seo/src/backend/services/storefront-address.service.test.ts`
  (new). **Test:** `pnpm --filter @endora-commerce/mod-seo exec vitest run src/backend/services/storefront-address.service.test.ts`
- [ ] T080 [P] [US2] RED — the preview service with a stubbed `fetch`, one case per row of the
  state table in `contracts/admin-surfaces.md` §3: `ok`; `storefront-outdated` (2xx, no
  capability header); `storefront-unreachable` for a timeout, a refusal, a `500`, a body over
  512 KiB, and a redirect to another host; `address-unknown` makes **no** request; the request
  is a `GET` to exactly `<url>/robots.txt?part=system` with `X-Sales-Channel`; `savedExtra`,
  `savedExtraSource` and `channelsWithOwnValue` are correct for a channel value, an inherited
  value and none — `packages/modules/seo/src/backend/services/crawler-file-preview.service.test.ts`
  (new). **Test:** `pnpm --filter @endora-commerce/mod-seo exec vitest run src/backend/services/crawler-file-preview.service.test.ts`
- [ ] T081 [US2] RED — contract test for `GET /api/v1/admin/seo/crawler-files/preview`: `401`
  unauthenticated, `403` without `settings:read`, `400` for a bad `file` or a missing channel,
  `200` and the schema; **channel isolation** — previewing channel A returns A's saved text and
  never B's — `backend/test/contract/seo/crawler-file-preview.contract.test.ts` (new).
  **Test:** `pnpm --filter backend exec vitest run test/contract/seo/crawler-file-preview.contract.test.ts`
- [ ] T082 [US4] RED — **off state**: extend `backend/test/integration/seo/off-state.test.ts` —
  the preview route answers `503` `MODULE_DISABLED`; and extend
  `backend/test/integration/_admin_surfaces/batch-eight-palette-off-state.test.ts` or the admin
  zone test of T085 so that the zone contribution is absent while `seo` is off and back after.
  **Test:** `pnpm --filter backend exec vitest run test/integration/seo/off-state.test.ts`
- [ ] T083 [US2] `packages/modules/seo/src/backend/services/storefront-address.service.ts` (new);
  make `sitemap-generator.service.ts` use it and delete its private copy. **Test:** T079 and
  `pnpm --filter backend exec vitest run test/contract/seo/sitemap.test.ts test/integration/seo`
  (the sitemap must be unchanged).
- [ ] T084 [US2] `packages/modules/seo/src/backend/services/crawler-file-preview.service.ts`
  (new) and the route in `routes.ts`, gated `requireAdmin('settings:read')` as the route's
  `preHandler`. **Test:** T080, T081, T082, and
  `pnpm --filter backend exec vitest run test/contract/admin_users/permission-inventory.test.ts`
- [ ] T085 [US2] RED — the preview's view model as a pure function (state + props → what is
  shown), one case per row of `contracts/admin-surfaces.md` §4, including: unsaved text marked
  not-yet-served; the all-channels case listing unaffected channels; the `NOINDEX` sentence; the
  `Disallow: /` caution; `storefront-outdated`; unreachable and address-unknown still showing the
  operator's part; the shared-address note — `packages/modules/seo/src/admin/zones/preview-model.test.ts`
  (new, `.ts`, no React). Plus one render test that the component is contributed, matched to its
  setting code, and gated — `admin/test/modules/seo/crawler-preview-zone.test.tsx` (new).
  **Test:** `pnpm --filter @endora-commerce/mod-seo exec vitest run src/admin/zones/preview-model.test.ts`
  and `pnpm --filter admin exec vitest run test/modules/seo/crawler-preview-zone.test.tsx`
- [ ] T086 [US2] `packages/modules/seo/src/admin/zones/preview-model.ts` and
  `RobotsTxtPreview.tsx` (new); contribute it in `packages/modules/seo/src/admin/index.ts` with
  `zoneComponent('settings.setting.after', () => import('./zones/RobotsTxtPreview.js'), { match:
  { settingCode: 'seo.robots_txt_custom' }, requiredPermission: 'settings:read' })`; add the
  `crawlerPreview.*` keys to both bundles. Compose with `composeCrawlerFile`. Existing admin-kit
  primitives only. **Test:** T085, `check:admin-zones`, `pnpm --filter backend run i18n:hardcoded`
- [ ] T087 [US1] [OD4] The outdated-storefront notice on the *Default robots* row: a second
  contribution matched to `seo.default_robots`, reusing the preview endpoint's `state`, rendering
  only when it is `storefront-outdated`; its case added to T085's model test.
  **Test:** T085's commands.
- [ ] T088 [US2] `storefront/app/robots.txt/route.ts` already answers `?part=system` (slice 3);
  confirm against the running pair and do the served proof of `quickstart.md` § *Slice 4*,
  including SC-010: the preview's composed text `diff`s empty against `curl /robots.txt` after
  saving. Paste into the pull request.
- [ ] T089 [US2] Docs (the preview, its states, what "outdated" means and how to resolve it);
  `composer:generate`; changeset `minor` naming the new zone member for module authors.
  **Test:** `check:module-docs`, `check:docs-translations`, `check:release-intent -- --since origin/master`
- [ ] T090 [US2] Slice verification: the full Slice 1 list plus
  `pnpm --filter backend run check:admin-zones`, `pnpm --filter backend run check:admin-surface`,
  `pnpm --filter backend run i18n:hardcoded`, and
  `pnpm --filter backend exec vitest run test/unit/scripts/check-read-size.test.ts test/unit/scripts/read-size-drift.test.ts`.
  **Read sizes**: adding a zone member is a change to `check:admin-zones`' own subject; if its
  recorded read moves outside the band, re-record **that entry only**, measured on a pristine
  clone, with the reason in the commit message.

---

## Slice 5 — `llms.txt` (US3, FR-044)

**Goal**: the storefront serves a per-channel `llms.txt` — generated base plus operator content —
and withdraws it on a non-indexable channel. **Independent test**: `quickstart.md` § *Slice 5*.
**Depends on**: slice 3; T091 – T092 need slice 4. **Second-agent review: no** — it reuses the
reader, the handler shape and the preview already reviewed, and adds no new seam.

- [ ] T091 [US3] [OD5] RED — the `llms` rows of the preview state table (`not-served`; the
  "no llms.txt is served for this channel" view when `!policy.index`) — extend
  `crawler-file-preview.service.test.ts` and `preview-model.test.ts`.
  **Test:** the two commands of T080 and T085.
- [ ] T092 [US3] [OD5] `packages/modules/seo/src/admin/zones/LlmsTxtPreview.tsx` (new) and its
  contribution matched to `seo.llms_txt_additional`; the service's `file: 'llms'` branch
  (`/llms.txt?part=base`). **Test:** T091, `check:admin-zones`.
- [ ] T093 [P] [US3] RED — the generated base: the shop name (or the site host when empty), one
  line per `SITEMAP_STATIC_ROUTES` entry with an absolute address, the sitemap; **no** address
  from a family the system rules close (assert against `robots-system-rules.ts`' own list, not a
  copy) — `storefront/test/seo/llms-txt-base.test.ts` (new).
  **Test:** `pnpm --filter storefront exec vitest run test/seo/llms-txt-base.test.ts`
- [ ] T094 [P] [US3] RED — the handler: base + additional content; `?part=base`; `404` when
  `!index` whatever the content holds (FR-027) and when the answer is "none" (off state,
  FR-030); `503` when unreadable with nothing known; the capability header on every answer;
  **channel isolation** as T065 — `storefront/test/seo/llms-txt-route.test.ts` (new).
  **Test:** `pnpm --filter storefront exec vitest run test/seo/llms-txt-route.test.ts`
- [ ] T095 [US3] RED — backend: `seo.llms_txt_additional` declared (`manifest.test.ts`); the
  `crawler-files` contract and **channel-scope** tests cover `llmsTxtAdditional`; the validator
  covers the code; the **off-state** test covers its `editable: false` — extend the files of
  T056 – T060. **Test:** `pnpm --filter backend exec vitest run test/contract/seo test/integration/seo`
- [ ] T096 [US3] Declare the setting and its bundle keys — `packages/modules/seo/src/manifest.ts`,
  `i18n/en.json`, `i18n/pl.json`; add the code to the validator's `codes`. **Test:** T095.
- [ ] T097 [US3] `storefront/lib/seo/llms-txt-base.ts` (new) and
  `storefront/app/llms.txt/route.ts` (new). **Test:** T093, T094.
- [ ] T098 [US3] `storefront/app/reserved-segments.ts`: add `llms.txt` (FR-028). **Test:**
  `pnpm --filter backend exec vitest run test/contract/cms/admin-reserved-slug-segments.contract.test.ts`
  and `pnpm --filter backend run check:storefront-indexability`
- [ ] T099 [US3] Served proof (`quickstart.md` § *Slice 5*) and the off-state paragraph. Docs,
  both languages; `composer:generate`; changeset `minor` naming the two new storefront files for
  earlier-scaffolded instances. **Test:** `check:module-docs`, `check:docs-translations`,
  `check:release-intent -- --since origin/master`
- [ ] T100 [US3] Slice verification: the full Slice 1 list plus `check:admin-zones` (if T092 is
  in) and `pnpm --filter backend run i18n:hardcoded`.

---

## After the last slice

- [ ] T101 Re-read `spec.md` FR-001 – FR-045 against the merged code and tick each against the
  test named in `plan.md` § *Requirement → test*; report any FR with no green test.
- [ ] T102 Hand `research.md` R11's file list to whoever maintains the paid repository's demo
  storefront copy (GitLab `endora-commerce/paid-modules`); this task does not touch that
  repository. Configuring the demos is the operational follow-up the spec places out of scope.

## Review summary

| Slice | Second-agent review before "ready" | Why |
| --- | --- | --- |
| 1 | **yes** | middleware on every request; widened matcher; the `noindex` promise itself |
| 2a | no | presentation with a fallback to today's behaviour |
| 2b | **yes** | migration on a platform table |
| 3 | **yes** | deletes an imported file; public file gains a `503` path; lifecycle edge |
| 4 | **yes** | backend-initiated outbound request to an operator-configured address |
| 5 | no | reuses reviewed seams |
