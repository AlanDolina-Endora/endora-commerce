---
description: "Task list for 152 — editable PDF template for the storefront product comparison"
---

# Tasks: Editable PDF template for the storefront product comparison

**Input**: `specs/152-compare-pdf-template/` — plan.md, spec.md, research.md, data-model.md,
contracts/ (`document-type-registry.md`, `document-templates-api.md`, `comparison-document.md`,
`admin-ui.md`), quickstart.md
**Tests**: REQUIRED — Constitution III (TDD, non-negotiable). Every implementation task follows the
failing test it turns green; a test task names the behaviour it must prove **red** before the
implementation exists.

**Organization**: by user story (spec.md). US1 + US2 are the MVP.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelisable (different files, no dependency on an unfinished task)
- **[Story]**: US1 … US5; Setup / Foundational / Polish carry none

Paths: `DT` = `packages/modules/document_templates`, `CMP` = `packages/modules/comparisons`,
`CT` = `packages/contracts/src`.

---

## Phase 1: Setup

- [ ] T001 Scaffold the module package `DT/` after `packages/modules/admin_search/` (tsconfig.json, tsconfig.build.json, tsconfig.ui.json, vitest.config.ts, tailwind.css, README.md, CHANGELOG.md, LICENSE) with `endora: { type: 'module', id: 'document_templates' }`; the `package.json` body is rendered by `pnpm --filter backend run manifests:generate`, never hand-written
- [ ] T002 Write the skeleton `DT/src/manifest.ts` (id, name, version, `dependencies: ['settings','auth','assets_library']`, settings group + `document_templates.enabled`, `activation`, `i18n`, `docs`) and an empty `registerModule` in `DT/src/backend/index.ts`; run `composer:generate`, `manifests:generate`, `pnpm install --lockfile-only`; commit the generated artefacts
- [ ] T003 [P] Create `DT/i18n/en.json` and `DT/i18n/pl.json` (flat maps) and the stub `DT/docs/document-templates.md` with front matter

---

## Phase 2: Foundational (blocks every story)

### Contracts (Principle II — before any route)

- [ ] T004 [P] Write `CT/document-templates.test.ts`: `documentTypeCodeSchema` accepts `comparisons.comparison`, refuses `Comparisons.x`/`a.b.c`; `documentTemplateContentSchema` enforces `schemaVersion: 1`, language-key regex, 1–10 languages, ≤ 200 nodes, `blockNameRe` on node types (unknown names accepted), string props ≤ 5 000, ≤ 20 `document_templates.Image` nodes, 512 KiB total, rejects Puck `zones`; `documentRootPropsSchema` defaults and ranges (data-model §2.1); merge-field key regex; every admin DTO in `contracts/document-templates-api.md` — red
- [ ] T005 Implement `CT/document-templates.ts` (schemas, `DocumentTypeRegistration`, `DocumentBlockRenderer`, `DocumentRenderContext`, `DocumentTypeRegistryPort`, `DocumentRenderPort`, `DocumentRenderResult`, admin DTOs), export from `CT/index.ts`, add `DOCUMENT_TEMPLATE_NOT_FOUND`, `DOCUMENT_TYPE_NOT_AVAILABLE`, `DOCUMENT_TEMPLATE_INVALID`, `DOCUMENT_TEMPLATE_ACTIVE`, `DOCUMENT_RENDER_FAILED` to `CT/errors.ts` — T004 green
- [ ] T006 Widen `pageBuilderContextSchema` in `CT/cms.ts` and `AdminBlockContributionSchema.context` in `CT/admin-contributions.ts` with `'document'` (tests first in `CT/admin-contributions.test.ts` and a new case in the cms schema test); run `pnpm -r run typecheck` and fix every exhaustive consumer it reports (expected: `packages/page-builder-core/src/palette.ts` context admission, `packages/admin-kit/src/zones/use-block-contributions.ts`, `packages/modules/cms/src/backend/services/page-builder-registry.ts` must keep `document` blocks out of the CMS palette — assert that in `page-builder-registry`'s test)
- [ ] T007 [P] Add a failing case to the comparisons contracts test, then `comparisonDocumentDataSchema` and `ComparisonDocumentData` to `CT/comparisons.ts` (contract `comparison-document.md` §2)
- [ ] T008 [P] Write `packages/page-builder-core/src/contributions/document-sample.test.tsx` (provider supplies the value; `useDocumentSample()` returns `null` outside a provider), then implement `document-sample.tsx` and `DocumentBlockEditorConfig` in `contributions/types.ts`; export from the `./contributions` subpath

### Schema

- [ ] T009 Write `backend/test/integration/document_templates/schema.test.ts`: a second active row for the same type + global scope is refused, for the same channel refused, for another channel accepted; inactive duplicates accepted; the `document_type` check refuses `Bad.Code`; deleting a sales channel cascades its templates — red
- [ ] T010 Scaffold `pnpm --filter backend run migration:new -- --module document_templates --name init` and write the DDL of data-model §1; add `DT/src/backend/entities/document-template.entity.ts` (`@GlobalEntity()`, `@Entity({ tableName: 'document_templates' })`) and the `entities` array export; run `composer:generate` — T009 green; `check-entity-tenant-classification` passes

### Core services (pure, no HTTP)

- [ ] T011 [P] Write `DT/src/backend/registry/document-type-registry.test.ts` (contract `document-type-registry.md` §3 rules 1–4, presence filter flips both ways without re-registration, identical object idempotent, conflict refused, `defaultContent()` validated) — red
- [ ] T012 Implement `DT/src/backend/registry/document-type-registry.ts`; register it in `DT/src/backend/index.ts` as a plain `ctx.di.register` singleton over `effectiveState.isPresent` — T011 green
- [ ] T013 [P] Write `DT/src/backend/rendering/merge-fields.test.ts` (known key, `null` → empty, unknown verbatim, `page`/`pages` only in header/footer scope, no nesting, no markup) — red
- [ ] T014 Implement `DT/src/backend/rendering/merge-fields.ts` — T013 green
- [ ] T015 [P] Write `DT/src/backend/rendering/embed-asset-images.test.ts` (PNG/JPEG inlined as data URIs, SVG/WebP omitted, missing asset omitted, never throws, never fetches a URL) — red
- [ ] T016 Implement `DT/src/backend/rendering/embed-asset-images.ts` over `AssetReadPort.openAssetBytes` — T015 green
- [ ] T017 [P] Write `DT/src/backend/rendering/core-blocks.test.ts`: document definition of each of the six core blocks for default and edge props (untrusted types coerced, colours validated, missing image → nothing) — red
- [ ] T018 Implement `DT/src/backend/rendering/core-blocks.ts` — T017 green
- [ ] T019 Write `DT/src/backend/services/template-resolver.test.ts`: channel-active → global-active → built-in; channel-B row never chosen for channel A; `salesChannelId: null` never matches a channel row; a tree with zero renderable nodes falls through; language exact → primary subtag → `en-US` → `en` → first; the row is read once (single snapshot) — red
- [ ] T020 Implement `DT/src/backend/services/template-resolver.ts` — T019 green
- [ ] T021 Write `DT/src/backend/rendering/document-renderer.test.ts` (assert document definitions, not bytes): core + host blocks in order; a host block of an absent owner skipped and its props untouched; host `render` throwing → `DocumentRenderError` with template id, version, block name; `ModuleDisabledError` re-thrown untouched; root props → page size, margins, font size; `orientation: 'auto'` asks `suggestOrientation`; header/footer interpolation with page numbers; blocks receive only `props`, `data`, `language`, `context`, `interpolate`; pdfmake URL policy deny-all; one byte-level smoke render — red
- [ ] T022 Implement `DT/src/backend/rendering/document-renderer.ts` and publish it with `ctx.di.providePort('documentRenderPort', …)` in `DT/src/backend/index.ts` (`assetReadPort` via `lazyPort`) — T021 green
- [ ] T023 Write `DT/src/backend/commands/document-template-commands.test.ts`: each of the six Commands writes exactly one audit row with `objectType 'document_template'` and the R-13 state (content digest, not tree); a refused Command (version conflict, unavailable type, invalid content, active delete without confirm, source of another type, unknown channel) writes none; `activate` deactivates the previous active in the same scope inside one transaction; `create` from built-in copies `defaultContent()`; scope cannot be changed by any Command — red
- [ ] T024 Implement `DT/src/backend/commands/document-template-commands.ts` and `DT/src/backend/services/document-template-service.ts` (reads + `CommandBus.run`; channel validation via `lazyPort(ctx, 'salesChannelResolutionPort')`; no audit-writer call) — T023 green; `pnpm --filter backend run check:command-coverage` clean for the module
- [ ] T025 [P] Write `DT/src/backend/services/builder-descriptor.test.ts`: descriptor = six core blocks + the type's listed host blocks from present owners' manifest declarations (via `resolvedModuleRegistry`), categories folded per `contracts/block-definition.md` §1.1, `rootFields` present, an owner switched off removes its blocks — red
- [ ] T026 Implement `DT/src/backend/services/builder-descriptor.ts` — T025 green

**Checkpoint**: the engine renders a fixture tree to a PDF in unit tests; the table exists; every write is a Command.

---

## Phase 3: User Story 1 — design the comparison PDF and have downloads follow it (P1) — MVP

**Goal**: an operator creates, edits, previews and activates a comparison template; the storefront export uses it.
**Independent test**: spec US1 *Independent Test*; quickstart §2–§4.

### Backend — document templates API

- [ ] T027 [P] [US1] Write `backend/test/contract/document_templates/admin-api.test.ts` for routes 1–12 of `contracts/document-templates-api.md`: shapes parsed with the contracts schemas, 401/403 before validation, `types` never captured by `/:id`, preview answers `application/pdf` and writes no row and no audit entry, every error code of the table — red
- [ ] T028 [US1] Implement `DT/src/backend/routes.admin.ts` and wire it with `ctx.routes` in `DT/src/backend/index.ts`; complete `DT/src/manifest.ts` with `permissions` (read; write with `requires`), the six core `blocks` + `blockCategories`, `errorCodes`; add `adminRoles.permission.*`, `blocks.*`, `errors.*` keys to both `DT/i18n` bundles — T027 green; `backend/test/contract/admin_users/permission-inventory.test.ts` green

### Backend — comparisons document type

- [ ] T029 [P] [US1] Write `CMP/src/backend/document/blocks/{header,table,share-link}.test.ts` per `contracts/comparison-document.md` §3 (rows by display mode + `hideEmptyRows`, 16 products → 4 tables of 4, hidden note only when count > 0, null price → `emptyValue`, availability texts, images via an injected fetcher with fallback, share link absent when `shareUrl` null, QR node present when `showQr`) — red
- [ ] T030 [US1] Extract `filterRowsByMode`, `pickOrientation` and the table layout into `CMP/src/backend/services/comparison-pdf-shared.ts`, re-point `comparison-pdf-renderer.ts` at it **without changing its output** (its two existing test files stay green unmodified), then implement the three blocks in `CMP/src/backend/document/blocks/` — T029 green
- [ ] T031 [P] [US1] Write `backend/test/contract/comparisons/pdf-template-export.test.ts`: no template → built-in layout used (`source: 'built_in'` observable through a test seam on the port); active global template → used; `hideEmptyRows=true` drops all-null rows; response headers unchanged; empty comparison still 409; **cross-organisation**: a buyer of organisation A exporting through the template path never receives organisation B's prices or a product restricted to B (assert on the document definition captured through the test seam) — red
- [ ] T032 [US1] Implement `CMP/src/backend/document/comparison-document-data.ts` (+ `.test.ts`), `sample-comparison.ts`, `built-in-layout.ts` (`en-US` tree reproducing today's layout) and `comparison-document-type.ts` (+ `.test.ts`: registration validates, lists exactly the three blocks, five variables resolve, `suggestOrientation` = `pickOrientation`)
- [ ] T033 [US1] Wire `comparisons`: contribution-only `ctx.onBoot` pushing the registration (no presence probe); `/me/pdf` per contract §4 with the presence probe in front of `lazyPort<DocumentRenderPort>(ctx, 'documentRenderPort')` and `rethrowIfModuleDisabled` first in the render `catch`; `hideEmptyRows` query (Zod); manifest `blocks`, `blockCategories`, `nonBindingDependencies` (`contributes-to`, `degrades-without` with `whenAbsent`); comparisons' bundles gain `documentTypes.*`, `blocks.*` — T031 green; `check:port-dependencies`, `check:port-catches`, `check:block-names` clean

### Admin — screens and editor

- [ ] T034 [P] [US1] Write `admin/test/modules/document_templates/DocumentTemplatesPage.test.tsx` (types listed with translated labels, built-in row with *Preview* / *Create from this*, templates table, *New template* dialog posts route 6, `?type=` expands the card; loading/empty/error states) and `DocumentTemplateEditor.test.tsx` (descriptor composed with core editors + contributed renderer + neutral stand-in for an unknown stored block whose props survive a save; sample from route 2 reaches a contributed renderer; *Save* sends `expectedVersion`; *Preview PDF* posts the canvas tree; *Activate* calls route 9) — both in `<StrictMode>`, with `axe-core` — red
- [ ] T035 [US1] Implement `DT/src/admin/{index.ts,api/document-templates-client.ts,pages/DocumentTemplatesPage.tsx,pages/DocumentTemplateEditor.tsx,components/NewTemplateDialog.tsx,blocks/core-block-editors.tsx}` per `contracts/admin-ui.md` §1–§3 (routes + nav contribution); all strings through `useTranslation('document_templates')` — T034 green; `i18n:hardcoded` adds no finding
- [ ] T036 [P] [US1] Write `CMP/src/admin/document-blocks/*.test.tsx` (each editor config renders the sample, field overrides present) and `admin/test/modules/comparisons/pdf-template-link.test.tsx` (link only with presence + `document_templates:read`) — red
- [ ] T037 [US1] Implement `CMP/src/admin/document-blocks/{ComparisonHeader,ComparisonTable,ComparisonShareLink}.tsx`, add `blocks` contributions in `CMP/src/admin/index.ts`, and the *PDF template* link in `CMP/src/admin/pages/ComparisonsListPage.tsx`; translated field labels in comparisons' bundles — T036 green

### Storefront — mirror the screen

- [ ] T038 [P] [US1] Write `storefront/test/lib/comparisons-export.test.ts`: `exportComparisonPdf({ locale, hideEmptyRows })` requests `/api/v1/comparisons/me/pdf?hideEmptyRows=…` — red
- [ ] T039 [US1] Implement the `hideEmptyRows` half in `storefront/lib/api/comparisons.ts` and `storefront/components/ComparisonTable.tsx` (`ExportPdfButton` receives the switch state) — T038 green (locale in US2)

**Checkpoint**: quickstart §2–§4 pass end to end in English.

---

## Phase 4: User Story 2 — the PDF speaks the buyer's language (P1) — MVP

**Goal**: per-language layouts; Polish buyer gets Polish layout, names, dates, money.
**Independent test**: spec US2.

- [ ] T040 [P] [US2] Extend `CMP/src/backend/document/blocks/*.test.ts` and `built-in-layout.test.ts`: `pl-PL` names picked with the exact → primary → `en-US` chain; `Intl` Polish date and currency; the built-in layout has `en-US` and `pl-PL` trees, both valid and renderable, with no English platform text in the Polish tree (SC-004) — red
- [ ] T041 [US2] Add the `pl-PL` tree (one per-language literal map in `built-in-layout.ts`), language-aware name/date/money formatting in the blocks, Polish sample names in `sample-comparison.ts` — T040 green; `check:default-language-prose` clean
- [ ] T042 [P] [US2] Extend `backend/test/contract/comparisons/pdf-template-export.test.ts`: `Accept-Language: pl-PL` → Polish tree and `content-language: pl-PL`; template with only `en-US` → English tree with Polish product names; unknown header → channel default language; fixed-renderer path unchanged — red
- [ ] T043 [US2] Implement language resolution in `CMP/src/backend/routes.public.ts` (first `Accept-Language` tag naming an active content language → channel `defaultLanguage` → `en-US`) — T042 green
- [ ] T044 [P] [US2] Extend `admin/test/modules/document_templates/DocumentTemplateEditor.test.tsx` (language switcher lists `GET /api/v1/i18n/config` languages; choosing an absent language offers *Start from <current>* and saves a copy; sample refetched per language) and `storefront/test/lib/comparisons-export.test.ts` (sends `Accept-Language: <locale>`) — red
- [ ] T045 [US2] Implement `DT/src/admin/components/LanguageSwitcher.tsx` and the copy flow in the editor; pass `locale` from `storefront/app/compare/page.tsx` through `ComparisonTable` to `exportComparisonPdf`; move the button's `Generowanie…` / `Nie udało się wygenerować PDF.` to `storefront/lib/i18n/messages.ts` (`compare.pdf.busy`, `compare.pdf.failed`, en + pl) — T044 green; storefront `tsc` proves both catalogues total

**Checkpoint**: MVP — quickstart §2–§5 pass in both languages.

---

## Phase 5: User Story 3 — a different layout for one sales channel (P2)

- [ ] T046 [P] [US3] Write `backend/test/integration/document_templates/tenancy-channel.test.ts`: global + channel-B active → channel-B export uses B's, channel-A export uses global's and never B's; only channel-B active → channel A gets the built-in layout; a request whose channel cannot be resolved never selects a channel template (fail closed) — red against a resolver regression (mutate the resolver to prove it reds)
- [ ] T047 [US3] Add the scope select (all channels + each channel from the kernel-backed admin channel list) to `NewTemplateDialog.tsx` and the scope column/filter (`?salesChannelId=`) to the list; admin test cases in `DocumentTemplatesPage.test.tsx` — T046 + admin cases green

---

## Phase 6: User Story 4 — manage templates safely (P2)

- [ ] T048 [P] [US4] Write `backend/test/integration/document_templates/activation-race.test.ts` (two concurrent activations in one scope end with exactly one active; the loser answers `VERSION_CONFLICT` or wins second; exports during a save receive one whole version) and admin cases: *Duplicate…* into same/other scope, *Activate/Deactivate* row actions, *Delete…* of an active template shows the fallback confirmation and sends `confirmActive`, version-conflict dialog offers *Reload* and never overwrites, read-only mode without `document_templates:write` — red
- [ ] T049 [US4] Implement the row actions, dialogs, conflict dialog and read-only mode in `DT/src/admin/` — T048 green
- [ ] T050 [P] [US4] Write `DT/src/admin/components/MergeFieldsPanel.test.tsx` (variables from route 2, header/footer-only marked, copy chip yields `{{key}}`) — red
- [ ] T051 [US4] Implement `MergeFieldsPanel.tsx` in the editor side bar — T050 green

---

## Phase 7: User Story 5 — the facility serves the next document type (P3)

- [ ] T052 [P] [US5] Add `backend/test/fixtures/document-types/fixture-document-type.ts` (a test-only module or overlay registration `fixture_docs.note` with one host block, sample and built-in layout) and wire it into `backend/test/test-server.ts` only; write `backend/test/contract/document_templates/second-type.test.ts`: both types listed, fixture editable, previewable and renderable through `documentRenderPort`; fixture switched off → hidden, its rows untouched; on again → restored — red
- [ ] T053 [US5] Make T052 green **without editing any file under `DT/`** (SC-007); if a change is needed, it is a contract defect — record it in research.md and fix the contract first

---

## Phase 8: Polish & cross-cutting

### Module activation (Principle XVII)

- [ ] T054 [P] Write `backend/test/contract/document_templates/off-state.test.ts`: `document_templates` deactivated while platform-available → all 12 routes 503 `MODULE_DISABLED`, palette action and nav absent from the effective sets, comparisons export succeeds through the fixed renderer (byte-identical to the renderer called directly), template rows untouched; re-enabled → templates and active flags restored; `comparisons` deactivated → its type absent from route 1, routes 2/3/6 `DOCUMENT_TYPE_NOT_AVAILABLE`, its templates hidden, rows untouched, restored on re-enable — red
- [ ] T055 Make T054 green (expected: no production change beyond earlier tasks; any fix lands here with its reason)
- [ ] T056 [P] Admin off-state test in `admin/test/modules/document_templates/off-state.test.tsx` (no nav, no palette row, no *PDF template* link when absent) — green or fix

### Discoverability, docs, release

- [ ] T057 Add the manifest `actions` entry `open-document-templates` with keywords (contract `admin-ui.md` §1) and its two keys in both bundles; `pnpm --filter backend exec vitest run test/unit/_i18n/registered-bundles-shape.test.ts` and `check:action-route-permissions` green
- [ ] T058 [P] Write the docs: `DT/docs/document-templates.md` (operator guide: list, editor, blocks, merge fields, scopes, languages, fallback, off-state), `docs/docs/module-reference/document-templates.md`, a *Designing the comparison PDF* section in `CMP/docs/comparisons.md`; Polish translations under `docs/i18n/pl/docusaurus-plugin-content-docs/current/` (modules + module-reference) per `docs/docs/contributing/documentation-i18n.md`; `check:module-docs` clean
- [ ] T059 [P] Add changesets for `@endora-commerce/contracts`, `page-builder-core`, `admin-kit`, `mod-comparisons` (package names as generated), the new module package, per `specs/conventions/release-intent.md`
- [ ] T060 [P] Write `backend/test/perf/comparisons/pdf-export.bench.ts` (16 products with images: template path vs fixed path; built-in preview) and record the result against SC-003 in research.md R-20

### Verification

- [ ] T061 Run and fix: `pnpm run build:packages`; `pnpm -r run typecheck`; `pnpm -r run lint`; `pnpm --filter backend run test:unit:fast`; the contract and integration files of this feature; `pnpm --filter '!backend' run test`; `pnpm run check:naming && pnpm run check:language`; `pnpm --filter backend run` `check:port-dependencies`, `check:port-catches`, `check:module-boundary`, `check:kernel-boundary`, `check:container-imports`, `check:subscribe-seam`, `check:entry-presence`, `check:command-coverage`, `check:block-names`, `check:bundle-pairing`, `check:default-language-prose`, `check:platform-surface`, `check:module-docs`, `i18n:hardcoded`, `overlay:check`, `manifests:check`; `backend/test/unit/kernel/module-removal.test.ts` re-derived if it reports; re-record a read size only if its band refuses (`specs/conventions/check-estate.md`)
- [ ] T062 Walk `quickstart.md` §1–§8 manually on a `pnpm run setup` database and tick it in the MR description

---

## Dependencies and order

```text
Setup (T001–T003) → Foundational (T004–T026)
   → US1 (T027–T039) → US2 (T040–T045)          ← MVP
   → US3 (T046–T047)  ┐
   → US4 (T048–T051)  ├ independent of each other, each after US1
   → US5 (T052–T053)  ┘
   → Polish (T054–T062)
```

- T005 before every task naming a contracts type; T006 before T025, T035, T037; T008 before T037.
- T010 before T019, T023; T012 before T021, T025, T033; T022 before T027, T031; T024 before T027.
- T030 before T032; T032 before T033; T028 + T033 before T034's end-to-end cases.

## Parallel examples

- Foundational: T004, T007, T008, T011, T013, T015, T017 together (different files); then their
  implementations.
- US1: T027, T029, T031, T034, T036, T038 written in parallel; implementations follow their
  dependencies above.

## Requirement → test

| Requirement | Test task(s) |
| --- | --- |
| FR-001, FR-002 | T027, T034 |
| FR-003, FR-004, FR-005 | T023, T027, T048 |
| FR-006 | T023, T048 |
| FR-007 | T023, T048 |
| FR-008 | T004, T027 |
| FR-010, FR-016, FR-018 | T034, T036 |
| FR-011 | T017, T025 |
| FR-012 | T029, T036 |
| FR-013 | T004, T021 |
| FR-014 | T044 |
| FR-015 | T027, T034 |
| FR-017 | T050 |
| FR-020 | T029, T031, T038 |
| FR-021 | T029, T031 |
| FR-022 | T040, T042 |
| FR-023 | T013, T032 |
| FR-030, FR-031 | T019, T031, T046 |
| FR-032 | T019, T042, T044 |
| FR-033 | T021, T031 |
| FR-034 | T019, T048 |
| FR-035 | T021, T029, T031 |
| FR-036 | T031 |
| FR-050, FR-051, FR-052 | T011, T021, T025, T054, T056 |
| FR-060 | T027, T028 (permission inventory) |
| FR-061 | T023 |
| FR-062 | T057 |
| FR-063 | T036 |
| FR-064 | T028, T035, T041, T045, T057 (bundle-shape, bundle-pairing, i18n:hardcoded, storefront tsc) |
| FR-065 | T058 |
| FR-070 | T052, T053 |
| FR-071 | T061 (invoices suites unchanged and green) |
| SC-002 | T031, T046 |
| SC-003 | T060 |
| SC-004 | T040 |
| SC-005 | T031, T046 |
| SC-006 | T054 |
| SC-007 | T053 |
| SC-001 | T062 (manual walk, timed) |

## Implementation strategy

MVP = Phases 1–4 (US1 + US2): an operator can design, preview and activate a comparison template in
both languages, and buyers' exports follow it. US3, US4 and US5 are independent increments after
that; Phase 8 is required before merge.
