# Implementation Plan: Quote request PDF export with a per-quote template and a configurable line-items table

**Branch**: `feat/153-quote-request-pdf-template` | **Date**: 2026-10-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/153-quote-request-pdf-template/spec.md` — owner decisions
D1–D3 fixed; the owner answered Q1–Q7 on 2026-10-17 (spec *Clarifications*): the recommended defaults
for Q1–Q3 and Q5–Q7, and for Q4 a *Send PDF to customer* action (research R-27). The section *Owner
answers and what they changed* records the effect of each.

## Summary

A sales representative exports a quote request to PDF from its admin screen, choosing one of the quote
templates that apply to the quote's channel (default preselected, choice remembered on the quote), in a
chosen language. Quote templates are designed in *Document templates* — the facility of
`specs/152-compare-pdf-template/` — with quote blocks, the general-purpose blocks, and a new
**Line items table** whose columns the template defines. With evidence and rejected alternatives in
[research.md](./research.md):

- **The configurable table is the facility's** (R-3): a new block `document_templates.ItemsTable`
  bound to a **line collection** a document type declares — field catalogue, items, totals (R-4). A
  host adopts it by declaring data, never by writing a renderer or an editor. Offered iff the type
  declares a collection.
- **Typed values, one formatter, one rule model** (R-5, R-6): `DocumentValue`, `formatDocumentValue`,
  `evaluateDocumentCondition` (always / never / has_value / any_has_value over a scope that already
  has an item level) live as pure functions in `@endora-commerce/contracts`, shared by the PDF renderer
  and the editor canvas.
- **pdfmake table** with repeated header row, unbreakable rows, detail rows, grouping with subtotals,
  totals table (R-8, R-9).
- **`quote_requests` registers `quote_requests.quote_request`** (R-10): `per_document`, all core blocks,
  four quote blocks, collection `lines` with the catalogue derived from the real data (R-1, R-11),
  built-in layout in `en-US`/`pl-PL`.
- **The chosen template is remembered** on `quote_requests.document_template_id` through one audited
  Command, without touching the offer's version (R-13). The picker list comes from a new port member
  `documentRenderPort.listChoices`, so representatives need no template-management permission (R-14).
- **`refuses-without`** edge: while document templates are off, export is unavailable and hidden (R-16).
- **The repeater is parked, its prerequisites are not** (R-23): collections, field paths, scoped
  conditions and the reserved `{{item.<path>}}` grammar.
- **Send PDF to customer** (owner answer Q4, R-27): route Q4 renders as the export does and sends the
  operator-editable transactional e-mail `quote_request_pdf` with the PDF attached to 1–5 recipients
  through an audited Command `quote_request.send_document`, recorded as a `pdf-sent` history event.
- The 152 test-only stand-in is replaced by the real type (R-24). No new runtime dependency, no cache,
  no domain event; two migrations (the remembered template column, the `pdf-sent` event type).

## Technical Context

**Language/Version**: TypeScript 5.x `strict`, Node.js ≥ 22.17, ESM
**Primary Dependencies**: Fastify, MikroORM (PostgreSQL), Zod, `pdfmake` (backend); React 19 + Vite through `@endora-commerce/admin-kit`, `@puckeditor/core`, `@endora-commerce/page-builder-core` (admin) — **no new runtime dependency**
**Storage**: PostgreSQL — one nullable column `quote_requests.document_template_id` owned by `quote_requests` (one migration, no FK); `qre_event_type_check` widened by `pdf-sent` (one migration); Line items table settings inside the existing `document_templates.content` jsonb
**Testing**: Vitest — co-located `*.test.ts` in `packages/contracts/src`, `packages/modules/{document_templates,quote_requests}/src/**`; `backend/test/contract/{document_templates,quote_requests}/`; `backend/test/integration/quote_requests/`; `backend/test/perf/quote_requests/pdf-export.bench.ts`; `admin/test/modules/{document_templates,quote_requests}/` (`<StrictMode>`, `axe-core`)
**Target Platform**: Linux server; admin SPA in evergreen browsers
**Project Type**: web application — monorepo (`backend/`, `admin/`, `packages/`)
**Performance Goals**: 200-line quote export p95 < 5 s; dialog data (route Q1) p95 < 300 ms; render reads ≤ 2 indexed template rows + one read per data port
**Constraints**: send: 1–5 recipients, message ≤ 2000, PDF ≤ 10 MiB, 10 sends / admin / minute; ItemsTable 1–16 columns, ≤ 8 detail entries, ≤ 10 totals; 152 content limits unchanged; pdfmake URL access denied; quote data built under the requesting admin's visibility
**Scale/Scope**: `document_templates` (1 block, 1 category, registration member `collections`, port member `listChoices`, route 2 extended, ~6 new source files, 1 admin custom-field set); `quote_requests` (1 document type, 4 blocks, 1 collection, 2 Commands, 4 routes, 2 migrations, 1 transactional e-mail, 1 dialog in two modes, 4 canvas renderers); contracts (2 files extended); docs (2 module pages × 2 languages); tests replaced: 1 fixture

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design — same verdict.*

| Principle | Verdict | How the design meets it |
| --- | --- | --- |
| **I. Modular architecture (NN)** | Pass | `document_templates` owns the block, the collection contract, the renderer and the editor; `quote_requests` owns its type, data, column, Command and routes. Seams: the registry push and the gated `documentRenderPort` (now with `listChoices`). No table read across modules; no FK to `document_templates`. All data ports used by the builder are already in `quote_requests`' `dependencies`. |
| **II. API-first** | Pass | `CT/document-templates.ts` (collections, values, conditions, `itemsTablePropsSchema`, `DocumentTemplateChoices`) and `CT/quote-requests.ts` (`QuoteRequestDocumentData`, `QuoteRequestDocumentChoices`, `documentTemplateId` on the admin reply) first. Additive only; OpenAPI baseline re-recorded for the three routes and route 2's response. |
| **III. TDD (NN)** | Pass | [tasks.md](./tasks.md) puts every failing test first; § *Requirement → test* below maps FR/SC to tests. |
| **IV. YAGNI** | Pass | No dependency, cache, event, permission or setting. Four condition ops (the ones used). Storefront `audience` enforcement and the repeater are designed, not built (R-23, R-26). |
| **V. TypeScript** | Pass | Zod at the routes, on stored ItemsTable props, on the remembered id. |
| **VI. Naming (NN)** | Pass | `document_templates.ItemsTable`, `quote_requests.quote_request`, `quote_requests.Quote*`, `document_template_id`, `quote_request.set_document_template`, `/quote-requests/:id/pdf`, camelCase JSON. |
| **VII. SEO, performance** | Pass / N/A | Admin-only surface; perf budget is a bench. |
| **VIII. English (NN)** | Pass | Polish only in bundles, the Polish docs tree, and the per-language text maps. |
| **IX. UI reuse** | Pass | `ModalDialog`, `Select`, `useReorderList` + `TouchReorderButtons` + `ReorderAnnouncer`, the 152 editor and canvas idioms. |
| **X. Queue consumers** | N/A | Export is request-bounded; nothing repeatable. |
| **XI. Tenancy (NN)** | Pass | Column on the `@OrgScoped` quote row; data built under the admin's visibility (sales-rep scope); templates stay `@GlobalEntity` configuration. Cross-organisation tests. |
| **XII. Channel scoping (NN)** | Pass | `listChoices`, the Command and `render` accept global or same-channel templates only; null channel → global only. Cross-channel tests. |
| **XIII. Command Bus (NN)** | Pass | Remembering is `quote_request.set_document_template` with before/after audit and `skipAudit` on no change; sending is `quote_request.send_document` (audit: template, language, recipients — no bytes); template writes stay the facility's Commands; a download is a read (Q6). |
| **XIV. Entity-agnostic extensibility** | Pass | The facility stays opaque to host data: it formats typed values a host declares; product attributes reach the PDF as catalogue fields, not bespoke columns. |
| **XV. Overlay** | Pass | An overlay module can declare a collection on its own type and get the table (SC-007). |
| **XVI. Palette** | Pass | `open-document-templates` gains quote keywords; the quote surface keeps `open-rfq-inbox`. |
| **XVII. Toggleable (NN)** | Pass | `refuses-without` for the render port (export and send hidden and refused while the facility is off, choices kept); `contributes-to` for the registry (type invisible while quotes are off, rows kept); `transactional_emails` is a binding dependency but `nonDeactivatable`, so it makes no switch dead — its per-e-mail switch refuses the send (409); off-state tests for every direction. |

## Project Structure

### Documentation (this feature)

```text
specs/153-quote-request-pdf-template/
├── spec.md  plan.md  research.md  data-model.md  quickstart.md  tasks.md
├── checklists/requirements.md
└── contracts/
    ├── document-collections.md      # facility: collections, ItemsTable, listChoices, reservations
    ├── quote-request-document.md    # quote type, routes, Command, manifest, off-states
    └── admin-ui.md                  # export dialog, table editor, i18n keys
```

### Source code (repository root)

```text
packages/contracts/src/
├── document-templates.ts (+ .test.ts)   # collections, values, conditions, ItemsTable props, choices, pure fns
└── quote-requests.ts (+ .test.ts)       # QuoteRequestDocumentData, QuoteRequestDocumentChoices, documentTemplateId

packages/modules/document_templates/
├── src/manifest.ts                      # += ItemsTable block, `data` category, palette keywords
├── src/backend/registry/document-type-registry.ts (+ test)   # collections validation, palette rule
├── src/backend/rendering/items-table.ts (+ test)             # NEW — the table renderer
├── src/backend/rendering/document-renderer.ts (+ test)       # catalogue load, ItemsTable dispatch
├── src/backend/services/content-validation.ts                # ItemsTable props at save
├── src/backend/services/document-template-service.ts         # route 2 collections + samples
├── src/backend/services/template-resolver.ts (+ test)        # listChoices query
├── src/backend/services/builder-descriptor.ts (+ test)       # collection blocks in the descriptor
├── src/admin/blocks/items-table/{canvas,ColumnsField,DetailRowField,TotalsField,GroupingField,FieldPicker,collections-context}.tsx   # NEW
├── src/admin/blocks/core-block-editors.tsx                   # registers the ItemsTable editor
├── src/admin/pages/DocumentTemplateEditor.tsx                # DocumentCollectionsProvider
├── i18n/{en,pl}.json   docs/document-templates.md

packages/modules/quote_requests/
├── src/manifest.ts                      # blocks, category, two nonBindingDependencies
├── src/migrations/<stamp>_quote_requests_quote_request_document_template.ts   # via migration:new
├── src/backend/entities/quote-request.entity.ts             # documentTemplateId
├── src/backend/index.ts                 # contribution hook, builder, routes
├── src/backend/document/{quote-request-document-type,quote-lines,data-builder,texts,built-in-layout,sample}.ts (+ tests)   # NEW
├── src/backend/document/blocks/{header,parties,notes,details}.ts (+ test)               # NEW
├── src/backend/commands/document-template-commands.ts (+ test)                          # NEW — remember + send
├── src/backend/email-templates/quote-pdf-defaults.ts                                   # NEW — e-mail defaults en/pl
├── src/migrations/<stamp>_quote_requests_quote_request_event_pdf_sent.ts               # via migration:new
├── src/backend/services/history/history-projection.ts   # pdf_sent kind
├── src/backend/routes.admin.ts          # Q1–Q4
├── src/backend/services/rfq-service.ts  # admin reply documentTemplateId
├── src/admin/components/QuoteRequestPdfDialog.tsx   src/admin/pages/RfqDetail.tsx   src/admin/pages/RfqHistory.tsx
├── src/admin/document-blocks/{QuoteHeader,QuoteParties,QuoteNotes,QuoteDetails,canvas}.tsx   # NEW
├── src/admin/index.ts                   # block contributions (context 'document')
├── i18n/{en,pl}.json   docs/quote_requests.md

backend/test/contract/quote_requests/pdf-export.test.ts                         # NEW
backend/test/contract/quote_requests/pdf-send.test.ts                           # NEW (Q4)
backend/test/contract/document_templates/{second-type,admin-api,off-state}.test.ts   # re-targeted
backend/test/fixtures/document-types/fixture-document-type.ts                   # DELETED (R-24)
backend/test/integration/quote_requests/document-template-column.test.ts        # NEW (schema, tenancy)
backend/test/perf/quote_requests/pdf-export.bench.ts                            # NEW
backend/test/fixtures/openapi-baseline.json                                     # re-recorded
admin/test/modules/{quote_requests/pdf-dialog,document_templates/items-table-editor}.test.tsx
docs/i18n/pl/…/{quote_requests,document-templates}.md                            # Polish pages
.changeset/*.md
```

Regenerated and committed in the same MR: `composer:generate` (migration registry), `manifests:generate`
if any `package.json` body changes, `pnpm install --lockfile-only` beside it.

**Structure Decision**: no new module; extend `document_templates` (generic machinery) and
`quote_requests` (the type and the export), additive changes to `contracts`.

## Migration plan

| Step | Owner | Mechanism |
| --- | --- | --- |
| `alter table quote_requests add column document_template_id uuid null` | `quote_requests` | `pnpm --filter backend run migration:new -- --module quote_requests --name quote_request_document_template`; `composer:generate` |
| widen `qre_event_type_check` by `pdf-sent` | `quote_requests` | `migration:new -- --module quote_requests --name quote_request_event_pdf_sent`; `composer:generate` |

No migration in `document_templates` (settings live in jsonb). No cross-module FK, read or write
(`check:module-boundary` R1/R2 clean). Order derived from `dependencies` as usual.

## Composition (design)

`quote_requests/src/backend/index.ts`:

```text
ctx.di.register({ quoteRequestDocumentDataBuilder: singleton(new QuoteRequestDocumentDataBuilder({
    lazyPort<CatalogProductReadPort>(ctx,'catalogProductReadPort'), lazyPort<CatalogAttributeReadPort>(ctx,'catalogAttributeReadPort'),
    lazyPort<CustomFieldDefinitionReadPort>(ctx,'customFieldDefinitionReadPort'), lazyPort<SalesChannelResolutionPort>(ctx,'salesChannelResolutionPort'),
    organizations, customerAccounts, adminUsers, rfqAdminService … })) })
ctx.onBoot(() => {        // CONTRIBUTION-only, no presence probe (module-activation.md)
  lazyPort<DocumentTypeRegistryPort>(ctx, 'documentTypeRegistry').register(createQuoteRequestDocumentType({
    attributes: lazyPort<CatalogAttributeReadPort>(ctx, 'catalogAttributeReadPort') }))
})
ctx.routes(app => … Q1–Q3 with lazyPort<DocumentRenderPort>(ctx, 'documentRenderPort') resolved per request)
```

If `quote_requests` already has a contribution-only boot hook (admin search, webhooks), the push joins
it; it never joins a work hook.

## Cross-cutting concerns

| Concern | Design |
| --- | --- |
| Admin permissions | none new; `rfqs:handle` + visibility for Q1–Q4; `document_templates:read/write` unchanged |
| Transactional e-mail | `quote_request_pdf` declared in the manifest, defaults en + pl via `emailDefaultsPort` (contribution-only boot hook) |
| Command palette | `open-document-templates` keywords += quote words (FR-072) |
| pl + en | both bundles of both modules; `texts.ts` maps; built-in layout per language; docs pl + en |
| Settings | none (no secret, no knob) |
| Auditing | `quote_request.set_document_template`, `quote_request.send_document`; facility Commands unchanged |
| Tenancy / channels | R-19 |
| Redis cache invalidation | none needed — no cache (R-25) |
| Module activation | `refuses-without` + `contributes-to`; off-state tests (R-16) |

## Owner answers and what they changed

| Q | Owner answer (2026-10-17) | Effect on this plan |
| --- | --- | --- |
| Q1 storefront export | admin only (recommended) | none — no customer route, no `audience` render input (R-26 stays a design note) |
| Q2 remember choice | stored, audited, preselected (recommended) | none — column, Command `set_document_template`, route Q2 as designed |
| Q3 exportable states | every state (recommended) | none — no state guard |
| Q4 e-mail | **changed**: a *Send PDF to customer* action | R-27: route Q4, Command `send_document`, transactional e-mail `quote_request_pdf`, `pdf-sent` event type + migration, history kind `pdf_sent`, `requesterEmail` on the choices, dialog send mode, `transactional_emails` dependency, three error codes, US8 / FR-090–FR-099 / SC-009, tasks T055–T066 |
| Q5 language | chosen in the dialog (recommended) | none — the send uses the same language for the e-mail |
| Q6 export recorded | no audit for a download (recommended) | none — sending is audited (Q4), a download is not |
| Q7 internal fields | allowed with warning (recommended) | none |

## Requirement → test

| Requirement | Test |
| --- | --- |
| FR-001, FR-011, FR-060 | `admin/test/modules/quote_requests/pdf-dialog.test.tsx` |
| FR-002–FR-008, FR-010, SC-004 | `backend/test/contract/quote_requests/pdf-export.test.ts` |
| FR-005, FR-071 | `QR/src/backend/commands/document-template-commands.test.ts` |
| FR-009, SC-005 | `pdf-export.test.ts` (sales-rep scope, cross-channel) |
| FR-020–FR-024 | `QR/src/backend/document/quote-request-document-type.test.ts`, `blocks/*.test.ts` |
| FR-025–FR-029, SC-008 | `QR/src/backend/document/quote-lines.test.ts`, `data-builder.test.ts` |
| FR-030, FR-031, FR-080, SC-007 | `DT/src/backend/registry/document-type-registry.test.ts`, `rendering/document-renderer.test.ts` (test-only collection type) |
| FR-032–FR-037, FR-040–FR-042 | `DT/src/backend/rendering/items-table.test.ts`, `CT/document-templates.test.ts` |
| FR-043 | `DT/src/backend/services/content-validation.test.ts` |
| FR-044, FR-045 | `CT/document-templates.test.ts` (scopes), `DT/src/backend/rendering/merge-fields.test.ts` |
| FR-050, FR-051 | `backend/test/contract/document_templates/second-type.test.ts` (re-targeted) |
| FR-061, SC-006 | `backend/test/contract/document_templates/off-state.test.ts`, `pdf-export.test.ts` |
| FR-026, FR-032 (editor) | `admin/test/modules/document_templates/items-table-editor.test.tsx` |
| SC-003 | `backend/test/perf/quote_requests/pdf-export.bench.ts` |
| FR-090–FR-099, SC-009 | `backend/test/contract/quote_requests/pdf-send.test.ts`, `QR/src/backend/commands/document-template-commands.test.ts`, `QR/src/backend/services/history/history-projection.test.ts`, `admin/test/modules/quote_requests/pdf-dialog.test.tsx` |

## Complexity Tracking

No constitution violation; **no new runtime dependency**. Choices that add surface:

| Choice | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Facility-owned data-bound block + `collections` | D2 asks for reusable machinery; hosts cannot import facility code (R-3) | a quote-owned table renderer is not reusable without a shared renderer package |
| Pure formatter/condition functions in `contracts` | one behaviour for PDF and canvas (R-5) | two implementations disagree |
| `listChoices` on the render port | representatives pick without template-management rights (R-14) | requiring `document_templates:read` couples permission domains |
| `document_template_id` column without FK | D1 + Q2; survives template deletion (R-13) | a FK cascades or blocks deletes across modules |
| Synchronous send inside the request (≤ 5 e-mails) | Q4: the representative needs an honest, immediate answer (R-27) | a queue would need the PDF stored between request and worker and hides failures |

## Handoff summary for `endora-commerce-dev`

1. Read research R-3–R-16, R-23, R-24 and the three contracts first; implement **test-first** in
   `tasks.md` order. Contracts (`CT/`) before anything else; `pnpm run build:packages` after editing a
   package.
2. Facility first (Phase 2–3): collections, ItemsTable renderer, validation, `listChoices`, route 2 —
   proven by a test-only collection type **before** `quote_requests` registers anything.
3. Scaffold the migration with `migration:new`; never hand-number; regenerate and commit artefacts.
4. Every write is a Command; the remember Command follows `negotiation-policy-commands.ts`.
5. The boot push is contribution-only (no probe); the routes resolve the port per request (no probe,
   `refuses-without`); never `catch` around the port.
6. Deleting `fixture-document-type.ts`: grep `backend/test/**` for every importer in the same MR
   (`AGENTS.md` traps).
7. Changesets: contracts (minor), document_templates (minor), quote_requests (minor). Re-record the
   OpenAPI baseline.
8. Verify per the final task; walk `quickstart.md` before merge. Q1 and Q6 alternatives are not built
   (owner answers); Q4 is built as *Send PDF to customer* (R-27).
