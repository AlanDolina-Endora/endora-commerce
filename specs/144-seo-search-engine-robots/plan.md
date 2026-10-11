# Implementation Plan: search engine robots — default page robots, `robots.txt` instructions, `llms.txt`, and their preview

**Branch**: `spec/seo-search-engine-robots` | **Date**: 2026-10-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/144-seo-search-engine-robots/spec.md`, as amended by
the owner's rulings of 2026-10-11 (R1 – R5).

## Summary

An operator sets, per sales channel, whether search engines may index the storefront, adds their
own lines to `robots.txt` and `llms.txt`, and sees the resulting files before saving.

The technical approach, with the evidence in [research.md](./research.md):

- **Three ordinary settings declared by `seo`**, on the generic Settings screen (A8 stands).
- **Two public endpoints in `seo`** tell the storefront a channel's policy and its two texts.
- **The storefront's middleware is the one seam** that puts the directive on responses: a
  response header on everything it serves, and a request header from which the root layout
  renders one extra robots tag. No route file is edited; the directive is only ever *added*.
- **`robots.txt` becomes a request-time handler**; the system-generated rules stay
  storefront-owned source code and are served unchanged in every state of the module.
- **An in-process, 60-second cache with an unbounded last-known value** meets the five-minute
  bound and FR-017 / FR-022 without cache tags, events or a new dependency.
- **The preview** is `seo`'s contribution to a new admin zone on the Settings row; the backend
  fetches the system rules from the channel's own storefront on demand and stores nothing.
- **Two changes serve every module**: multi-line text settings and setting names resolved from
  the owner module's bundle.

No new runtime dependency. One additive platform migration (a boolean column).

## Technical Context

**Language/Version**: TypeScript 5.x `strict`, Node.js ≥ 22.17, ESM
**Primary Dependencies**: Fastify, MikroORM (PostgreSQL), Zod (backend); React 19 + Vite + admin-kit zones (admin); Next.js 15 App Router middleware and route handlers (storefront) — **no new runtime dependency**
**Storage**: PostgreSQL — no new table; three rows in the existing `settings` store owned by `seo`, and one new boolean column `settings.multiline` owned by the platform
**Testing**: Vitest — unit tests beside their subjects in the packages, `backend/test/{contract,integration}/seo`, the storefront's SSR-only suite (`renderToString`, no jsdom) and its Playwright conformance run
**Target Platform**: Linux server; three separately deployable components (backend, admin, storefront), possibly on different hosts and at different versions
**Project Type**: web application — monorepo with `backend/`, `admin/`, `storefront/`, `packages/`
**Performance Goals**: no added backend round-trip on the document path beyond one cached read per channel per storefront process per minute; `robots.txt` and `llms.txt` served from process memory between refreshes
**Constraints**: a saved change in force within 5 minutes (designed: ≤ 2); no page answered with a failure because of this feature (FR-017); every storefront page stays server-rendered (Principle VII); behaviour with defaults identical to today (FR-011)
**Scale/Scope**: 3 settings, 3 backend routes, 2 storefront route handlers, 1 middleware change, 1 zone member, 2 zone components, 2 palette actions, 1 migration; 6 slices, about 13.5 developer-days

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design — same verdict.*

| Principle | Verdict | How the design meets it |
| --- | --- | --- |
| **I. Modular architecture (NN)** | Pass | `seo` owns its settings, routes, bundle keys, docs and tests. `settings` gains a zone *mount* and two generic capabilities and learns nothing about `robots.txt`. `seo` reaches `settings` only through ports it already resolves and the published `settingWriteValidatorRegistry` port. The storefront reaches `seo` only over HTTP. |
| **II. API-first** | Pass | Schemas for both storefront endpoints, the preview endpoint, the zone props and the `multiline` field are written in `packages/contracts/` first; every slice's first task is the contract and its test. All changes are additive; nothing is versioned. |
| **III. TDD (NN)** | Pass | Each slice below lists its failing tests before its implementation. Every FR is mapped to a test in § *Requirement → test*. |
| **IV. YAGNI, minimal dependencies** | Pass | No new dependency. No cache tag, event, subscriber, queue or stored copy. Option labels, a settings-label ratchet and a per-group settings route were each considered and not built. |
| **V. TypeScript everywhere** | Pass | Zod at both HTTP boundaries; the storefront validates the backend's answer against the contract schema and treats a mismatch as "unreadable". |
| **VI. Naming (NN)** | Pass | Routes kebab-case (`/storefront/seo/robots-policy`, `/crawler-files`); setting codes and the column snake_case; JSON camelCase. |
| **VII. SEO, performance** | Pass, with a named change | `robots.txt` leaves build time (FR-021) — the consequence the spec names. No page changes rendering mode: the root layout is already `force-dynamic`. The feature exists to make crawler signals correct. |
| **VIII. English (NN)** | Pass | Comments and `/docs/` in English; Polish only in bundles and the Polish docs tree. |
| **IX. UI reuse** | Pass | The preview is composed from existing admin-kit primitives inside an existing zone mechanism; the multi-line field is the row editor's existing `<textarea>` branch widened. No new primitive. |
| **X. Queue consumers** | N/A | Nothing asynchronous is added. |
| **XI. Tenant isolation (NN)** | Pass | No organization-scoped data is read or written; no new entity to classify. |
| **XII. Sales-channel scoping (NN)** | Pass | Every read resolves a concrete channel and never returns a cross-channel set; an unresolved channel is the system default, as for every storefront read. No `sales_channel_*` bridge is touched. Cross-channel tests are in slices 1, 3 and 5. |
| **XIII. Command Bus auditing (NN)** | Pass, inherited | The feature adds **no** write. Setting values are written through the existing settings write path, which audits through `AuditPort` rather than through `CommandBus.run`; that module is un-migrated and Principle XIII's bounded-migration clause covers it. Migrating settings writes to Commands is not this feature's to do and is not made harder by it. |
| **XIV. Entity-agnostic extensibility** | Pass | The zone member is generic (`settings.setting.after`, any setting, any contributor); `multiline` and bundle-resolved names are properties of settings, not of `seo`. |
| **XV. Untouched core, overlay** | Pass | An overlay module can declare multi-line settings, ship `settingLabels.*` keys and contribute to the zone on the same terms. No core file becomes deployment-specific. |
| **XVI. Command palette** | Pass, and one standing gap closed | `seo` declares two actions; today it declares none while owning `/seo`. See *Deviations* D2 for the permission. |
| **XVII. Operator-toggleable modules (NN)** | Pass | Routes are gated at the registration seam; zone contributions and palette actions vanish through the existing presence filters; the settings turn read-only through the settings API's existing `editable` flag; the storefront treats `MODULE_DISABLED` as "this feature does not exist". The off-state test is extended (research R8). See *Deviations* D3 for the one string that cannot be translated where it is shown. |

**Verdict: PASS.** No violation requires justification. Complexity Tracking records the things a
reviewer would otherwise ask about.

## Deviations from the spec, and reinterpretations

Nothing below changes the spec file; each is for the owner or the orchestrator to accept or send
back.

| # | Spec text | What the plan does | Why |
| --- | --- | --- | --- |
| **D1** | FR-012: every document "MUST carry *a* robots directive that is the combination" of the route declaration and the default | The response carries the page's own robots tag (unchanged), **plus** one extra robots tag and a response header for the channel default. The combination is their restrictive union, which is how search engines read multiple directives; no merged tag is computed | Next metadata replaces rather than merges, so a merged tag would mean editing every route file and changing what `check:storefront-indexability` reads. Adding without touching is also what makes FR-013 structural. *Depends on an inferred Next / React behaviour — see below.* |
| **D2** | FR-009: the palette entry "MUST NOT be offered to one who is not [allowed to change it]" | The entry is offered to holders of `settings:read`, who land on a read-only view with the previews | `check:action-route-permissions` requires the declared code to be the one sufficient for the target route's own gate, and `/settings` is gated by `settings:read`. FR-045 already gives readers the previews. |
| **D3** | FR-033: the activation control's description states the consequence "in English and in Polish" | The warning is added to the module `description` (English; this is what the platform modules screen shows beside the switch) and to the `seo.enabled` setting description (English and Polish, shown on the Settings screen) | The platform modules screen renders the manifest description verbatim and has no translation path for it. Adding one is a change to a kernel-served screen for every module. |
| **D4** | FR-008: "the label of each *Default robots* choice MUST be available in English and in Polish" | The four choices are the directive pairs themselves (`NOINDEX, FOLLOW` …), shown identically in both languages; their meaning is in the translated description | They are protocol tokens, not prose, and are what Magento shows. Translatable option labels would be a third generic Settings change with one user. |
| **D5** | FR-040: the preview shows "that channel's own sitemap line" | It shows the sitemap line the channel's storefront serves, which comes from that storefront deployment's configured public address | That is the line as built today (`absoluteUrl('/sitemap.xml')`); it is per storefront deployment, not per channel. Two channels behind one storefront deployment share it. The preview shows the truth. |
| **D6** | Key Entities: "No new kind of stored record is expected … for the plan to confirm" | Confirmed, with one schema change: a boolean column `settings.multiline` on a platform table | FR-004 for every module rather than for `seo` alone (research R5). |
| **D7** | A12: "the five-minute bound … the plan may tighten it" | Tightened to a designed worst case of two minutes (60 s in process + 60 s `max-age`) | Research R3. |
| **D8** | FR-022 / FR-017 "the last value it knew" | Known **per storefront process, in memory** | A shared or persisted last-known value needs Redis in the storefront or its own invalidation; the spec's residual-risk paragraph already describes the cold-start window this leaves. |
| **D9** | FR-014 "files shipped with the storefront" | Also covers `/_next/image`; exempts only `/_next/static` | The exemption FR-014 permits, taken exactly. |

## Decisions for the owner

1. **D2** — accept that the palette entry is visible to administrators who may read settings but
   not change them. *Recommended: accept.*
2. **D3** — accept an English-only warning on the platform modules screen for now, or ask for
   module descriptions to be translatable there (a separate, platform-wide change).
   *Recommended: accept for this feature; file the platform change separately.*
3. **D4** — accept untranslated directive tokens as the dropdown's choices. *Recommended: accept.*
4. **An upgraded backend with an un-upgraded storefront** silently ignores *Default robots*
   (research R11). The preview reports `storefront-outdated`, but only on the two text settings'
   rows. Should the *Default robots* row carry the same notice (one more zone contribution, in
   slice 4), so an operator of an older instance cannot believe a shop is de-indexed when it is
   not? *Recommended: yes — it is the motivating failure in reverse, and costs a few lines once
   the preview endpoint exists.*
5. **A15** (the `llms.txt` preview) was the plan's suggestion rather than the owner's request;
   slice 5 carries it. Dropping it removes about half a day.

## Inferred, to be proven by the first test of the slice

Nothing in this plan was run against a built tree. These four are assumptions about Next.js and
React, and each has a designed fallback so that a refutation changes a file, not the design.

| # | Assumption | Proved by | If refuted |
| --- | --- | --- | --- |
| I1 | A `<meta name="robots">` rendered by the root layout outside the metadata API reaches `<head>` and is not removed by a page's own `robots` metadata | slice 1's conformance assertion on served HTML for `/cart` and `/` | Render it from a small server component placed in the layout's `<head>`; the header alone already satisfies FR-013 and indexing control |
| I2 | Module-level state in the middleware persists across requests in the standalone server (as `backend-reachability.ts` already relies on) | slice 1's middleware unit test plus a two-request conformance check | Fall back to a 60 s `fetch` cache in the middleware and keep last-known in the layout's runtime |
| I3 | Widening the middleware matcher to public files and `/_next/image` costs no measurable latency when the function returns early | slice 1 measures `curl` timings on a public file before and after, and records how | Narrow the matcher to an explicit list of indexable extensions |
| I4 | The admin bundle's scope for a module's own keys is the module id | slice 2a's first resolver test | Scan scopes for the key, as `permission-label.ts` does |

## Requirement → test

| FR | Test (the file is new unless it says "extend") |
| --- | --- |
| FR-001 – FR-003, FR-005 | `packages/modules/seo/src/manifest.test.ts` (declares the three settings, closed list, defaults); extend `backend/test/integration/seo/` with a per-channel resolution case |
| FR-004 | `packages/contracts` unit test for the `multiline` refinement; settings row-editor render test; reconciler unit test |
| FR-006 | `packages/modules/seo/src/backend/services/crawler-text-validator.test.ts`; contract test for the `400` |
| FR-007 | extend `backend/test/integration/seo/`: a write by an admin without `settings:write` is refused; an audit entry exists with before/after |
| FR-008 | settings label resolver unit test; extend `registered-bundles-shape.test.ts` coverage through `seo`'s bundle; `check:bundle-pairing` |
| FR-009 | extend `batch-eight-palette-off-state.test.ts`; `check:action-route-permissions` |
| FR-010, FR-021 | storefront `crawler-policy.test.ts` with a fake clock: fresh, stale-refetch, bound |
| FR-011, FR-019 | storefront fixture test: rendered system rules equal the pre-feature `MetadataRoute` output; conformance capture with defaults |
| FR-012 – FR-014 | storefront `robots-directive.test.ts` (policy → header / tag, total over the four values); middleware test for document and non-document paths; conformance on `/`, `/cart`, `/sitemap.xml`, a public file |
| FR-015, FR-016 | storefront test: `robots.txt` handler and `sitemap` are independent of the policy; conformance |
| FR-017, FR-022 | storefront `crawler-policy.test.ts`: unreadable with and without a last-known value, for both callers |
| FR-018, FR-020, FR-023 | `composeCrawlerFile` unit tests in `packages/contracts`; storefront handler tests; cross-channel integration test on the backend endpoint |
| FR-024 – FR-029 | storefront `llms-txt.test.ts`; `reserved-segments` test; extend `backend/test/contract/cms/admin-reserved-slug-segments.contract.test.ts` |
| FR-030 – FR-034 | extend `backend/test/integration/seo/off-state.test.ts`; storefront classification tests (`MODULE_DISABLED`, `404`) |
| FR-035, FR-036 | `check:storefront-indexability` unchanged and green; storefront test that the root layout declares no `robots` metadata; `git diff --stat` shows no `page.tsx` touched |
| FR-037 | `check:module-docs`, `check:docs-translations`, `build:docs` |
| FR-038 – FR-045 | `seo` preview service unit tests over the five states; contract test for the endpoint; zone component render tests; `check:admin-zones` |

## Slices

Each slice is one pull request, releasable on its own, with its own changeset. Sizes are
developer-days for one implementer including tests and docs, and are estimates, not measurements.
**TDD order inside every slice: contract schema and its test → failing backend tests → backend →
failing storefront / admin tests → implementation → docs → generated artefacts → changeset.**

### Slice 1 — Default robots (User Story 1, the off state for it) · **≈ 3.5 days** · no dependency

*Alone, this takes both demo instances out of search.*

1. Contracts: `storefrontRobotsPolicySchema` and response schema; test.
2. Failing tests: `seo` manifest test; backend contract + integration tests for
   `GET /api/v1/storefront/seo/robots-policy` (four values, per channel, cross-channel, default
   channel when none named); off-state extension; palette test updated from `actions: []`.
3. `seo`: the `seo.default_robots` setting, the token → `{ index, follow }` mapping, the route,
   both palette actions with their bundle keys, the FR-033 strings.
4. Failing storefront tests: reader classification, freshness and last-known; directive function;
   middleware on document and non-document paths; layout declares no `robots` metadata.
5. Storefront: `lib/seo/crawler-policy.ts`, `lib/seo/robots-directive.ts`, `middleware.ts`
   (resolve, header, request header, widened matcher with the early branch), `app/layout.tsx`
   (the extra tag). Conformance scenarios; the I3 timing recorded in the pull request.
6. Docs: `packages/modules/seo/docs/seo.md` (and its stale route table), both Polish files;
   `composer:generate`.
7. Changeset `minor`: "`seo` gains a per-channel default robots setting and
   `GET /api/v1/storefront/seo/robots-policy`; the reference storefront sends `X-Robots-Tag`".

Until slice 2a lands, the new setting's name and description are English-only on the Settings
screen; FR-008 is met for it by slice 2a, which ships its Polish keys.

### Slice 2a — Setting names from the owner's bundle · **≈ 1 day** · no dependency

Resolver beside the row editor, three call sites, tests (including I4); `seo`'s keys for
`seo.enabled` and `seo.default_robots` in both languages. Changeset `minor` for
`@endora-commerce/mod-settings`: "a setting's name and description resolve from
`settingLabels.<code>.*` in its owner's bundle".

### Slice 2b — Multi-line text settings · **≈ 1.5 days** · no dependency

Contracts (`multiline` on the manifest entry and the DTO, the refinement) and tests → platform
migration (`migration:new -- --module core`, `composer:generate`, the registry committed) →
entity, reconciler, `serializeSetting` → row editor. Changeset `minor`: "`multiline: true` on a
`string` setting renders a multi-line field". *Touches a platform migration: review by a second
agent before it is called ready.*

### Slice 3 — Custom `robots.txt` instructions (User Story 2 without the preview) · **≈ 2.5 days** · needs 2b (and 1 for the shared reader)

1. Contracts: `storefrontCrawlerFilesSchema`, `composeCrawlerFile` and its tests.
2. Failing backend tests: endpoint contract and cross-channel integration; validator; off state.
3. `seo`: `seo.robots_txt_custom`, the `crawler-files` route, the write validator and its
   contribution boot hook (a `BOOT_HOOKS_WITHOUT_PRESENCE` ledger entry saying why it does not
   probe), the `settings` lifecycle edge if `check:port-dependencies` asks for one, bundle keys.
4. Failing storefront tests: system-rules fixture equivalence; handler for empty, custom,
   `?part=system`, unreadable-with-last-known, unreadable-without (`503`); reserved segments.
5. Storefront: `lib/seo/robots-system-rules.ts`, `app/robots.txt/route.ts`, **delete**
   `app/robots.ts`, rewrite `test/seo/route-declarations.test.ts`, `reserved-segments.ts`.
6. Docs; changeset `minor`.

### Slice 4 — The preview (FR-038 – FR-043, FR-045) · **≈ 3 days** · needs 3

1. Contracts: the zone member and its props; the preview query and response schemas; tests.
2. `settings`: mount `<AdminZone name="settings.setting.after">` in the row editor (not for
   secrets); row-editor test; `check:admin-zones`.
3. Failing `seo` tests: preview service over the five states with a stubbed `fetch`; endpoint
   contract; off state.
4. `seo` backend: extract the storefront-address resolution the sitemap service already has into
   one shared service (the sitemap keeps using it), the preview service, the route.
5. `seo` admin: the robots zone component; render tests for every row of
   `contracts/admin-surfaces.md` §4. If the owner accepts decision 4, the outdated-storefront
   notice on the *Default robots* row.
6. Docs; changeset `minor`.

### Slice 5 — `llms.txt` (User Story 3, FR-044) · **≈ 2 days** · needs 3; its preview needs 4

`seo.llms_txt_additional`; storefront `app/llms.txt/route.ts` with the generated base,
`?part=base`, the `404` rules; reserved segment; the second zone component; docs; changeset
`minor`. Without the preview (decision 5): about 1.5 days.

**Total ≈ 13.5 days.** Slices 1, 2a and 2b can be built in parallel by different implementers;
3 → 4 → 5 are a chain. Slice 1 is the only one the demos need.

## Project Structure

### Documentation (this feature)

```text
specs/144-seo-search-engine-robots/
├── spec.md
├── plan.md              # this file
├── research.md          # R1 – R12, decisions with evidence and rejected alternatives
├── data-model.md        # three settings, one column, no new entity
├── quickstart.md        # how to verify each slice by hand, and the checks to run
├── contracts/
│   ├── crawler-policy.md    # backend → storefront, and what the storefront serves
│   └── admin-surfaces.md    # settings, the Settings-screen changes, the preview, the palette
├── checklists/requirements.md
└── tasks.md             # /speckit.tasks — not created by this plan
```

### Source Code (repository root)

```text
packages/contracts/src/
├── seo.ts                         # + robots-policy, crawler-files, preview schemas, composeCrawlerFile
├── settings.ts                    # + multiline on the manifest entry and the DTO
└── admin-contributions.ts         # + zone member settings.setting.after and its props

packages/platform/src/
├── kernel/settings/setting.entity.ts          # + multiline
├── kernel/settings/manifest-reconciler.ts     # keeps multiline in step
└── migrations/<timestamp>_core_settings_multiline.ts   # scaffolded, never numbered by hand

packages/modules/settings/src/
├── backend/routes.admin.ts                    # serializeSetting: + multiline
└── admin/components/
    ├── SettingRowEditor.tsx                   # multi-line field, label resolution, zone mount
    └── setting-label.ts (+ .test.ts)          # the resolver, after permission-label.ts

packages/modules/seo/
├── src/manifest.ts                            # 3 settings, 2 actions, FR-033 strings
├── src/backend/
│   ├── routes.ts                              # 2 storefront routes, 1 admin preview route
│   ├── index.ts                               # services, validator contribution hook
│   └── services/
│       ├── robots-policy.ts (+ .test.ts)                  # token ↔ { index, follow }
│       ├── crawler-files.service.ts (+ .test.ts)
│       ├── crawler-text-validator.ts (+ .test.ts)
│       ├── storefront-address.service.ts (+ .test.ts)     # extracted from the sitemap service
│       └── crawler-file-preview.service.ts (+ .test.ts)
├── src/admin/
│   ├── index.ts                               # + zones
│   └── zones/{RobotsTxtPreview,LlmsTxtPreview}.tsx (+ tests)
├── i18n/{en,pl}.json
└── docs/seo.md

storefront/
├── middleware.ts                              # policy, X-Robots-Tag, x-robots-default, matcher
├── app/layout.tsx                             # the extra robots tag
├── app/robots.ts                              # DELETED
├── app/robots.txt/route.ts                    # new
├── app/llms.txt/route.ts                      # new
├── app/reserved-segments.ts                   # + robots.txt, llms.txt
├── lib/seo/robots-system-rules.ts             # the list, moved unchanged
├── lib/seo/crawler-policy.ts                  # reader, freshness, last-known
├── lib/seo/robots-directive.ts                # policy → header / tag content
└── test/seo/…                                 # route-declarations rewritten; new tests

backend/test/
├── contract/seo/                              # new: the three routes
├── integration/seo/off-state.test.ts          # extended
└── integration/_admin_surfaces/batch-eight-palette-off-state.test.ts   # seo: [] → two actions

docs/i18n/pl/docusaurus-plugin-content-docs/current/{modules,module-reference}/seo.md
.changeset/<one per slice>.md
```

**Structure Decision**: no new module, package or application. `seo` is extended because the
owner placed the feature there and because it already owns the storefront-address resolution the
preview needs. The two generic changes live where their subject lives — the settings contract,
the platform's settings entity, the `settings` module's screen.

**Generated artefacts** owed by the slices that touch a manifest, a migration or a docs page:
`pnpm --filter backend run composer:generate` (manifest index, migration registry, docs
artefacts), committed in the same pull request. `manifests:generate` and
`pnpm install --lockfile-only` only if a package manifest changes — none is expected to, since no
dependency is added.

## The reference storefront and its copies

Every storefront file in the tree above is copied into client instances at scaffold time and
into the paid repository's demo storefront. Research R11 lists what an instance scaffolded
earlier has to change (nine rows, one of them a deletion) and what happens if it does not: the
backend half works, the storefront ignores *Default robots*, and only the preview says so. The
paid repository's copy needs the same files before `demo-pro` can use the feature; that
repository is not touched by this plan.

## Complexity Tracking

No Constitution violation is being justified. Recorded because each is a thing the default answer
would have been "no" to:

| Item | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| **No new runtime dependency** | — | — (the default, kept: fetch, Zod, React and Next cover everything) |
| A platform migration (`settings.multiline`) for a feature owned by `seo` | FR-004 requires multi-line editing on the generic Settings screen, and manifest-driven presentation facts are columns on that row (`enum_options`, `hidden`) | A `seo`-only editor makes multi-line text a special case; a new value type costs a native-enum migration and a case in every switch; deriving from manifests at read time is a second source for one DTO (research R5) |
| A new member of the closed admin-zone enum | The preview must sit beside a setting the `settings` module renders, without `settings` knowing what it previews, and must vanish with `seo` | Hard-coding a `seo` preview in the row editor repeats the `SELLER_COMPANY_DATA_CODE` shape; `seo`'s own screen departs from A8 and reimplements per-channel editing (research R1) |
| The middleware now runs for public files and `/_next/image` | FR-014: those are the non-document responses a search engine can index, and no other seam can add a per-channel header to a static file | `next.config.js` headers are build-time; route handlers cannot cover `public/` or a `MetadataRoute` sitemap (research R4). Bounded by an early return and measured in slice 1 (I3) |
| Replacing `app/robots.ts` with a route handler | Operator text must be served verbatim and the file must be able to answer `503` | `MetadataRoute.Robots` is structured and cannot do either (research R9) |
| A backend → storefront request for the preview | FR-041: one statement of the system rules, owned by the storefront, shown without being copied | A copy in the backend or the admin goes stale across versions; a browser fetch needs CORS and the storefront's address in the admin (research R2) |

## Handoff summary for `endora-commerce-dev`

- Build **slice 1 first and alone**; it is the whole value for the demos and has no dependency.
- Start every slice from `contracts/` and from the failing tests listed in it. The four inferred
  behaviours (I1 – I4) are each a *first* test: if one is refuted, apply its fallback and say so.
- Do not edit any `page.tsx`. If a design step seems to require it, stop — that is the signal the
  single-seam assumption (I1) failed.
- Do not put `robots` into the root layout's `metadata` export.
- `storefront/app/robots.ts` is **deleted** in slice 3: grep `backend/test/**` and
  `storefront/test/**` first; one importer is known.
- Slice 2b carries a platform migration: scaffold it with `migration:new -- --module core`, run
  `composer:generate`, commit the registry, and have a second agent review before "ready".
- Every slice needs a `minor` changeset, including the storefront-only parts, because the CLI
  package publishes the reference storefront. Run
  `pnpm --filter backend run check:release-intent -- --since origin/master`, not the bare form.
- Measurements quoted in `research.md` are premises with the command beside them — re-derive any
  you rely on; the tree moves.
- `quickstart.md` ends with the checks to run; `test:unit:fast` alone is not evidence here.
