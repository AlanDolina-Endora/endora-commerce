---
description: "Task list for 152 — document templates: comparison PDF template, invoice templates moved"
---

# Tasks: Document templates — comparison PDF template, invoice templates moved

**Input**: `specs/152-compare-pdf-template/` — plan.md, spec.md, research.md, data-model.md,
contracts/ (`document-type-registry.md`, `document-templates-api.md`, `comparison-document.md`,
`invoice-document.md`, `admin-ui.md`), quickstart.md
**Tests**: REQUIRED — Constitution III. Every implementation task follows the failing test it turns
green; a test task names the behaviour it must prove **red** first.

**Organization**: by user story. MVP = US1 + US2 (comparison). US5 (invoices) is required before
merge — the owner put it in this feature — and its golden capture (T009) is a Phase 2 task so that it
runs **before any invoice file changes**.

## Format: `[ID] [P?] [Story] Description`

Paths: `DT` = `packages/modules/document_templates`, `CMP` = `packages/modules/comparisons`,
`INV` = `packages/modules/invoices`, `CT` = `packages/contracts/src`.

---

## Phase 1: Setup

- [ ] T001 Scaffold `DT/` after `packages/modules/admin_search/` (tsconfigs, vitest.config.ts, tailwind.css, README.md, CHANGELOG.md, LICENSE, `endora: { type: 'module', id: 'document_templates' }`); `package.json` body rendered by `pnpm --filter backend run manifests:generate`
- [ ] T002 Skeleton `DT/src/manifest.ts` (id, name, version, `dependencies: ['settings','auth','assets_library']`, settings group + `document_templates.enabled`, `activation`, `i18n`, `docs`) and empty `registerModule` in `DT/src/backend/index.ts`; run `composer:generate`, `manifests:generate`, `pnpm install --lockfile-only`; commit artefacts
- [ ] T003 [P] `DT/i18n/{en,pl}.json` (flat) and stub `DT/docs/document-templates.md`

---

## Phase 2: Foundational

### Contracts

- [ ] T004 [P] Write `CT/document-templates.test.ts`: type-code regex; content schema (`schemaVersion`, language keys, 1–10 languages, ≤ 200 nodes, `blockNameRe`, unknown names accepted, string ≤ 5 000, ≤ 20 core images, 512 KiB, no `zones`); `documentRootPropsSchema` ranges; merge-field key regex; `selection` enum; `coreBlocks` values; `LegacyTemplateRecord`; every DTO of `contracts/document-templates-api.md` — red
- [ ] T005 Implement `CT/document-templates.ts` (schemas, `DocumentTypeRegistration` with `blocks()`, `coreBlocks`, `selection`, `languages`, `pageDefaults`, `prepareRender`, `renderBuiltIn`, `legacyImport`; `DocumentBlockRenderer`; ports; result incl. `source`/`requestedTemplateMissing`; DTOs), export from `CT/index.ts`, add the six `DOCUMENT_*` codes to `CT/errors.ts` — T004 green
- [ ] T006 Widen `pageBuilderContextSchema` (`CT/cms.ts`) and `AdminBlockContributionSchema.context` (`CT/admin-contributions.ts`) with `'document'` (tests first); fix every exhaustive consumer `pnpm -r run typecheck` reports; assert in `cms`' `page-builder-registry` test that `document` blocks never reach the CMS palette
- [ ] T007 [P] Failing cases, then `comparisonDocumentDataSchema` in `CT/comparisons.ts` and `InvoiceDocumentData` in `CT/invoices.ts`
- [ ] T008 [P] `packages/page-builder-core/src/contributions/document-sample.test.tsx`, then `document-sample.tsx` (`DocumentSampleProvider`, `useDocumentSample`) and `DocumentBlockEditorConfig`; export on `./contributions`; `packages/admin-kit/src/zones/use-block-contributions.ts` accepts `'document'`

### Invoice parity baseline — before any invoice change

- [ ] T009 [P] Write `INV/src/backend/document/capture-goldens.test.ts` that, **against today's unmodified `InvoicePdfRenderer`**, builds the pdfmake document definitions of the ten-case matrix in `contracts/invoice-document.md` §5 and writes them to `INV/src/backend/document/__golden__/*.json` when `UPDATE_GOLDENS=1`, otherwise asserts equality; run once with the flag, commit the goldens, and keep the test (green on today's code). No other file under `INV/` may change in the commit that adds the goldens

### Schema

- [ ] T010 Write `backend/test/integration/document_templates/schema.test.ts`: second default in one scope refused (global, same channel), accepted for another channel; any number of non-defaults; type-code check; channel delete cascades; import marker PK refuses a duplicate — red
- [ ] T011 Scaffold `migration:new -- --module document_templates --name init`, DDL per `data-model.md` §1–§2; entities `document-template.entity.ts`, `document-template-import.entity.ts` (`@GlobalEntity()`), `entities` export; `composer:generate` — T010 green; tenant classification check passes

### Core services

- [ ] T012 [P] `DT/src/backend/registry/document-type-registry.test.ts` — every registration refusal and per-call block refusal of `document-type-registry.md` §3; presence filter of types and of single blocks both ways — red
- [ ] T013 Implement the registry; plain `ctx.di.register` over `effectiveState.isPresent` — T012 green
- [ ] T014 [P] `DT/src/backend/rendering/merge-fields.test.ts` — red
- [ ] T015 Implement `merge-fields.ts` — T014 green
- [ ] T016 [P] `DT/src/backend/rendering/embed-asset-images.test.ts` (PNG/JPEG inlined, others omitted, missing omitted, never throws, never fetches a URL) — red
- [ ] T017 Implement `embed-asset-images.ts` over `assetReadPort.openAssetBytes` — T016 green
- [ ] T018 [P] `DT/src/backend/rendering/core-blocks.test.ts` (six blocks, default and hostile props) — red
- [ ] T019 Implement `core-blocks.ts` — T018 green
- [ ] T020 `DT/src/backend/services/template-resolver.test.ts`: channel default → global default → `defaultContent()` → `renderBuiltIn`; non-default templates never chosen implicitly; nothing-renderable fall-through; channel-B never for A; null channel never matches a channel row; explicit `templateId`: `default_only` → `DOCUMENT_TEMPLATE_NOT_SELECTABLE`, other type/channel → refused, missing → default with `requestedTemplateMissing`; language chain; single read — red
- [ ] T021 Implement `template-resolver.ts` — T020 green
- [ ] T022 `DT/src/backend/rendering/document-renderer.test.ts` (definitions, not bytes): palette restriction (a block outside the type's palette is skipped), absent-owner skip with props untouched, `prepareRender` result reaches every block, `renderBuiltIn` used last, `pageDefaults` (margins, styles) under stored root props, `auto` orientation, header/footer + page numbers, throw → `DocumentRenderError`, `ModuleDisabledError` re-thrown, URL policy deny-all, byte smoke render — red
- [ ] T023 Implement `document-renderer.ts`; `ctx.di.providePort('documentRenderPort', …)` — T022 green
- [ ] T024 `DT/src/backend/commands/document-template-commands.test.ts`: seven Commands, one audit row each with digest state, none on refusal (version conflict, unavailable type, invalid content, block not offered by the type, language outside `languages`, default delete without confirm, source of another type, unknown channel); `set_default` clears the previous default in one tx; scope immutable — red
- [ ] T025 Implement `document-template-commands.ts` and `document-template-service.ts` (no audit-writer call; channel validation via `salesChannelResolutionPort`) — T024 green; `check:command-coverage` clean
- [ ] T026 `DT/src/backend/services/legacy-import.test.ts`: marker-first transaction; ids preserved; `on conflict (id) do nothing`; unknown-channel rows skipped and reported; oversize rows imported and flagged; `afterImport` throw rolls back marker and rows; second call no-op (process cache and marker); deleted template not resurrected; system actor in the single audit row; boot work hook probes own presence; lazy `ensureImported` before reads/renders — red
- [ ] T027 Implement `legacy-import.ts` and the boot work hook in `DT/src/backend/index.ts` (`enterSystemScope` at boot, `withSystemScope` lazily) — T026 green; `check:entry-presence` clean
- [ ] T028 [P] `DT/src/backend/services/builder-descriptor.test.ts`: components = the type's palette exactly (core blocks per `coreBlocks`; type blocks with label/fields from any present manifest declaration by name, else `describe()`), categories folded per `specs/096…/contracts/block-definition.md` §1.1, `rootFields` with type defaults — red
- [ ] T029 Implement `builder-descriptor.ts` — T028 green

**Checkpoint**: the engine renders fixture types in unit tests; imports work against a fixture reader; goldens committed.

---

## Phase 3: US1 — design the comparison PDF and have downloads follow it (P1) — MVP

- [ ] T030 [P] [US1] `backend/test/contract/document_templates/admin-api.test.ts` for routes 1–12 (shapes, 401/403 before validation, `types` vs `/:id`, preview writes nothing, error table, FR-019 refusal) — red
- [ ] T031 [US1] Implement `DT/src/backend/routes.admin.ts`; complete `DT/src/manifest.ts` (permissions, six core `blocks` + category, `errorCodes`) and bundles — T030 green; `backend/test/contract/admin_users/permission-inventory.test.ts` green
- [ ] T032 [P] [US1] `CMP/src/backend/document/blocks/{header,table,share-link}.test.ts` per `comparison-document.md` §3 — red
- [ ] T033 [US1] Extract helpers to `CMP/src/backend/services/comparison-pdf-shared.ts` without changing the fixed renderer's output (its two test files stay green unmodified); implement the three blocks — T032 green
- [ ] T034 [P] [US1] `backend/test/contract/comparisons/pdf-template-export.test.ts`: no template → built-in; global default → used; a non-default template is ignored; `hideEmptyRows`; headers unchanged; empty → 409; **cross-organisation** (A never gets B's prices or B-restricted products through the template path) — red
- [ ] T035 [US1] `CMP/src/backend/document/{comparison-document-data,sample-comparison,built-in-layout (en-US),comparison-document-type}.ts` with tests (`coreBlocks: 'all'`, `selection: 'default_only'`, palette = 3 + 6)
- [ ] T036 [US1] Wire `comparisons`: contribution-only `ctx.onBoot` registration; `/me/pdf` per `comparison-document.md` §4 (presence probe; `rethrowIfModuleDisabled` first in the `catch`); manifest `blocks`, `blockCategories`, `nonBindingDependencies`; bundles — T034 green; `check:port-dependencies`, `check:port-catches`, `check:block-names` clean
- [ ] T037 [P] [US1] `admin/test/modules/document_templates/{DocumentTemplatesPage,DocumentTemplateEditor}.test.tsx` per `admin-ui.md` §7 (comparison palette = 3 + 6, no invoice block; default badge; set-default; preview; stand-in keeps props) — `<StrictMode>`, `axe-core` — red
- [ ] T038 [US1] Implement `DT/src/admin/` (index, client, both pages, `NewTemplateDialog`, `core-block-editors`) — T037 green; `i18n:hardcoded` adds nothing
- [ ] T039 [P] [US1] `CMP/src/admin/document-blocks/*.test.tsx` and `admin/test/modules/comparisons/pdf-template-link.test.tsx` — red
- [ ] T040 [US1] Implement the three comparison editor configs, `blocks` contributions in `CMP/src/admin/index.ts`, the *PDF template* button — T039 green
- [ ] T041 [P] [US1] `storefront/test/lib/comparisons-export.test.ts` (`?hideEmptyRows=`) — red
- [ ] T042 [US1] `storefront/lib/api/comparisons.ts`, `components/ComparisonTable.tsx` pass the switch — T041 green

---

## Phase 4: US2 — the comparison PDF speaks the buyer's language (P1) — MVP

- [ ] T043 [P] [US2] Extend block and built-in tests: `pl-PL` names, `Intl` date/money, built-in `pl-PL` tree valid with no English platform text (SC-004) — red
- [ ] T044 [US2] `pl-PL` tree (one per-language map), language-aware formatting, Polish sample names — T043 green; `check:default-language-prose` clean
- [ ] T045 [P] [US2] Extend `pdf-template-export.test.ts`: `Accept-Language: pl-PL` → Polish tree + `content-language`; English-only template → English tree with Polish names; unknown header → channel default; fixed path unchanged — red
- [ ] T046 [US2] Language resolution in `CMP/src/backend/routes.public.ts` — T045 green
- [ ] T047 [P] [US2] Editor language tests (switcher from route 2 `languages` or `/api/v1/i18n/config`; copy flow; hidden for single-language types) and storefront `Accept-Language` test — red
- [ ] T048 [US2] `DT/src/admin/components/LanguageSwitcher.tsx` + copy flow; storefront passes `locale` from `app/compare/page.tsx`; button strings to `storefront/lib/i18n/messages.ts` (en + pl) — T047 green

**Checkpoint (MVP)**: quickstart §1–§5.

---

## Phase 5: US3 — a different layout for one sales channel (P2)

- [ ] T049 [P] [US3] `backend/test/integration/document_templates/tenancy-channel.test.ts`: global + channel-B defaults; A gets global, never B; only B default → A gets built-in; unresolved channel never selects a channel template; explicit `templateId` of channel B refused for an A document (fixture `per_document` type) — red, proven by mutating the resolver
- [ ] T050 [US3] Scope select and per-scope grouping in `NewTemplateDialog.tsx` / list (`?salesChannelId=`, `applicableToChannel`) with admin cases — T049 + admin cases green

---

## Phase 6: US4 — manage templates safely (P2)

- [ ] T051 [P] [US4] `backend/test/integration/document_templates/default-race.test.ts` (concurrent `set-default` → one default; a document rendered during a save uses one version) and admin cases: duplicate same/other scope, set/clear default, delete default with confirmation, version-conflict *Reload*, read-only mode — red
- [ ] T052 [US4] Row actions, dialogs, conflict dialog, read-only mode — T051 green
- [ ] T053 [P] [US4] `DT/src/admin/components/MergeFieldsPanel.test.tsx` (hidden when the type has none) — red
- [ ] T054 [US4] `MergeFieldsPanel.tsx` — T053 green

---

## Phase 7: US5 — invoice templates live in Document templates, unchanged (P2) — required before merge

- [ ] T055 [US5] Write `INV/src/backend/document/invoice-document-type.test.ts` (palette = ten own + present contributed, `coreBlocks: 'none'`, `selection: 'default_only'`, `languages: ['pl-PL']`, `pageDefaults` per `invoice-document.md` §1, `prepareRender` resolves only placed contributors with rejection → `null`, `suppressKsefNumber` rule) and switch `capture-goldens.test.ts` (T009) to compare the **engine's** output for cases 1–9 against the committed goldens; golden 10 stays as the record of the old e-mail behaviour and is no longer asserted against the new code (N1, FR-093) — red
- [ ] T056 [US5] Implement `INV/src/backend/document/{block-renderers,invoice-document-type}.ts` wrapping `sections.ts`, `tree-mapper.ts` mappers, `embed-logo-images.ts` and `builtinLayout` unchanged; push the registration from a contribution-only `ctx.onBoot` — T055 green (deep-equal to every golden)
- [ ] T057 [P] [US5] `backend/test/integration/invoices/template-import.test.ts` per `invoice-document.md` §6 (legacy rows seeded by SQL in the test) — red
- [ ] T058 [US5] `INV/src/backend/document/legacy-import.ts` (`read()` over its own `InvoiceTemplate`; `afterImport()` role grants via `lazyPort<AdminRolePort>(ctx, 'adminRolePort')`); manifest `dependencies` += `document_templates`, `admin_roles` — T057 green; `check:port-dependencies`, `check:module-boundary` clean
- [ ] T059 [P] [US5] Rewrite `backend/test/integration/invoices/templates.test.ts` against the new API (create/save/set-default/preview of `invoices.invoice`), add `backend/test/integration/invoices/template-parity.test.ts` (admin download, customer download and regenerate over the real composition equal the goldens' definitions through a capture seam), and a channel case (an invoice of channel B uses B's default, of A the global) — red
- [ ] T059a [P] [US5] FR-093 (owner's answer to N1): `INV/src/backend/services/invoice-email-dispatch.test.ts` — the attachment is rendered by `documentRenderPort.render` with exactly the download's input (`documentType`, the invoice's `salesChannelId`, `pl-PL`, `{ invoice, amountLocale: 'pl' }`), a render failure stays contained (`failed`, issuance not undone) while `ModuleDisabledError` is re-thrown; and in `template-parity.test.ts` the e-mail attachment's definition deep-equals the download's for the seed tree, a channel-B default and the empty-tree fallback — red
- [ ] T060 [US5] Re-point `routes.admin.ts` (download, regenerate), `routes.customer.ts` **and the e-mail attachment in `invoice-email-dispatch.ts`** to `documentRenderPort` per `invoice-document.md` §2 (N1) — T059 and T059a green; delete `invoice-template-service.ts`, `ensureGenericSeed` call in `plugin.ts`, `pdf-components/descriptor.ts`, the five `/api/v1/admin/invoice-templates*` routes; move descriptor fields into manifest block declarations; drop the `invoice-templates` action; relabel `invoices:write` — T059 green
- [ ] T061 [US5] Update every test and fixture naming removed things, found by `git grep` over `backend/test/**`, `admin/test/**`, `packages/**`: `invoices/off-state.test.ts`, `invoices/stored-contributed-block.test.ts` (now through the facility; KSeF-absent behaviour unchanged), `_admin_surfaces/batch-twelve-palette-off-state.test.ts` (action removed), `issue-route-email-outcome.test.ts`, `vendor-number-hold.test.ts`, `backend/test/fixtures/openapi-baseline.json` (five routes removed, twelve added); add `document_templates.content` to `packages/modules/cms/src/backend/cli/block-names.ts` with its test case
- [ ] T062 [P] [US5] `admin/test/modules/invoices/`: redirects (`/invoices/templates` → `/document-templates?type=invoices.invoice`, `/invoices/templates/:id` → `/document-templates/:id`), *Templates* tab target, invoice editor palette (10 + contributed stand-in, no core blocks, no language switcher, no merge fields), canvas renderers read the served sample — red
- [ ] T063 [US5] Move `INV/src/admin/templates/invoice-puck-config.tsx` renderers into `INV/src/admin/document-blocks/*.tsx` contributions (context `document`, `useDocumentSample`, field overrides incl. logo URL/asset); redirect routes and tab in `INV/src/admin/{index.ts,components/InvoiceSectionTabs.tsx}`; delete `InvoiceTemplatesPage.tsx`, `InvoiceTemplateEditor.tsx`, `described-blocks.tsx`, `invoice-builder-plugin.tsx`; move field labels into `INV/i18n/{en,pl}.json`; remove `invoiceTemplates.*` and `appShell.nav.invoiceTemplates` from `packages/modules/_i18n/i18n/{en,pl}.json` (and their ratchet entries) — T062 green; `admin/test/modules/invoices/InvoiceSectionTabs.test.tsx` updated

---

## Phase 8: US6 — next document type with per-document selection (P3)

- [ ] T064 [P] [US6] `backend/test/fixtures/document-types/fixture-document-type.ts` (test-only `fixture_docs.note`, `selection: 'per_document'`, one block, `coreBlocks: ['document_templates.Text']`) wired into `backend/test/test-server.ts` only; `backend/test/contract/document_templates/second-type.test.ts`: listed, palette = 1 + Text, explicit template used, missing explicit → default + flag, off → hidden and rows kept — red
- [ ] T065 [US6] Make T064 green **without editing any file under `DT/`** (SC-007); a needed change is a contract defect — record it in research.md first

---

## Phase 9: Polish & cross-cutting

- [ ] T066 [P] `backend/test/contract/document_templates/off-state.test.ts`: facility deactivated (with invoices off) → 12 routes 503, nav/palette/links absent, comparison export via the fixed renderer, rows untouched, restore; **with invoices on → the deactivation is refused** naming `invoices` (N2 default); comparisons off and invoices off → type hidden, rows kept, restore; invoices off at first boot → import deferred, completes on first read after switch-on — red, then green (T067)
- [ ] T067 Fix whatever T066 finds (expected: nothing beyond earlier tasks)
- [ ] T068 [P] `admin/test/modules/document_templates/off-state.test.tsx` — no nav, palette row, comparison button when absent
- [ ] T069 Manifest action `open-document-templates` with invoice keywords; `registered-bundles-shape.test.ts` and `check:action-route-permissions` green
- [ ] T070 [P] Docs: `DT/docs/document-templates.md` (both types, palettes per type, defaults and scopes, languages, merge fields, import note, off-states), `docs/docs/module-reference/document-templates.md`; comparisons page section; invoices pages (`INV/docs/invoices.md`, `docs/docs/module-reference/invoices.md`) point to Document templates and describe the move; Polish versions under `docs/i18n/pl/docusaurus-plugin-content-docs/current/`; refresh `docs/translation-cache/pl/` entries per `docs/docs/contributing/documentation-i18n.md`; `check:module-docs` clean
- [ ] T071 [P] Changesets: contracts, page-builder-core, admin-kit, comparisons, **invoices (major — withdrawn API; release note also says e-mailed invoice PDFs now follow the configured template, N1)**, the new module (`specs/conventions/release-intent.md`)
- [ ] T072 [P] Benches `backend/test/perf/comparisons/pdf-export.bench.ts` and `backend/test/perf/invoices/pdf-render.bench.ts` (SC-003); record results in research R-20
- [ ] T073 Re-run `composer:generate`, `manifests:generate`, `pnpm install --lockfile-only`; commit
- [ ] T074 After the deletions: re-derive `backend/test/unit/kernel/module-removal.test.ts`'s ledger if it reports; re-record a read size only if its band refuses (`specs/conventions/check-estate.md`)
- [ ] T075 Verify: `pnpm run build:packages`; `pnpm -r run typecheck`; `pnpm -r run lint`; `pnpm --filter backend run test:unit:fast`; this feature's contract and integration files plus `backend/test/integration/invoices/**`; `pnpm --filter '!backend' run test`; `pnpm run check:naming && pnpm run check:language`; `pnpm --filter backend run` `check:port-dependencies`, `check:port-catches`, `check:module-boundary`, `check:kernel-boundary`, `check:container-imports`, `check:subscribe-seam`, `check:entry-presence`, `check:command-coverage`, `check:block-names`, `check:bundle-pairing`, `check:default-language-prose`, `check:platform-surface`, `check:module-docs`, `check:action-route-permissions`, `i18n:hardcoded`, `overlay:check`, `manifests:check`
- [ ] T076 Walk `quickstart.md` §0–§10 on a database **upgraded from `origin/master` with invoice templates in it** (not only a fresh `pnpm run setup`) and tick it in the MR

---

## Dependencies and order

```text
Setup (T001–T003) → Foundational (T004–T029; T009 before ANY change under INV/)
   → US1 (T030–T042) → US2 (T043–T048)                 ← MVP
   → US3 (T049–T050) ┐
   → US4 (T051–T054) ├ independent, each after US1
   → US5 (T055–T063) │ after Foundational + T031 (API) + T038 (editor)
   → US6 (T064–T065) ┘
   → Polish (T066–T076)
```

- T005 before every task naming contracts types; T006 before T029, T038, T040, T063; T008 before T040, T063.
- T011 before T020, T024, T026; T013 before T023, T029, T036, T056; T023 before T030, T034, T055.
- T055 before T060 (goldens are the gate); T058 before T059's import-dependent cases; T059a before T060.

## Requirement → test

| Requirement | Test task(s) |
| --- | --- |
| FR-001, FR-002 | T030, T037 |
| FR-003, FR-004, FR-005 | T024, T030, T051 |
| FR-006, FR-007 | T024, T051 |
| FR-008 | T004, T030 |
| FR-010, FR-016, FR-018 | T037, T039, T062 |
| FR-011, FR-019 | T012, T022, T028, T030, T037, T062 |
| FR-012 | T018, T032, T039 |
| FR-013 | T004, T022 |
| FR-014 | T047 |
| FR-015 | T030, T037 |
| FR-017 | T053 |
| FR-020, FR-021 | T032, T034, T041 |
| FR-022 | T043, T045 |
| FR-023 | T014, T035 |
| FR-030, FR-031 | T020, T034, T049 |
| FR-032 | T020, T045, T047 |
| FR-033 | T022, T034 |
| FR-034 | T020, T051 |
| FR-035 | T022, T032, T034 |
| FR-036 | T034 |
| FR-037, FR-038, FR-039 | T020, T049, T064 |
| FR-050, FR-051, FR-052 | T012, T022, T028, T066, T068 |
| FR-060 | T030, T031 |
| FR-061 | T024, T026 |
| FR-062, FR-090 | T069 |
| FR-063 | T039 |
| FR-064 | T031, T038, T044, T048, T063, T069 |
| FR-065 | T070 |
| FR-070 | T064, T065 |
| FR-080, FR-087 | T055, T062 |
| FR-081, FR-082 | T026, T057 |
| FR-083, FR-084, FR-085, FR-086 | T009, T055, T059 |
| FR-088 | T062 |
| FR-089 | T057 |
| FR-091 | T075 (`backend/test/integration/invoices/**` unchanged and green) |
| FR-092 | T030 (old routes 404), T061, T071 |
| FR-093 | T059a, T071 |
| SC-002, SC-005 | T034, T049, T059 |
| SC-003 | T072 |
| SC-004 | T043 |
| SC-006 | T066 |
| SC-007 | T065 |
| SC-008 | T009, T055, T059, T059a |
| SC-009 | T057 |
| SC-001 | T076 (manual, timed) |

## Implementation strategy

MVP = Phases 1–4 (comparison in both languages). US5 is mandatory for this feature's merge request
(owner decision) and carries the highest regression risk; schedule it right after the MVP and do not
merge without T009/T055/T059 green and T076 walked on an upgraded database.
