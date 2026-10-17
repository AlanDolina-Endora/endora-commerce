# Implementation Plan: Document templates — comparison PDF template, invoice templates moved

**Branch**: `feat/152-compare-pdf-template` | **Date**: 2026-10-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/152-compare-pdf-template/spec.md` — clarified by the
owner on 2026-10-17 (Q1–Q7; Q1 extended: invoice templates move in this feature). The five questions
the extension raised (N1–N5) were answered the same day: **N1 — fix it now** (the invoice e-mail
attachment uses the same template resolution as the download), N2–N5 the recommended defaults. The
section *Owner answers to N1–N5* below records what each answer put into this plan.

## Summary

The storefront comparison PDF — a hard-coded, English-only `pdfmake` layout inside `comparisons`
(research R-1) — becomes a Page Builder template, and **invoice templates move onto the same
facility** with their output unchanged (R-2, R-4). With evidence and rejected alternatives in
[research.md](./research.md):

- **A new switchable module `document_templates`** (R-3): two tables (templates; import markers), seven
  Commands, the admin API and screens, the Puck→pdfmake engine, six general-purpose blocks.
- **Each document type has its own blocks** (R-6): a type's palette is exactly its own blocks, the blocks
  contributed to it through its host, and the general-purpose blocks only if it opts in. The comparison
  opts in; invoices do not.
- **Several templates per type and scope, one default; per-document selection declared per type**
  (R-8, R-23). The render port takes an optional `templateId`; comparison and invoice are
  `default_only`; quote requests will be `per_document`.
- **Hosts register types and pass their own data** (R-5). `comparisons` degrades without the facility
  (its fixed renderer); `invoices` binds it (R-27, N2).
- **Invoices become an ordinary document type** (R-25, revised after owner answer P1): their ten
  section builders are the type's block renderers, the seeded generic layout is the type's built-in
  layout, and `prepareRender` carries the contributed-block data and the KSeF-number rule. PDF
  appearance need not match the old renderer (P1); behavioural tests prove the required content.
- **Invoice data moves by a one-time pull import owned by `document_templates`**, reading through a
  function `invoices` supplies over its own table, recorded in an import-marker table so it happens once
  and never resurrects deletions (R-24). Role grants keep invoice-template editors able to edit (R-28,
  N3). Old admin routes redirect; the old API is withdrawn (R-29, N4).
- **The invoice e-mail attachment follows the template** (R-26, N1): the dispatcher renders through the
  same `documentRenderPort` call as the download, so one invoice has one layout on every path. The
  only intentional output change for invoices; announced in the invoices release note.
- **The comparison PDF finally speaks the buyer's language** (R-9, R-18). No new runtime dependency, no
  cache, no domain event, one migration.

## Technical Context

**Language/Version**: TypeScript 5.x `strict`, Node.js ≥ 22.17, ESM
**Primary Dependencies**: Fastify, MikroORM (PostgreSQL), Zod, `pdfmake` (backend); React 19 + Vite + react-router-dom 7 through `@endora-commerce/admin-kit`, `@puckeditor/core`, `@endora-commerce/page-builder-core`, `@endora-commerce/page-builder-admin` (admin); Next.js 15 App Router (storefront) — **no new runtime dependency**
**Storage**: PostgreSQL — two new tables `document_templates` and `document_template_imports` owned by `document_templates`, one migration; `invoice_templates` kept read-only and imported at runtime; no column added elsewhere
**Testing**: Vitest — co-located `*.test.ts` in `packages/modules/{document_templates,comparisons,invoices}/src/**`
`backend/test/contract/document_templates/`, `backend/test/contract/comparisons/`,
`backend/test/integration/{document_templates,invoices}/`; `backend/test/perf/` benches for SC-003;
`admin/test/modules/{document_templates,comparisons,invoices}/` (`<StrictMode>`, `axe-core`);
`storefront/test/`
**Target Platform**: Linux server; admin SPA and storefront in evergreen browsers
**Project Type**: web application — monorepo (`backend/`, `admin/`, `storefront/`, `packages/`)
**Performance Goals**: 16-product comparison export p95 < 5 s and ≤ +0.5 s vs today; built-in preview
p95 < 3 s; invoice PDF within 10 % of today; template resolution ≤ 2 indexed reads; import check O(1)
after the first success per process
**Constraints**: content ≤ 512 KiB, ≤ 200 nodes/language, ≤ 10 languages, ≤ 20 core images/language
(R-20, not applied to imported legacy rows); pdfmake URL access denied; invoice PDFs carry the required
content (SC-008, behavioural — owner answer P1)
**Scale/Scope**: new module (2 tables, 7 Commands, 12 admin routes, 2 permissions, 1 action, 1 nav
entry, 2 pages, 6 core blocks, 1 setting); `comparisons` (3 blocks, 1 registration, 1 route changed, 3
admin block contributions, 1 link); `invoices` (1 registration, 3 render paths re-pointed, 10 admin
block contributions moved, 2 redirect routes, 5 API routes and 2 pages removed, manifest blocks gain
fields, 1 action removed, 2 dependencies added); contracts (1 new file, 2 enum widenings, 2 data
schemas); page-builder-core (1 context, 1 type); storefront (3 files); `_i18n` (~29 keys removed); docs
(new module page × 2 languages; comparisons and invoices pages × 2 languages)

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design (revision 2) — same verdict.*

| Principle | Verdict | How the design meets it |
| --- | --- | --- |
| **I. Modular architecture (NN)** | Pass | Each table is touched only by its owner: `document_templates` writes its two tables; `invoices` reads its own `invoice_templates` inside its `legacyImport.read`; `admin_roles` writes roles through its own port. Cross-module seams are contracts-typed: the registry push, the render port, `adminRolePort`, `assetReadPort`, kernel `salesChannelResolutionPort`/`resolvedModuleRegistry`. `ksef` (external) keeps its `invoicePdfBlockRegistry` contract unchanged. |
| **II. API-first** | Pass | `packages/contracts/src/document-templates.ts`, `comparisonDocumentDataSchema`, `InvoiceDocumentData` first. Two additive enum widenings. The withdrawal of `/api/v1/admin/invoice-templates*` is a breaking change, **versioned**: major changeset for the invoices package, OpenAPI baseline updated, release note (N4). |
| **III. TDD (NN)** | Pass | Tests precede implementation in [tasks.md](./tasks.md); invoice goldens are captured from today's code **before** any invoice change; § *Requirement → test* maps every FR/SC. |
| **IV. YAGNI** | Pass | No dependency, cache, event, seed rows, version history or reversible Commands. Hooks added to the registration are each required by the invoice parity (R-25), not speculative. |
| **V. TypeScript** | Pass | Zod at every boundary and on stored content. |
| **VI. Naming (NN)** | Pass | `document_templates`, `document_template_imports`, `/document-templates`, `document_templates:read|write`, `document_template.<verb>`, block names `<module>.<PascalCase>`, JSON camelCase. |
| **VII. SEO, performance** | Pass | Storefront stays SSR; perf budgets are tests. |
| **VIII. English (NN)** | Pass | Polish only in bundles, the Polish docs tree, and the per-language built-in layout map. |
| **IX. UI reuse** | Pass | Editor = the invoice editor's chrome generalised; invoice canvas renderers reused as contributions. |
| **X. Queue consumers** | N/A | Rendering and the import are request/boot-bounded; no repeatable work. |
| **XI. Tenancy (NN)** | Pass | Both tables `@GlobalEntity()`. Host data built under the requester's context. The import runs under `enterSystemScope`/`withSystemScope` with a stated reason (D-285 surface). |
| **XII. Channel scoping (NN)** | Pass | Default resolution by resolved channel id; null channel never matches; explicit `templateId` refused outside global/own channel. Cross-channel tests for comparison and invoice. |
| **XIII. Command Bus (NN)** | Pass | Seven Commands incl. `document_template.import`; invoices' hand-written `recordAuditFromContext` disappears with `InvoiceTemplateService`. |
| **XIV. Entity-agnostic extensibility** | Pass | The core stores types and content opaquely; invoice specifics (KSeF rule, amount in words, logo URLs, role codes) live in invoices' registration hooks. Invoices converge by **adapter**, not rewrite: section builders untouched. |
| **XV. Overlay** | Pass | An overlay module can register a type; nothing in core changes (US6). |
| **XVI. Palette** | Pass | `open-document-templates` with invoice keywords; `invoice-templates` removed with its route. |
| **XVII. Toggleable (NN)** | Pass | Facility switchable; comparisons degrade; invoices bind (switch refused while invoicing is on — honest, N2); host off → type invisible, rows kept; import deferred and convergent; off-state tests for all three. |

## Project Structure

### Documentation (this feature)

```text
specs/152-compare-pdf-template/
├── spec.md  plan.md  research.md  data-model.md  quickstart.md  tasks.md
├── checklists/requirements.md
└── contracts/
    ├── document-type-registry.md   # registry, port, hooks, import execution
    ├── document-templates-api.md   # admin HTTP
    ├── comparison-document.md      # comparisons' type, export route, storefront
    ├── invoice-document.md         # invoices' type, import, parity, redirects
    └── admin-ui.md                 # screens, editor, palette, i18n keys
```

### Source code (repository root)

```text
packages/contracts/src/
├── document-templates.ts (+ .test.ts)      # NEW
├── cms.ts                                  # pageBuilderContextSchema += 'document'
├── admin-contributions.ts                  # AdminBlockContributionSchema.context += 'document'
├── comparisons.ts                          # += comparisonDocumentDataSchema
├── invoices.ts                             # += InvoiceDocumentData
└── errors.ts                               # += 6 DOCUMENT_* codes

packages/page-builder-core/src/contributions/{types.ts, document-sample.tsx}
packages/admin-kit/src/zones/use-block-contributions.ts

packages/modules/document_templates/        # NEW MODULE
├── i18n/{en,pl}.json   docs/document-templates.md
└── src/
    ├── manifest.ts
    ├── migrations/<stamp>_document_templates_init.ts
    ├── backend/
    │   ├── index.ts
    │   ├── entities/{document-template,document-template-import}.entity.ts
    │   ├── registry/document-type-registry.ts
    │   ├── commands/document-template-commands.ts
    │   ├── services/{document-template-service,template-resolver,builder-descriptor,legacy-import}.ts
    │   ├── rendering/{document-renderer,core-blocks,merge-fields,embed-asset-images}.ts
    │   └── routes.admin.ts
    └── admin/
        ├── index.ts  api/document-templates-client.ts
        ├── pages/{DocumentTemplatesPage,DocumentTemplateEditor}.tsx
        ├── components/{NewTemplateDialog,MergeFieldsPanel,LanguageSwitcher}.tsx
        └── blocks/core-block-editors.tsx

packages/modules/comparisons/
├── src/manifest.ts  src/backend/{index.ts,routes.public.ts}
├── src/backend/document/{comparison-document-type,comparison-document-data,built-in-layout,sample-comparison}.ts
├── src/backend/document/blocks/{header,table,share-link}.ts
├── src/backend/services/{comparison-pdf-shared.ts, comparison-pdf-renderer.ts (output unchanged)}
├── src/admin/{index.ts, document-blocks/*.tsx, pages/ComparisonsListPage.tsx}
└── i18n/  docs/comparisons.md

packages/modules/invoices/
├── src/manifest.ts                         # deps += document_templates, admin_roles; blocks gain fields; action removed
├── src/backend/index.ts  plugin.ts  routes.admin.ts  routes.customer.ts
├── src/backend/document/{invoice-document-type,legacy-import,block-renderers}.ts
├── src/backend/services/invoice-pdf-renderer.ts  # no longer a render path (every path, e-mail included, goes through the port — N1); deleted once nothing calls it
├── src/backend/services/invoice-email-dispatch.ts # attachment through documentRenderPort (N1)
├── src/backend/services/invoice-template-service.ts   # DELETED
├── src/backend/pdf-components/descriptor.ts           # DELETED (fields → manifest)
├── src/admin/{index.ts (redirect routes + block contributions), components/InvoiceSectionTabs.tsx}
├── src/admin/document-blocks/*.tsx         # canvas renderers moved from templates/invoice-puck-config.tsx
├── src/admin/pages/{InvoiceTemplatesPage,InvoiceTemplateEditor}.tsx   # DELETED
├── src/admin/templates/{described-blocks,invoice-builder-plugin}.tsx  # DELETED
└── i18n/  docs/invoices.md
packages/modules/_i18n/i18n/{en,pl}.json    # invoiceTemplates.* removed
packages/modules/cms/src/backend/cli/block-names.ts   # += document_templates.content

storefront/{lib/api/comparisons.ts, lib/i18n/messages.ts, components/ComparisonTable.tsx, app/compare/page.tsx}

backend/test/contract/document_templates/{admin-api,render-port,second-type,off-state}.test.ts
backend/test/contract/comparisons/pdf-template-export.test.ts
backend/test/integration/document_templates/{schema,tenancy-channel,default-race}.test.ts
backend/test/integration/invoices/{template-import,template-rendering,off-state,templates,stored-contributed-block}.test.ts
backend/test/integration/_admin_surfaces/batch-twelve-palette-off-state.test.ts   # updated
backend/test/fixtures/{openapi-baseline.json (updated), document-types/fixture-document-type.ts}
backend/test/perf/{comparisons/pdf-export,invoices/pdf-render}.bench.ts
admin/test/modules/{document_templates/*, comparisons/pdf-template-link.test.tsx, invoices/*}
docs/docs/module-reference/{document-templates,invoices,comparisons}.md (+ pl)
.changeset/*.md
```

Regenerated and committed in the same MR: `composer:generate`, `manifests:generate`,
`pnpm install --lockfile-only`.

**Structure Decision**: one new module, extensions of `comparisons` and `invoices`, additive changes
to three shared packages, three storefront files.

## Module manifest — `document_templates` (design)

- `dependencies`: `settings`, `auth`, `assets_library` (`nonDeactivatable`). Kernel registrations
  (`salesChannelResolutionPort`, `resolvedModuleRegistry`, `commandBus`) need no edge.
- `settings`: `document_templates.enabled` (boolean, default `true`); `activation` switchable.
- `permissions`: `document_templates:read`, `document_templates:write` (`requires: ['document_templates:read']`).
- `actions`: `open-document-templates`. `blocks` (6, `contexts: ['document']`) + `blockCategories`.
- `errorCodes`: six `DOCUMENT_*` codes. `i18n`, `docs`.

## Composition — `document_templates/src/backend/index.ts` (design)

```text
ctx.di.register({
  documentTypeRegistry:     singleton(new DocumentTypeRegistry(id => effectiveState.isPresent(id))),  // ungated
  documentLegacyImporter:   singleton(new LegacyImporter(emFactory, commandBus, registry,
                                       lazyPort(ctx,'salesChannelResolutionPort'))),
  documentTemplateService:  singleton(new DocumentTemplateService(emFactory, commandBus, registry, importer, …)),
})
ctx.di.providePort('documentRenderPort', singleton(new DocumentRenderer(emFactory, registry, importer,
                                       lazyPort<AssetReadPort>(ctx,'assetReadPort'), resolvedModuleRegistry)))
ctx.onBoot(async () => {                     // WORK hook: probes its own presence first (entry-presence rule)
  if (!effectiveState.isPresent('document_templates')) return
  await enterSystemScope('document templates legacy import', () => importer.importAllPending())
})
ctx.routes(app => registerDocumentTemplatesAdminRoutes(app, { requireAdmin, … }))
```

The boot hook is work-only (no contribution in it), so the split rule of `module-activation.md` is
satisfied trivially; it runs after every module's contribution hook has registered (D-45: one boot
phase — order inside it is the reason `importAllPending` also runs lazily).

## Migration plan

| Step | Owner | Mechanism |
| --- | --- | --- |
| Create `document_templates`, `document_template_imports`, indexes, check, FK to kernel `sales_channels` | `document_templates` | one schema migration (`migration:new`) |
| Copy invoice templates | `document_templates` writes; `invoices` reads its own table in `legacyImport.read()` | runtime import, once per `(type, source)`, boot + lazy, one audit row (research R-24) |
| Role grants | `admin_roles` writes, called by `invoices`' `afterImport` | `adminRolePort.upsertByCode`, idempotent, inside the import's lifetime (R-28) |
| Legacy table | `invoices` | untouched, no writer left; drop in a later release |

Migration order is derived: `invoices` → depends on `document_templates`, so `document_templates`'
migration runs first. No migration reads or writes another module's table (`check:module-boundary`
R1/R2 clean).

## Cross-cutting concerns

| Concern | Design |
| --- | --- |
| Admin permissions | `document_templates:read/write`; invoices' role continuity by one-time grant (N3) |
| Command palette | `open-document-templates` incl. invoice keywords; `invoice-templates` removed |
| pl + en | both bundles of three modules; `_i18n` keys removed; comparison built-in layout per language; storefront strings; docs pl + en |
| Settings | activation only; no secret; share link reads `sales_channels.storefront_url` |
| Auditing | seven Commands (R-13) |
| Tenancy / channels | R-15 |
| Redis cache invalidation | none needed — no cache (R-14) |
| Module activation | facility switchable; comparisons degrade; invoices bind; import convergent |

## Owner answer P1 (2026-10-17, third round)

PDF appearance need not stay identical — nobody uses invoice or comparison templates in production.
Golden parity (T009/T055/T059 as first written) is dropped and replaced by behavioural tests of the
required invoice content; the invoice move may re-express sections as invoice-type blocks; the import,
redirects and N2–N4 stay. The invoices release note says the PDF layouts can change.

## Owner answers to N1–N5 (2026-10-17)

| Question | Answer | What it puts into this plan |
| --- | --- | --- |
| N1 | **fix it now** — the attachment uses the template (departs from the proposed default) | `invoice-email-dispatch.ts` renders through `documentRenderPort` with exactly the download's input (FR-093); `InvoicePdfRenderer` loses its last render caller. Tested by asserting the attachment is rendered with exactly the download's input (T059a). The invoices changeset (major already, N4) says e-mailed invoice PDFs now follow the configured template |
| N2 | default — refused while invoicing is on | `document_templates` in `invoices`' `dependencies`; off-state test asserts the refusal |
| N3 | default — one-time audited grant | `legacyImport.afterImport` through `adminRolePort`; `admin_roles` in `invoices`' `dependencies` |
| N4 | default — withdraw now | five routes removed; major changeset + release note; OpenAPI baseline updated |
| N5 | default — Polish only | `languages: ['pl-PL']`; no language switcher in the invoice editor |

## Complexity Tracking

No constitution violation; **no new runtime dependency**. Choices that add surface:

| Choice | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| New module | XIV; three named hosts; one screen for all documents (R-3) | per-host copies |
| `document` Page Builder context | keeps new blocks out of CMS/e-mail palettes (R-6) | a context per type grows the enum per host |
| Runtime import + marker table | the only shape keeping both tables' ownership rules on upgrade (R-24) | cross-module migrations are refused by R1/R2; install hooks do not run on upgrade |
| Registration hooks (`prepareRender`, `renderBuiltIn`, `pageDefaults`, `blocks()`) | contributed invoice blocks and the KSeF-number rule need per-render data; page geometry is per type (R-25) | hard-coding invoice knowledge into the engine (XIV) |
| Breaking removal of the invoice-template API | moving ownership without dual write paths (R-29) | adapters keep two management APIs alive (offered as N4's alternative) |

## Handoff summary for `endora-commerce-dev`

1. Read research R-3–R-8, R-23–R-31 and all five contracts first; implement **test-first** in
   `tasks.md` order. (The golden-parity capture of the first revision was dropped by owner answer P1;
   behavioural invoice tests replace it.)
2. Contracts first; scaffold with `migration:new`; never hand-number; regenerate and commit artefacts.
3. Every write is a Command; the import runs as one under a system scope.
4. `comparisons`: probe presence before `documentRenderPort`; fixed renderer output unchanged.
   `invoices`: binds the facility; section builders untouched; the e-mail attachment renders through
   the port exactly like the download (N1 — owner's answer).
5. Deleting invoice files and routes: grep `backend/test/**`, admin tests, the OpenAPI baseline,
   `_i18n` bundles and `cms`' block-names CLI in the same MR (`AGENTS.md` traps); re-derive the
   module-removal ledger if it reports.
6. Changesets: contracts, page-builder-core, admin-kit, comparisons, invoices (**major** — withdrawn
   API, and e-mailed invoice PDFs now follow the configured template), the new module.
7. Verify per T075; walk `quickstart.md` before merge.
