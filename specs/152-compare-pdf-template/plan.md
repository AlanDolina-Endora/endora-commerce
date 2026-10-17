# Implementation Plan: Editable PDF template for the storefront product comparison

**Branch**: `feat/152-compare-pdf-template` | **Date**: 2026-10-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/152-compare-pdf-template/spec.md` (Draft — Q1–Q7 open;
this plan proceeds on the recommended default of each and says below what changes if an answer
differs).

## Summary

The storefront comparison PDF — today a hard-coded, English-only `pdfmake` layout inside
`comparisons` (research R-1) — becomes a **Page Builder template** an operator designs in the Admin
UI. The approach, with evidence and rejected alternatives in [research.md](./research.md):

- **A new switchable module `document_templates`** (R-3) owns the generic capability — one table,
  six Commands, the admin API and screens, the Puck→pdfmake render engine, six general-purpose blocks
  — as Principle XIV's entity-agnostic core. **Invoices are not touched** (R-4).
- **Hosts contribute document types** through an ungated, presence-filtered registry
  (`documentTypeRegistry`, `contributes-to`) and render through a gated port (`documentRenderPort`,
  `degrades-without`) to which they **pass their own data** (R-5). The core never reads host data for
  meaning, so tenant scoping stays where it is.
- **`comparisons` registers `comparisons.comparison`** with three blocks (header, table, share link),
  five merge fields, a sample and a built-in layout in `en-US` and `pl-PL`; its export route calls the
  port when `document_templates` is present and keeps today's renderer otherwise (R-11).
- **Page Builder reuse**: a new block context `document` (R-6); the editor reuses the invoice editor's
  chrome and feature 141's block-contribution path, with the canvas sample served by the backend so
  canvas and PDF preview agree (R-7).
- **Template model**: one active template per type and scope (all channels / one channel),
  channel → global → built-in resolution, the built-in layout virtual rather than seeded, scope
  immutable (R-8); per-language trees with the catalogue's language fallback (R-9).
- **The PDF finally speaks the buyer's language** — the storefront sends its locale (R-18).
- **No new runtime dependency, no cache, no domain event, one migration** (R-14, R-19).

## Technical Context

**Language/Version**: TypeScript 5.x `strict`, Node.js ≥ 22.17, ESM
**Primary Dependencies**: Fastify, MikroORM (PostgreSQL), Zod, `pdfmake` (backend); React 19 + Vite + react-router-dom 7 through `@endora-commerce/admin-kit`, `@puckeditor/core`, `@endora-commerce/page-builder-core`, `@endora-commerce/page-builder-admin` (admin); Next.js 15 App Router (storefront) — **no new runtime dependency**
**Storage**: PostgreSQL — one new table `document_templates` owned by `document_templates`, one migration; no column added elsewhere
**Testing**: Vitest — co-located `*.test.ts` in `packages/modules/document_templates/src/**` and
`packages/modules/comparisons/src/**`; `backend/test/contract/document_templates/`,
`backend/test/contract/comparisons/`, `backend/test/integration/document_templates/` (off-state,
tenancy, channel); `backend/test/perf/comparisons/pdf-export.bench.ts` (SC-003);
`admin/test/modules/document_templates/` and `admin/test/modules/comparisons/` (`<StrictMode>`,
`axe-core`); `storefront/test/` for the export call
**Target Platform**: Linux server; admin SPA and storefront in evergreen browsers
**Project Type**: web application — monorepo (`backend/`, `admin/`, `storefront/`, `packages/`)
**Performance Goals**: 16-product export p95 < 5 s and ≤ +0.5 s versus today; preview of the
built-in layout p95 < 3 s; template resolution ≤ 2 indexed reads (SC-003)
**Constraints**: content ≤ 512 KiB, ≤ 200 nodes/language, ≤ 10 languages, ≤ 20 images/language
(R-20); pdfmake URL access denied; images from the assets library only (R-12)
**Scale/Scope**: 1 new module (1 table, 6 Commands, 12 admin routes, 2 permissions, 1 palette action,
1 nav entry, 2 admin pages, 6 core blocks, 1 setting); `comparisons`: 3 blocks, 1 registration, 1
route changed, 3 admin block contributions, 1 link; contracts: 1 new file, 2 enum widenings, 1 schema
added to `comparisons.ts`; `page-builder-core`: 1 context, 1 type; storefront: 3 files; docs: 2 pages
× 2 languages + comparisons page update

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design — same verdict.*

| Principle | Verdict | How the design meets it |
| --- | --- | --- |
| **I. Modular architecture (NN)** | Pass | `document_templates` owns its table, Commands, routes, screens, engine and core blocks; `comparisons` owns its blocks, data, sample, built-in layout and the export route. The only seams are contracts-typed: the `documentTypeRegistry` push and the `documentRenderPort` call (both `nonBindingDependencies`), plus `assetReadPort` (binding, owner `nonDeactivatable`) and the kernel's `salesChannelResolutionPort` and `resolvedModuleRegistry`. No foreign table read; no internals imported. Either module detaches cleanly (contribution sinks drop the push; the presence probe takes the fixed renderer). |
| **II. API-first** | Pass | `packages/contracts/src/document-templates.ts` (+ test) and `comparisonDocumentDataSchema` land in Phase 2 before any route; the two enum widenings (`pageBuilderContextSchema`, `AdminBlockContributionSchema.context`) are additive — consumers that switch exhaustively on them are found by `pnpm -r run typecheck` and listed in T006. |
| **III. TDD (NN)** | Pass | Every implementation task in [tasks.md](./tasks.md) follows the failing test it turns green; § *Requirement → test* there maps every FR and SC. |
| **IV. YAGNI, minimal dependencies** | Pass | No dependency (QR via pdfmake's native node), no cache, no event, no seeded rows, no version history, no reversible Commands, no manifest field. The third-module block seam is reserved, not built (contract §6). |
| **V. TypeScript everywhere** | Pass | Zod on every new HTTP boundary and on stored content; registration and port types in contracts. |
| **VI. Naming (NN)** | Pass | Module id `document_templates` (plural snake), table `document_templates`, routes kebab-case (`/document-templates`), JSON camelCase, block names `<module>.<PascalCase>`, permissions `document_templates:read|write`, Commands `document_template.<verb>`. `check:naming` run in T061. |
| **VII. SEO, performance** | Pass | Storefront page stays SSR; only a client fetch gains a header and a query flag. Perf budget is a test (T060). |
| **VIII. English (NN)** | Pass | Code, comments, specs, docs in English; Polish only in bundles, the Polish docs tree and the per-language built-in layout map. |
| **IX. UI reuse** | Pass | Editor = invoice editor chrome + `editorConfigFromDescriptor` + admin-kit primitives; no new kit component. |
| **X. Scalable queue consumers** | N/A | Rendering is synchronous per request, as today; no repeatable work. |
| **XI. Multi-tenant isolation (NN)** | Pass | `DocumentTemplate` is `@GlobalEntity()` (platform config). Tenant data reaches a render only as the host-built `data`, built under the buyer's request context by the unchanged `buildOwnerView`. Cross-organisation test T031. No escape hatch used. |
| **XII. Sales-channel scoping (NN)** | Pass | The template is selected by the request's resolved channel id (`getResolvedChannel`, which throws rather than returning null); a null channel never matches a channel row; channel ids validated through the kernel port + FK. Cross-channel test T046. |
| **XIII. Command Bus auditing (NN)** | Pass | All six writes are Commands through `CommandBus.run`; no hand-written audit (unlike `invoice-template-service.ts`); one audit row per committed write, none on refusal (T023). |
| **XIV. Entity-agnostic extensibility** | Pass | The core stores `document_type` and `content` opaquely and never interprets host data; host behaviour lives behind the registration. The invoice template mechanism stays the untouched source of truth (R-4). |
| **XV. Untouched core & overlay** | Pass | An overlay module can register a document type through the same registry; nothing in core needs editing to add one (US5 fixture proves it). |
| **XVI. Command palette** | Pass | `open-document-templates` in `document_templates`' manifest; `check:action-route-permissions` in T057. |
| **XVII. Operator-toggleable (NN)** | Pass | `document_templates.enabled` (default on). Off: routes 503, nav/palette/link absent, comparisons fall back to the fixed renderer, rows kept. Comparisons off: its type, blocks and templates invisible, rows kept. Off-state tests T054–T056 cover deactivated-while-platform-available. |

## Project Structure

### Documentation (this feature)

```text
specs/152-compare-pdf-template/
├── spec.md
├── plan.md                         # this file
├── research.md                     # R-1 … R-22
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── document-type-registry.md   # cross-module: registry, port, merge fields
│   ├── document-templates-api.md   # admin HTTP
│   ├── comparison-document.md      # comparisons' type, data, export route, storefront
│   └── admin-ui.md                 # screens, editor, palette, i18n keys
├── checklists/requirements.md
└── tasks.md
```

### Source code (repository root)

```text
packages/contracts/src/
├── document-templates.ts                       # NEW — schemas, registration, port, DTOs
├── document-templates.test.ts                  # NEW
├── cms.ts                                      # pageBuilderContextSchema += 'document'
├── admin-contributions.ts                      # AdminBlockContributionSchema.context += 'document'
├── comparisons.ts                              # += comparisonDocumentDataSchema
├── errors.ts                                   # += 5 DOCUMENT_* codes
└── index.ts                                    # re-export

packages/page-builder-core/src/contributions/
├── types.ts                                    # += DocumentBlockEditorConfig
└── document-sample.tsx                         # NEW — DocumentSampleProvider, useDocumentSample

packages/admin-kit/src/zones/use-block-contributions.ts   # accepts 'document'

packages/modules/document_templates/            # NEW MODULE (layout as admin_search / invoices)
├── package.json  tsconfig*.json  vitest.config.ts  tailwind.css  README.md  CHANGELOG.md  LICENSE
├── i18n/{en,pl}.json
├── docs/document-templates.md
└── src/
    ├── manifest.ts                             # settings, activation, permissions, actions, blocks, errorCodes, dependencies
    ├── migrations/<stamp>_document_templates_init.ts   # scaffolded by migration:new
    ├── backend/
    │   ├── index.ts                            # registerModule: registry, service, port, routes
    │   ├── entities/document-template.entity.ts
    │   ├── registry/document-type-registry.ts (+ .test.ts)
    │   ├── commands/document-template-commands.ts (+ .test.ts)
    │   ├── services/document-template-service.ts (+ .test.ts)      # reads + Command orchestration
    │   ├── services/template-resolver.ts (+ .test.ts)              # scope + language resolution
    │   ├── services/builder-descriptor.ts (+ .test.ts)
    │   ├── rendering/document-renderer.ts (+ .test.ts)             # tree → pdfmake doc definition → bytes
    │   ├── rendering/core-blocks.ts (+ .test.ts)                   # Heading, Text, Image, Spacer, Divider, PageBreak
    │   ├── rendering/merge-fields.ts (+ .test.ts)
    │   ├── rendering/embed-asset-images.ts (+ .test.ts)
    │   └── routes.admin.ts
    └── admin/
        ├── index.ts                            # routes + nav
        ├── api/document-templates-client.ts
        ├── pages/DocumentTemplatesPage.tsx
        ├── pages/DocumentTemplateEditor.tsx
        ├── components/{NewTemplateDialog,MergeFieldsPanel,LanguageSwitcher}.tsx
        └── blocks/core-block-editors.tsx       # canvas renderers + fields for the six core blocks

packages/modules/comparisons/
├── i18n/{en,pl}.json                           # += document type, blocks, fields, link
├── docs/comparisons.md                         # += "Designing the PDF"
└── src/
    ├── manifest.ts                             # += blocks, blockCategories, nonBindingDependencies
    ├── backend/index.ts                        # += onBoot registration, port + presence in route deps
    ├── backend/routes.public.ts                # /me/pdf per contract §4
    ├── backend/document/comparison-document-type.ts (+ .test.ts)
    ├── backend/document/comparison-document-data.ts (+ .test.ts)
    ├── backend/document/built-in-layout.ts (+ .test.ts)
    ├── backend/document/sample-comparison.ts
    ├── backend/document/blocks/{header,table,share-link}.ts (+ .test.ts)
    ├── backend/services/comparison-pdf-shared.ts   # helpers extracted from the fixed renderer
    ├── backend/services/comparison-pdf-renderer.ts # unchanged output; imports the helpers
    ├── admin/index.ts                          # += blocks contributions
    ├── admin/document-blocks/{ComparisonHeader,ComparisonTable,ComparisonShareLink}.tsx
    └── admin/pages/ComparisonsListPage.tsx     # += PDF template link

storefront/
├── lib/api/comparisons.ts                      # exportComparisonPdf({ locale, hideEmptyRows })
├── lib/i18n/messages.ts                        # += compare.pdf.busy / compare.pdf.failed
├── components/ComparisonTable.tsx
└── app/compare/page.tsx

backend/test/contract/document_templates/{admin-api,render-port,off-state}.test.ts
backend/test/contract/comparisons/pdf-template-export.test.ts
backend/test/integration/document_templates/{tenancy-channel,activation-race}.test.ts
backend/test/perf/comparisons/pdf-export.bench.ts
backend/test/fixtures/document-types/fixture-document-type.ts   # US5 test-only registration
admin/test/modules/document_templates/*.test.tsx
admin/test/modules/comparisons/pdf-template-link.test.tsx
docs/docs/module-reference/document-templates.md (+ pl), comparisons page (+ pl)
.changeset/*.md                                  # contracts, page-builder-core, admin-kit, comparisons, document_templates
```

Generated and committed in the same MR: `composer:generate` artefacts (manifest index, entities and
migrations registries, docs sidebar and module map), `manifests:generate` package manifests,
`pnpm install --lockfile-only` → `pnpm-lock.yaml` (`AGENTS.md` § traps).

**Structure Decision**: one new module package beside the others under `packages/modules/`, an
extension of `comparisons`, additive changes to three shared packages, and three storefront files.

## Module manifest — `document_templates` (design)

- `id: 'document_templates'`, `name: 'Document Templates'`, `version: '1.0.0'`.
- `dependencies`: `settings`, `auth`, `assets_library` (binding; `nonDeactivatable`, so no dead switch).
  The kernel's `salesChannelResolutionPort`, `resolvedModuleRegistry` and `commandBus` need no edge.
- `settings`: group `document_templates`; `document_templates.enabled` (boolean, default `true`).
- `activation: { settingCode: 'document_templates.enabled', default: true }` — switchable.
- `permissions`: `document_templates:read` ("View document templates"),
  `document_templates:write` ("Edit document templates", `requires: ['document_templates:read']`).
- `actions`: `open-document-templates` (contract `admin-ui.md` §1).
- `blocks` (6, `contexts: ['document']`, category `layout`) and `blockCategories: [{ key: 'layout',
  titleKey: 'blocks.category.layout', contexts: ['document'], weight: 10 }]`.
- `errorCodes`: the five `DOCUMENT_*` codes.
- `i18n: { bundlesDir: 'i18n' }`, `docs: { dir: 'docs' }`.

## Composition — `document_templates/src/backend/index.ts` (design)

```text
ctx.di.register({
  documentTypeRegistry:  singleton(new DocumentTypeRegistry(id => effectiveState.isPresent(id))),   // ungated
  documentTemplateService: singleton(new DocumentTemplateService(emFactory, commandBus, registry,
                              lazyPort(ctx,'salesChannelResolutionPort'))),
})
ctx.di.providePort('documentRenderPort', singleton(new DocumentRenderer(emFactory, registry,
                              lazyPort<AssetReadPort>(ctx,'assetReadPort'), resolvedModuleRegistry)))
ctx.routes(app => registerDocumentTemplatesAdminRoutes(app, { requireAdmin, service: lazyPort(…),
                              renderer: lazyPort(…), registry }))
```

No boot hook does work; nothing to probe (`check:entry-presence`).

## Migration plan

One migration, owned by `document_templates`, scaffolded with `migration:new --module
document_templates --name init`: `create table "document_templates"` + the two indexes + the
`document_type` check + FK to `sales_channels` (kernel-owned, so no manifest edge and no R1/R2
finding). Order follows the manifest graph; no other module's table is written (`check:module-boundary`
R2). Register with `composer:generate`.

## Cross-cutting concerns (checklist from the architect brief)

| Concern | Design |
| --- | --- |
| Admin permission manifest | `document_templates:read/write` in the manifest, labels in both bundles, gates as route `preHandler` literals |
| Command palette | `open-document-templates`; keywords cover "pdf", "comparison", Polish forms |
| pl + en i18n | both bundles of both modules; built-in layout per language; storefront button strings; docs pl + en |
| Settings | only the activation setting; no secret, so no `secret` value type; the share link reads the existing `sales_channels.storefront_url` |
| Auditing | six Commands through `CommandBus.run` (R-13) |
| Tenant scoping | `@GlobalEntity`; host data built under request context (R-15) |
| Channel scoping | resolution by resolved channel id; fail-closed (R-15) |
| Redis cache invalidation | none needed — no cache (R-14) |
| Module activation | switchable; `degrades-without` fallback in `comparisons`; off-state tests |

## What changes if the owner answers differently

| Question | Different answer | Design impact |
| --- | --- | --- |
| Q1 | comparison-only | Drop the registry/port; templates table + editor move into `comparisons`; ~same task count, no US5 |
| Q2 | buyer chooses among layouts | `active` becomes `published`; partial unique index dropped; a public `GET …/me/pdf/templates` list and a `templateId` query param; storefront menu |
| Q3 | + per organisation / customer group | `scope_kind` + `scope_id` columns replace `sales_channel_id`; resolution gains two rungs; the host passes `organizationId` / group (it has them) |
| Q4 | attribute selection in template | a `ComparisonTable.attributes` prop with an attribute picker contributed by `comparisons`' admin (catalog attribute read) |
| Q5 | keep today's layout until activation | the built-in layout's trees reproduce today's English-only output for every language |
| Q6 | draft/publish or history | `draft_content` column + `publish` Command, or a `document_template_versions` table + `restore` Command |
| Q7 | channel default only | the route stops reading `Accept-Language`; storefront change reduced to `hideEmptyRows` |

## Complexity Tracking

No constitution violation to justify, and **no new runtime dependency**. Two choices that add
surface are recorded with their simpler alternatives:

| Choice | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| A new module rather than code in `comparisons` | Principle XIV; three named hosts; one operator screen for all documents (R-3) | Comparison-only copy would be the second of three copies of the template machinery |
| A new Page Builder context `document` (contracts enum widening) | Block ownership/palette machinery keys on context (R-6) | Reusing `invoice` mixes palettes; a context per type grows the enum per host |

## Handoff summary for `endora-commerce-dev`

1. Read `research.md` R-3, R-5, R-8, R-11 and all four contracts before starting; implement
   **test-first** in the order of `tasks.md` (Setup → Foundational → US1 → US2 → US3 → US4 → US5 →
   Polish). US1 + US2 are the MVP.
2. Start with contracts (`document-templates.ts`, enum widenings, `comparisonDocumentDataSchema`),
   then scaffold the module with `migration:new` and `composer:generate`; never hand-number.
3. Every write is a Command through `CommandBus.run`; never call the audit writer.
4. In `comparisons`, probe `effectiveState.isPresent('document_templates')` **before** resolving
   `documentRenderPort`; the try/catch around the render re-throws `ModuleDisabledError` first.
   The fixed renderer's output must not change (its two existing tests stay green untouched).
5. The registration push is a contribution-only boot hook — no presence probe.
6. Regenerate and commit `composer:generate`, `manifests:generate`, `pnpm install --lockfile-only`;
   add changesets for every published package touched.
7. Verify with `pnpm -r run typecheck`, `pnpm -r run lint`, `pnpm --filter backend run
   test:unit:fast`, the targeted contract/integration files, `pnpm --filter '!backend' run test`, and
   the checks listed in T061. Run the manual walk in `quickstart.md` before merge.
