---
description: "Task list for 153 — quote request PDF export, per-quote template, configurable line-items table"
---

# Tasks: Quote request PDF export with a per-quote template and a configurable line-items table

**Input**: `specs/153-quote-request-pdf-template/` — plan.md, spec.md, research.md, data-model.md,
contracts/ (`document-collections.md`, `quote-request-document.md`, `admin-ui.md`), quickstart.md
**Tests**: REQUIRED — Constitution III. Every implementation task follows the failing test it turns
green; a test task names the behaviour it must prove **red** first.

**Organization**: facility first (the generic machinery is proven by a test-only type before the quote
type exists), then by user story. MVP = US1 + US2 + US3. Open questions Q1–Q7 are implemented with their
recommended defaults; do not build an alternative unless the owner answers so.

## Format: `[ID] [P?] [Story] Description`

Paths: `DT` = `packages/modules/document_templates`, `QR` = `packages/modules/quote_requests`,
`CT` = `packages/contracts/src`.

---

## Phase 1: Setup

- [ ] T001 Confirm the worktree builds: `pnpm run build:packages`, `pnpm -r run typecheck`; record the baseline of `pnpm --filter backend run test:unit:fast` and of `backend/test/contract/document_templates/` (both green before any change)
- [ ] T002 `grep -rn "fixture-document-type\|FIXTURE_DOCUMENT_TYPE\|FIXTURE_BLOCK\|fixture_note" backend/test admin packages` and list every importer in the MR description (research R-24; `AGENTS.md` deletion trap)

---

## Phase 2: Foundational — the facility's line collections and Line items table

### Contracts

- [ ] T003 [P] Extend `CT/document-templates.test.ts` — red: `documentFieldPathRe` (plain, one family segment, two dots refused, reserved `row`/`item` detected by `isReservedFieldPath`); `DocumentValue` and `DocumentCondition` schemas; `itemsTablePropsSchema` (1–16 columns, unique ids, rule ops allowed per position, ≤ 8 entries, ≤ 10 totals, label/emptyText lengths, width/align/format ranges, grouping shape, colours, `collection` key regex); `documentTypeDetailSchema.collections`; `DocumentTemplateChoices`
- [ ] T004 [P] Write `CT/document-values.test.ts` for the pure functions — red: `documentValueHasValue` (`0` has a value, blank text has none); `formatDocumentValue` in `pl-PL` and `en-US` (number decimals, money symbol/code/none, invalid currency, percent with NBSP, date styles, failure → `String`); `evaluateDocumentCondition` over `{ items }`, `{ item }`, `{ summary }`, default field, unreadable → `true`; `sumDocumentValues` (numbers, one-currency money rounded, mixed → `null`, none → `null`); `resolveDocumentAlign`
- [ ] T005 Implement in `CT/document-templates.ts` (or a sibling `document-values.ts` re-exported from it): the shapes of `data-model.md` §2–§3, `COLLECTION_BLOCK_NAMES`, `collections?` on `DocumentTypeRegistration`, `listChoices` on `DocumentRenderPort`, the five pure functions; export from `CT/index.ts` — T003, T004 green; `pnpm run build:packages`

### Registry and palette

- [ ] T006 Extend `DT/src/backend/registry/document-type-registry.test.ts` — red: collection key refusals and duplicates at registration; built-in ItemsTable node failing `itemsTablePropsSchema` or naming an undeclared collection refused; per-call field refusals (bad path, reserved family, duplicate) dropped and logged once; `palette()` includes `document_templates.ItemsTable` iff collections; a host block named `document_templates.ItemsTable` refused per call
- [ ] T007 Implement in `document-type-registry.ts` (+ a `collections(code, language)` reader that prepends `row.number` and applies the per-call refusals) — T006 green
- [ ] T008 [P] Extend `DT/src/backend/services/builder-descriptor.test.ts` — red: type blocks, then collection blocks, then core blocks; `data` category resolved from the facility's manifest — then implement — green

### Manifest

- [ ] T009 `DT/src/manifest.ts`: declare `document_templates.ItemsTable` (`contexts: ['document']`, category `data`, descriptor fields per `contracts/document-collections.md` §3, `defaultProps`), `blockCategories` += `data`; `open-document-templates` keywords += quote words (FR-072); description made type-neutral. Bundles `DT/i18n/{en,pl}.json` (block, category keys); run `pnpm --filter backend exec vitest run test/unit/_i18n/registered-bundles-shape.test.ts`

### Rendering

- [ ] T010 Write `DT/src/backend/rendering/items-table.test.ts` (definition-level) — red: visible-column rules (`never`, `any_has_value` with/without values, rule `field` override); header label vs catalogue label vs unknown field; cell formatting and alignment per kind; `emptyText` on no item / no visible column; widths `auto`/`fill`/fixed and proportional scaling over `context.pageWidth`; `headerRows: 1`, `dontBreakRows: true`; striped rows; hostile props (wrong types, unknown op → always)
- [ ] T011 Implement `DT/src/backend/rendering/items-table.ts` columns, header, body, widths, style — T010 green
- [ ] T012 Extend `DT/src/backend/rendering/document-renderer.test.ts` — red: ItemsTable dispatched with the catalogue loaded once per collection per render; `fields()` rejecting → table renders with empty texts and the failure is logged; `items()` throwing → `DOCUMENT_RENDER_FAILED` naming the block; ItemsTable skipped in a type without collections; **SC-007**: a test-only registration (id `fixturemod.lines_doc`, presence stubbed) declaring a collection prints its own lines through the block with no facility change
- [ ] T013 Implement the dispatch in `document-renderer.ts` (catalogue preload beside `loadAssetImages`) — T012 green
- [ ] T014 [P] Extend `DT/src/backend/rendering/merge-fields.test.ts`: `{{item.sku}}`, `{{item.attributes.colour}}`, `{{row.number}}` print verbatim (FR-045) — green with no code change (pins the reservation)

### Save-time validation

- [ ] T015 Write `DT/src/backend/services/content-validation.test.ts` cases — red: invalid ItemsTable props refused with `details.path` `content.<i>.props.<…>`; undeclared `collection` refused; unknown field paths accepted; ItemsTable in a collection-less type refused by name (FR-019 of 152)
- [ ] T016 Implement in `content-validation.ts` / `document-template-service.ts` — T015 green

### Port `listChoices` and route 2

- [ ] T017 Extend `DT/src/backend/services/template-resolver.test.ts` — red: `listChoices` returns global ∪ same channel (never another), channel first then global by name, `effectiveDefaultId` for channel default / global default / none, `null` channel → global only, `default_only` → 422 `DOCUMENT_TEMPLATE_NOT_SELECTABLE`, unknown type → 404
- [ ] T018 Implement the query in `template-resolver.ts` and `DocumentRenderer.listChoices` — T017 green
- [ ] T019 Extend `backend/test/contract/document_templates/admin-api.test.ts` — red: route 2 answers `collections` with `row.number` first, labels in `?language`, `sampleItems` with `sampleValue` filled, `sampleSummary`; `[]` for the comparison and invoice types — then implement in `document-template-service.ts` — green

**Checkpoint**: the facility prints a configurable table for any type declaring a collection, proven
without `quote_requests`.

---

## Phase 3: User Story 3 — the quote's line field catalogue and the table editor (P1)

### Backend

- [ ] T020 [P] [US3] Write `CT/quote-requests.test.ts` cases — red: `QuoteRequestDocumentData`, `QuoteRequestDocumentChoices`, `quoteRequestSchema.documentTemplateId` optional — then implement in `CT/quote-requests.ts` — green
- [ ] T021 [P] [US3] Write `QR/src/backend/document/quote-lines.test.ts` — red, research R-11 table: discount only below list in the same currency with list > 0; `null` discount otherwise; agreed `null` → price/net/VAT/gross `null`; packaging quantity; VAT from net total; totals every-line-or-null; mixed currencies → totals `null`; rounding to 2 decimals; `pl-PL`/`en-US` labels of every catalogue field; `internal` audience on list/discount fields
- [ ] T022 [US3] Implement `QR/src/backend/document/{quote-lines,texts}.ts` (`items`, `summary`, static catalogue, `fields(language)` adding `attributes.<code>` from an injected `CatalogAttributeReadPort` reader with `sampleValue`) — T021 green

### Admin — the table editor (facility)

- [ ] T023 [P] [US3] Write `admin/test/modules/document_templates/items-table-editor.test.tsx` (`<StrictMode>`, `axe-core`) — red: grouped field picker with search and Internal badges; add/edit/remove; keyboard reorder announced; 16-column limit message; unknown-field flag; visibility radios per position; format controls by kind; detail/totals/grouping fields write the `data-model.md` §2 shape; canvas hides `never` and empty `any_has_value` columns (faded with caption) using the shared functions
- [ ] T024 [US3] Implement `DT/src/admin/blocks/items-table/*` and `DocumentCollectionsProvider` in `DocumentTemplateEditor.tsx`; register in `core-block-editors.tsx`; i18n keys of `admin-ui.md` §4 (en + pl) — T023 green; `pnpm --filter backend run i18n:hardcoded`

---

## Phase 4: User Story 2 — the *Quote request* document type and its blocks (P1)

- [ ] T025 [P] [US2] Write `QR/src/backend/document/blocks/blocks.test.ts` — red: `QuoteHeader`, `QuoteParties`, `QuoteNotes`, `QuoteDetails` with default props, toggles off, empty sections left out, hostile props, dates in the PDF language
- [ ] T026 [US2] Implement `QR/src/backend/document/blocks/*.ts` — T025 green
- [ ] T027 [US2] Write `QR/src/backend/document/quote-request-document-type.test.ts` — red: registration accepted by a real `DocumentTypeRegistry` (built-in layout valid in `en-US`/`pl-PL`, ItemsTable props valid); palette = 4 quote blocks + ItemsTable + 6 core blocks; `selection: 'per_document'`; merge fields resolve; built-in layout prints list price / discount % only when a line is discounted (definition-level, through the facility renderer)
- [ ] T028 [US2] Implement `quote-request-document-type.ts`, `built-in-layout.ts`, `sample.ts` — T027 green
- [ ] T029 [US2] `QR/src/manifest.ts`: 4 blocks + `quote` category; `nonBindingDependencies` (`documentTypeRegistry` contributes-to, `documentRenderPort` refuses-without with `whenAbsent`); bundles (en + pl) for blocks, type, variables; `QR/src/backend/index.ts` pushes the type from the **contribution-only** boot hook; run `pnpm --filter backend run check:port-dependencies`, `check:entry-presence`, `check:port-catches`
- [ ] T030 [P] [US2] Canvas renderers `QR/src/admin/document-blocks/*.tsx` + contributions in `QR/src/admin/index.ts` (`context: 'document'`); admin test that each renders the served sample and has no axe violation
- [ ] T031 [US2] Re-target `backend/test/contract/document_templates/second-type.test.ts` and the off-state cases of `admin-api.test.ts` to `quote_requests.quote_request` (palette assertion updated); **delete** `backend/test/fixtures/document-types/fixture-document-type.ts`; re-run the T002 grep — nothing left (research R-24)

---

## Phase 5: User Story 1 — export with a chosen, remembered template (P1)

### Schema and Command

- [ ] T032 [US1] Write `backend/test/integration/quote_requests/document-template-column.test.ts` — red: column exists, nullable, no FK (a random uuid is accepted); the org write guard applies (a write under another organisation's scope refused)
- [ ] T033 [US1] `pnpm --filter backend run migration:new -- --module quote_requests --name quote_request_document_template`; DDL per `data-model.md` §1; entity property; `composer:generate`; commit the registry — T032 green
- [ ] T034 [P] [US1] Write `QR/src/backend/commands/document-template-commands.test.ts` — red: authority before read-for-write (invisible quote → 404, nothing read for write); template of another channel / another type → 422; `null` accepted; `skipAudit` when unchanged; `version` unchanged; audit before/after
- [ ] T035 [US1] Implement the Command (146 idiom) — T034 green

### Data builder and routes

- [ ] T036 [P] [US1] Write `QR/src/backend/document/data-builder.test.ts` — red: visibility refusal; SKU from product or variant; deleted product → `sku: null`, `attributes: {}`; attribute display text with option labels in the language; only customer-audience custom fields; rep `null` when unassigned; `null` channel → system default channel's language; one call per port
- [ ] T037 [US1] Implement `QR/src/backend/document/data-builder.ts` and register it — T036 green
- [ ] T038 [US1] Write `backend/test/contract/quote_requests/pdf-export.test.ts` — red: Q1–Q3 401/403 before validation; invisible quote 404; Q1 choices (channel + global, remembered, missing flag, effective default, suggested language); Q2 remember/forget; Q3 resolution remembered → explicit → channel default → global default → built-in (SC-004); explicit differing choice remembered and audited, default not pinned when no `templateId`; stale remembered id → default + `X-Document-Template-Missing: true`; file name sanitised; cross-organisation (sales rep) and cross-channel refusals (SC-005); `quote.version` unchanged (FR-010); every quote status exportable (Q3)
- [ ] T039 [US1] Implement Q1–Q3 in `QR/src/backend/routes.admin.ts` (port resolved per request, no probe, no `catch`) and `documentTemplateId` on the admin reply (`rfq-service.ts`; customer allow-list untouched) — T038 green
- [ ] T040 [US1] Re-record the OpenAPI baseline (`backend/test/fixtures/openapi-baseline.json`) for Q1–Q3 and route 2's response; run the kernel OpenAPI test

### Admin

- [ ] T041 [P] [US1] Write `admin/test/modules/quote_requests/pdf-dialog.test.tsx` (`<StrictMode>`, `axe-core`) — red: button absent while `document_templates` is not present; preselection rules; language list follows the template; `templateId` sent only when the selection differs from what no choice would use; built-in with a remembered template calls Q2 `null` first; missing-template warning; fallback toast on the header; busy and error states; *Manage PDF templates* only with `document_templates:read`
- [ ] T042 [US1] Implement `QR/src/admin/components/QuoteRequestPdfDialog.tsx` and the *Export PDF* action in `RfqDetail.tsx`; bundle keys (en + pl) — T041 green; `i18n:hardcoded`

---

## Phase 6: User Story 4 — detail row, totals, grouping (P2)

- [ ] T043 [US4] Extend `DT/src/backend/rendering/items-table.test.ts` — red: detail row entries by rule over the item, `label: value` joined by separator, no row when nothing prints, `colSpan`; totals rows by rule over the summary, labels, emphasis, separate right-aligned unbreakable table; grouping in first-appearance order, empty-value label, header rows, subtotals with `sumDocumentValues` (money of one currency; mixed → empty), `row.number` not restarted per group
- [ ] T044 [US4] Implement in `items-table.ts` (detail row keep-together via `pageBreakBefore` as a SHOULD, noted in the code) — T043 green
- [ ] T045 [US4] Contract case in `pdf-export.test.ts`: SC-008 reference set (discounted / not, priced / unpriced, packaging, notes, attributes, 1 and 120 lines) — the collection's `netTotal` equals `summarize()`'s `totalAtAgreedPrice` for the same quote (`null` together), and `grossTotal` = net × (1 + taxRate) rounded

---

## Phase 7: User Stories 5 and 6 — languages and channels (P2)

- [ ] T046 [P] [US5] Contract cases: export in `pl-PL` and `en-US` with a two-language template (labels, money and date formats); a language the template lacks → closest (152 chain); built-in layout in both languages
- [ ] T047 [P] [US6] Contract cases: channel-B default used for a channel-B quote, global for channel A, channel-B template never offered nor accepted for channel A; `null`-channel quote → global only

---

## Phase 8: Off-states (FR-060, FR-061, SC-006)

- [ ] T048 Extend `backend/test/contract/document_templates/off-state.test.ts` and `pdf-export.test.ts`: `document_templates` deactivated while platform-available → Q1–Q3 503 `MODULE_DISABLED`, remembered ids kept, back on → unchanged; `quote_requests` deactivated → type, blocks, templates absent from the facility API, rows kept, back on → unchanged; the admin presence case is T041

---

## Phase 9: Polish and cross-cutting

- [ ] T049 [P] Docs: `QR/docs/quote_requests.md` (exporting a quote, remembered template, fields and their meaning incl. internal fields and the VAT-from-net-total note) and `DT/docs/document-templates.md` (Line items table: columns, rules, detail row, totals, grouping; adopting it as a type author); Polish pages under `docs/i18n/pl/` per `specs/conventions/module-documentation.md`; `pnpm --filter backend run check:docs-translations`
- [ ] T050 [P] Bench `backend/test/perf/quote_requests/pdf-export.bench.ts` — 200-line quote p95 < 5 s (SC-003); declare its tier as the 152 bench does
- [ ] T051 Changesets: `@endora-commerce/contracts` (minor), `document_templates` (minor), `quote_requests` (minor) — bodies checked against `specs/conventions/commercial-data.md`
- [ ] T052 Regenerate and commit: `pnpm --filter backend run composer:generate`, `manifests:generate` if a `package.json` body changed, `pnpm install --lockfile-only`
- [ ] T053 Verification: `pnpm run build:packages`; `pnpm -r run typecheck`; `pnpm -r run lint`; `pnpm --filter backend run test:unit:fast`; `pnpm --filter backend exec vitest run test/contract/document_templates test/contract/quote_requests test/integration/quote_requests test/contract/admin_users/permission-inventory.test.ts test/unit/_i18n/registered-bundles-shape.test.ts`; `pnpm --filter '!backend' run test`; `pnpm run check:naming && pnpm run check:language`; `pnpm --filter backend run check:module-boundary`, `check:port-dependencies`, `check:port-catches`, `check:entry-presence`, `check:action-route-permissions`, `i18n:hardcoded`; grep `backend/test/**` for the deleted fixture once more
- [ ] T054 Walk `quickstart.md` §0–§8 and record the result in the MR

---

## Dependencies & execution order

- Phase 2 blocks everything. Within it: T003–T005 → T006–T009 → T010–T013 → T015–T019; T014 any time.
- Phase 3 (US3) backend T020–T022 needs Phase 2; the admin editor T023–T024 needs T005 and T019.
- Phase 4 (US2) needs T022 (catalogue) and Phase 2; T031 needs T029.
- Phase 5 (US1) needs Phase 4 (the type must exist to render); T038 needs T033, T035, T037.
- Phases 6–8 need Phase 5. Phase 9 last.

## Parallel opportunities

T003 ∥ T004; T008 ∥ T010; T020 ∥ T021 ∥ T023; T025 ∥ T030; T034 ∥ T036 ∥ T041; T046 ∥ T047; T049 ∥ T050.

## Implementation strategy

MVP = Phase 2 + US3 + US2 + US1 (a quote exported with a remembered template and a configurable
table). US4–US6 add the block options and the scope proofs; the off-state phase and the polish are
required before merge.
