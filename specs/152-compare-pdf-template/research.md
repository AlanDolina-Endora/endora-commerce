# Research: Document templates — comparison PDF template, invoice templates moved

**Feature**: `specs/152-compare-pdf-template/` | **Date**: 2026-10-17 (revised the same day after the
owner's answers to Q1–Q7) | **Measured on**: `origin/master` at `c0f70efd6`

Every decision is stated as *decision → rationale → alternatives rejected*. Citations of pre-migration
features (`007`, `047`, `096`, `134`) are provenance and resolve only in the historical repository
(`AGENTS.md` § *Working agreement*, D-247).

**Revision note.** The first version of this file kept invoices untouched (old R-4) and modelled one
*active* template per scope. The owner's answers reverse both: invoices move onto the facility in this
feature, and a scope holds several templates of which one is the *default*, with per-document selection
declared per type. R-4, R-8 and R-17 are rewritten; R-23 to R-31 are new.

**Second revision (owner's answers to N1–N5, 2026-10-17).** N1 departs from the proposed default: the
invoice e-mail attachment uses the template now — R-21 and R-26 are rewritten. N2–N5 confirm the
defaults of R-27 to R-30, which now read as decisions rather than proposals.

---

## R-1 — How the comparison PDF is produced today (facts)

| Fact | Where |
| --- | --- |
| The `PDF` button `fetch`es `GET /api/v1/comparisons/me/pdf` from the browser and saves the blob; it sends **no** `Accept-Language` and no `X-Sales-Channel` header | `storefront/lib/api/comparisons.ts` (`rawFetch`, `exportComparisonPdf`), `storefront/components/ComparisonTable.tsx` (`ExportPdfButton`) |
| Generated **server-side** in `comparisons` with `pdfmake` | `packages/modules/comparisons/src/backend/routes.public.ts` (`/me/pdf`), `.../services/comparison-pdf-renderer.ts` |
| Data: `comparisonService.buildOwnerView(comparison, channelId, { kind: 'buyer', audience })` — viewer-priced, audience-filtered, the same view as the page | `routes.public.ts` lines 173–212; `packages/contracts/src/comparisons.ts` (`comparisonOwnerViewSchema`) |
| Hard-coded English layout: `h1` "Product comparison", caption `Mode: …`, one table, landscape from 3 products | `comparison-pdf-renderer.ts` (`buildDocumentDefinition`, `pickOrientation`, `filterRowsByMode`, `MODE_LABELS`) |
| Names always English: `localised()` reads `en-US` → `en` → first | `comparison-pdf-renderer.ts` |
| The *Hide empty rows* switch is client-only, so the PDF ignores it | `ComparisonTable.tsx` doc block |
| Images pre-fetched by `AssetByteFetcher` with a 1×1 fallback; pdfmake URL access denied | `.../services/asset-byte-fetcher.ts` |
| `hiddenProductCount` is never printed | `comparison-pdf-renderer.ts` |
| Error codes `COMPARISON_EMPTY` (409), `PDF_GENERATION_FAILED` (503) | `packages/modules/comparisons/src/manifest.ts` |

## R-2 — How invoice templates work today (facts) — the parity baseline

| Fact | Where |
| --- | --- |
| Storage: `invoice_templates` (`@GlobalEntity`): `code`, `name`, `sales_channel_id` (null = global, **no FK**), `content` = `{ schema_version, languages: { <lang>: <Puck Data> } }`, `languages`, `active`, `is_system`, `version`, timestamps; partial unique index **one active per scope** | `.../entities/invoice-template.entity.ts`, migration `20260629T125121_invoices_module.ts` |
| Block names were namespaced in place (`invoices.Invoice…`) by a later migration; a seed-revision migration rewrote the generic row | `20260903T101756_invoices_namespace_block_names.ts`, `20260801T111000_invoices_generic_template_reseed.ts` |
| **Seed**: `ensureGenericSeed()` runs when the routes attach; inserts the `generic` `is_system` row, **active only if no global active exists**, and **overwrites** its content whenever `GENERIC_INVOICE_TEMPLATE_SEED_REVISION` advances | `.../services/invoice-template-service.ts`, `.../backend/plugin.ts` (`ensureGenericSeed().catch(() => undefined)`), `.../seeds/generic-invoice-template.ts` |
| **Create = activate**: `create()` deactivates the active row of the scope and inserts the new one active. There is **no** rename, deactivate or delete | `invoice-template-service.ts` (`create`) |
| **Resolution at render time**: channel active → global active → the `generic` row (whatever its `active`) → `null`; tree by exact language key else first. Because a global active always exists after the seed, the third rung is unreachable in practice | `invoice-template-service.ts` (`resolveTree`), `.../pdf-components/tree-mapper.ts` (`pickLanguageTree`) |
| **No pinning**: `invoices.template_id` exists but **nothing writes it**; it is only read through to the detail DTO. An already-issued invoice re-renders with whatever template is active now | `.../entities/invoice.entity.ts`, `.../services/invoice-service.ts:409`, `invoice-read-port.ts:98` |
| **Render paths** — admin download (`GET /api/v1/admin/invoices/:id/pdf`), admin regenerate (`POST …/:id/regenerate-pdf`, renders to validate), customer download (`GET /api/v1/orders/:id/invoices/:invoiceId/pdf`): all `resolveTree(channel, 'pl-PL')` + `render(detail, 'pl', tree)`. Preview GET/POST: `render(sampleInvoiceDetail(), 'en', tree)` | `routes.admin.ts` (`RENDER_LANGUAGE = 'pl-PL'`, lines 145, 183, 278, 290), `routes.customer.ts:107` |
| **E-mail attachment ignores templates**: `pdfRenderer.render(detail)` — no tree, locale `'pl'` → always the built-in code layout | `.../services/invoice-email-dispatch.ts:121` |
| Bulk "printout" and the legacy single download are stub PDFs unrelated to templates | `.../services/invoice-pdf.ts` |
| Renderer: walks top-level nodes; ten own blocks map to `sections.ts`; other names go to the contributed-block registry; nothing renderable → `builtinLayout()` (header, parties, line items, VAT/totals in a 55/45 `columns`, correction note, every present contributor's block with `{}` props); `buildDoc`: A4, margins `[40,40,40,48]`, `fontSize 10`, `docTitle` style | `.../services/invoice-pdf-renderer.ts`, `.../pdf-components/{tree-mapper,sections}.ts` |
| **Contributed blocks**: `invoicePdfBlockRegistry` (ungated, presence-filtered) — `describe()`, optional `resolve(invoiceId)` (failure → `null`, never fails the invoice), `render`, `printsKsefReferenceNumber` (the header suppresses the KSeF number when such a block is present **and placed**). The contributor, `ksef`, is now an **external package** | `.../services/invoice-pdf-block-registry.ts`, `packages/contracts/src/invoices.ts` (`InvoicePdfBlockRegistration`), `backend/test/integration/invoices/stored-contributed-block.test.ts` |
| Logo block: `imageSource` `url` or `library`; images inlined before render (`embedInvoiceLogoImages`), URLs fetched with a 3 s timeout | `.../pdf-components/embed-logo-images.ts` |
| Manifest declares the ten blocks with `contexts: ['invoice']`, `fields: {}`; fields and labels are **English literals** in the backend descriptor | `packages/modules/invoices/src/manifest.ts` (`blocks`), `.../pdf-components/descriptor.ts` |
| Admin: `/invoices/templates` (list), `/invoices/templates/:id` (editor, hard-coded `pl-PL`, `hydrateInvoiceDefaults`, described stand-ins, Preview PDF); canvas renderers use a **frontend copy** of the sample; strings in the **shared `_i18n` bundle** (`invoiceTemplates.*`, `appShell.nav.invoiceTemplates`, ~29 keys) | `.../admin/pages/{InvoiceTemplatesPage,InvoiceTemplateEditor}.tsx`, `.../admin/templates/*`, `packages/modules/_i18n/i18n/{en,pl}.json` |
| Navigation: no sidebar row; reached from `InvoiceSectionTabs` (`/invoices/templates`) and palette action `invoice-templates` (`invoices:read`) | `.../admin/components/InvoiceSectionTabs.tsx`, `manifest.ts` (`actions`) |
| Permissions: list/get/config `invoices:read`; create/save/**preview** `invoices:write` | `routes.admin.ts` lines 214–296 |
| Audit: hand-written `recordAuditFromContext`, not the Command Bus | `invoice-template-service.ts` (`#audit`) |
| Other places naming the table or routes: `cms`' block-name maintenance CLI lists `invoice_templates.content`; the OpenAPI baseline holds the five `invoice-templates` routes; three integration tests and one admin test exercise them | `packages/modules/cms/src/backend/cli/block-names.ts`, `backend/test/fixtures/openapi-baseline.json`, `backend/test/integration/invoices/{templates,off-state,stored-contributed-block}.test.ts`, `backend/test/integration/_admin_surfaces/batch-twelve-palette-off-state.test.ts`, `admin/test/modules/invoices/InvoiceSectionTabs.test.tsx` |

## R-3 — Where the capability lives: a new module `document_templates`

**Decision** (confirmed by the owner, Q1): a new switchable module **`document_templates`** owns the
generic capability — table, Commands, admin API and screens, the Puck→pdfmake engine, the
general-purpose blocks, the import of legacy templates — and two seams: a registry hosts push
**document types** into, and a gated render port hosts call with their data.

**Rationale**: Principle XIV's entity-agnostic core for a capability spanning several host entities
(comparison, invoice, quote request). Domain ownership — "the layout of a generated document" — is no
host's concept. As a module it gets a table owner, permissions, palette entry, activation, docs and
bundles.

**Alternatives rejected**: comparison-only copy (owner rejected); generalising `invoices`' machinery
in place (would make comparisons and quotes depend on invoicing; XIV); `cms` (pages are its domain);
a library-only package (keeps per-host management duplication and one screen per module).

## R-4 — Invoices become a document type of the facility (replaces "invoices untouched")

**Decision**: `invoices` registers the document type **`invoices.invoice`** and stops owning template
storage, CRUD, screens and resolution. It keeps everything invoice-specific: its ten blocks and their
pdfmake section builders, its built-in code layout, its sample invoice, its contributed-block registry
(`invoicePdfBlockRegistry`, unchanged for `ksef`), the KSeF-number rule, the logo image handling, and
every render path. Template rows move to `document_templates` by a one-time import (R-24). Rendering
moves to the shared engine through registration hooks designed for parity (R-25).

**Rationale**: the owner's decision. Principle XIV's "any later convergence is an adapter, not a
rewrite" is honoured literally: invoices' *render code* is not rewritten — it is adapted behind
`DocumentBlockRenderer`s and two hooks — and invoices remain the source of truth for invoice data.
What converges is storage and management, which were generic all along.

**Alternatives rejected**: (a) leave invoices and migrate later — the owner wants it now; (b) migrate
storage only and keep invoices' own editor — two template screens, the duplication the facility exists
to remove; (c) rewrite invoice sections as generic blocks — risks the output parity the owner requires
for a legal document.

## R-5 — The host seams: registry + gated render port

**Decision**: typed in `packages/contracts/src/document-templates.ts`:

1. **`documentTypeRegistry`** — ungated contribution registry (the `AdminSearchProviderRegistryPort`
   idiom); hosts push from a contribution-only boot hook; reads filter by the host's presence.
2. **`documentRenderPort`** — gated (`ctx.di.providePort`): `render({ documentType, salesChannelId,
   language, data, templateId? })`.

`comparisons` declares the registry `contributes-to` and the port `degrades-without` (presence probe,
fixed renderer otherwise). `invoices` declares `document_templates` in **`dependencies`** (R-27, N2) and
resolves both directly.

**Rationale**: only the host can build its data, inside the requester's context (XI); the core never
interprets it (XIV). The per-host choice between binding and degrading is the host's honest answer to
"what happens when templates are off".

**Alternatives rejected**: core pulls data through loaders (needs host identity semantics); host-side
rendering with a library (engine duplicated, admin preview needs host routes); a manifest field for
types (renderers are code anyway).

## R-6 — Blocks belong to a document type; general-purpose blocks are opt-in

**Decision**:
- A document type's palette is **exactly**: the host blocks its registration lists, the blocks other
  modules contribute **to that type** through the host, and the general-purpose blocks **only if** the
  registration opts in (`coreBlocks: 'all' | readonly CoreBlockName[] | 'none'`). The descriptor, the
  editor and save-time validation (FR-019) all derive from that one list.
- `comparisons.comparison`: its three blocks + `coreBlocks: 'all'`. `invoices.invoice`: its ten blocks +
  present contributors' blocks + `coreBlocks: 'none'` (it has its own spacer, divider, logo, footer —
  parity of the palette).
- New blocks (core and comparison) declare `contexts: ['document']` — a new value of
  `pageBuilderContextSchema` that keeps them out of the CMS and e-mail palettes. **Invoice blocks keep
  `contexts: ['invoice']`**, and so does `ksef`'s externally declared block: the type's list, not the
  context, decides membership, so neither manifest needs to change (FR-087).
- Labels and fields come from the block's manifest declaration found **by name** in any present
  manifest, else from the renderer's own `describe()` — the latter is how a contributed invoice block
  is described today, so `ksef` keeps working unchanged.

**Rationale**: the owner's explicit requirement that each type has its own component set; keeping
contexts and the contributor contract stable avoids touching an external package.

**Alternatives rejected**: a context per document type (an enum value per host, and `ksef` would have
to re-declare); every core block offered everywhere (violates the owner's requirement and changes the
invoice palette).

## R-7 — The editor: invoice editor's shape, feature 141 contributions, backend-served sample

**Decision**: one generic editor (`/document-templates/:id`) built like `InvoiceTemplateEditor.tsx`
(Puck + `@endora-commerce/page-builder-admin` chrome + `page-builder-core/editor` plugins), its config
composed from the type's descriptor via `editorConfigFromDescriptor`
(`packages/page-builder-core/src/contributions/descriptor-editor.tsx`). Canvas renderers come from the
owning module's admin block contributions with context `document` — `comparisons` ships three new
ones; `invoices` moves its existing canvas renderers (`invoice-puck-config.tsx`) into ten
contributions, one per own block, reading the **backend-served** sample instead of the frontend copy.
Blocks without a contribution (the `ksef` block) get the neutral stand-in, as today. Defaults merge
under stored props (what `hydrateInvoiceDefaults` did). *Preview PDF* renders on the server and is the
authority. The language switcher offers the registration's `languages` (invoices: `['pl-PL']`, FR-085;
comparison: all active content languages).

**Alternatives rejected**: an editor per host; a live-PDF canvas; keeping the frontend sample copy.

## R-8 — Template model: several per scope, one default; scope immutable; built-in virtual

**Decision**:
- `document_templates` rows carry `is_default`; a partial unique index allows **one default per
  `(document_type, scope)`**; any number of non-default templates (owner Q2).
- Commands `set_default` (clears the previous default of the scope in the same transaction) and
  `clear_default` replace "activate/deactivate".
- **Scope is immutable**; *duplicate* moves a layout to another scope.
- Resolution without an explicit template: channel default → global default → the registration's
  built-in layout. A tree with zero renderable nodes counts as absent. The built-in layout is virtual:
  the registration's `defaultContent()` tree, and — for a type that provides one — `renderBuiltIn()`
  code when even that tree renders nothing (invoices' `builtinLayout`, R-25).

**Rationale**: owner Q2; a virtual default needs no seed rows and no write by a host into the
facility's table; immutable scope removes a conflict class.

**Alternatives rejected**: seeded `is_system` rows per type (invoices' seed is exactly what R-24 has to
unwind); a separate assignment table (one boolean and an index express it).

## R-9 — Languages

**Decision**: `content = { schemaVersion: 1, languages: { <code>: <tree> } }`. The host chooses the
render language: comparison → storefront locale (sent as `Accept-Language`) → channel default → `en-US`
(owner Q7); invoices → always `pl-PL` (parity, N5). The tree is chosen exact → same primary subtag →
`en-US` → `en` → first (identical to `pickLanguageTree` for `pl-PL` content, so invoice parity holds).
A registration may restrict the editable languages (`languages`). Comparison platform prose lives in
its built-in layout's per-language trees; dates and money via `Intl` in the render language.

**Alternatives rejected**: per-field translations in one tree; render-time `_i18n` lookups.

## R-10 — Merge fields

**Decision**: `{{key}}` in core text blocks and in the root header/footer; core keys `date`, `page`,
`pages`; host keys from the registration's `variables` + `resolveVariables`. Known-but-empty → empty;
unknown → verbatim. Plain text only. Invoices declare none (their blocks print data themselves).

**Alternatives rejected**: a template language (dependency, execution surface).

## R-11 — Comparison fallbacks

| Situation | Comparison PDF |
| --- | --- |
| `document_templates` absent or off | `comparisons`' fixed renderer, unchanged (`degrades-without`) |
| on, no applicable template or nothing printable | the built-in layout through the engine — today's layout, localised (owner Q5) |
| on, applicable template | the template |

The fixed renderer stays, refactored only to share pure helpers; its two existing test files hold its
output.

## R-12 — Images and network access

**Decision**: the core `Image` block takes an assets-library id only (bytes via
`assetReadPort.openAssetBytes`, PNG/JPEG data URIs, URL access denied). **Invoices' logo block keeps
its URL option** (FR-086, parity) inside invoices' own renderer — an existing behaviour carried, not
extended to new blocks.

## R-13 — Auditing through the Command Bus

**Decision**: Commands `document_template.create` (also duplicate), `.rename`, `.save_content`,
`.set_default`, `.clear_default`, `.delete`, plus **`document_template.import`** (one audit row per
import run, R-24). Audit state: identity, scope, `isDefault`, version, languages, per-language SHA-256
content digest. No undo, no domain events. Invoices' hand-written audit goes away with its service.

## R-14 — Caching: none

A render reads ≤ 2 indexed rows (or 1 by id); no cache, therefore no invalidation channel. If SC-003
ever demands one, the pattern is an in-process cache dropped on a lifecycle pub/sub message after the
Commands commit.

## R-15 — Tenancy and channel scoping

`DocumentTemplate` and `DocumentTemplateImport` are `@GlobalEntity()`. Tenant data enters only as the
host-built `data`. Channel templates are selected by exact resolved channel id; a null channel never
matches one; an explicit `templateId` is accepted only if global or of the document's channel
(FR-038). Channel ids validated via the kernel `salesChannelResolutionPort.getById` and an FK to the
kernel-owned `sales_channels` (`on delete cascade`). Tests: cross-channel (comparison and invoice),
cross-organisation (comparison), explicit-id scope refusal.

## R-16 — Permissions, palette, navigation

**Decision**: `document_templates:read` / `:write` gate every facility route (literal codes —
`module-admin-surfaces.md` item 3). Palette: `open-document-templates` with keywords including
`invoice template`, `szablon faktury`, `pdf`, `porównanie`. **`invoices`' `invoice-templates` action is
removed** (its target becomes a redirect) — FR-090 is met by the new action's keywords. Sidebar entry in
`content`. Links: `comparisons` list page (*PDF template*), invoices' `InvoiceSectionTabs` *Templates*
tab → `/document-templates?type=invoices.invoice`.

**Alternatives rejected**: per-type codes from registrations (not literal; scanner refuses); host codes
enforced by the core.

## R-17 — Failure policy inside a render

**Decision**: per-type. Default (comparison): a host block's `render` throwing fails the render
(`DOCUMENT_RENDER_FAILED`, logged with template, version, block); `ModuleDisabledError` re-thrown.
**Invoices keep their rule**: a contributed block's `resolve` failing renders it with `null` and never
fails the invoice — implemented inside invoices' `prepareRender` hook, so the engine's policy is
untouched.

## R-18 — Storefront changes

`exportComparisonPdf({ locale, hideEmptyRows })` sends `Accept-Language` and `?hideEmptyRows=`;
`app/compare/page.tsx` passes the locale; the button's two Polish literals move to
`storefront/lib/i18n/messages.ts` (en + pl).

## R-19 — No new runtime dependency

`pdfmake` (Roboto covers Polish; native `qr`), `@puckeditor/core`, page-builder packages, Zod, MikroORM —
all present. pdfmake's process-global font/URL setters are set to identical values by every user.

## R-20 — Limits and performance

≤ 200 top-level nodes per language, ≤ 512 KiB content, ≤ 10 languages, string props ≤ 5 000 chars,
≤ 20 core images per language, `productsPerTable` 1–8. Enforced on write; defensively at render. The
**import** (R-24) bypasses the node/size limits for legacy rows that exceed them — such rows are imported
as they are and flagged in the import report, because refusing them would lose operator data (FR-081).

## R-21 — Defects observed and left out of scope

- Hard-coded Polish texts on the storefront comparison page beyond the `PDF` button.
- ~~The invoice e-mail attachment ignoring templates (R-2)~~ — **fixed in this feature** by the
  owner's answer to N1 (R-26).
- `invoices.template_id` is a column nothing writes (R-2) — left alone; dropping it is invoices' own
  clean-up.

## R-22 — Reuse path for the quote-request PDF (not built)

`quote_requests` registers `quote_requests.quote` with `selection: 'per_document'`, stores the chosen
template id on the quote, lists selectable templates through `GET /api/v1/admin/document-templates
?type=quote_requests.quote&applicableToChannel=<id>`, and calls `documentRenderPort` with `templateId`.
The facility changes nothing (FR-070, SC-007 — proven by the US6 fixture).

## R-23 — Per-document selection

**Decision**: registration `selection: 'default_only' | 'per_document'`. `render({ templateId })`:
- `default_only` + `templateId` → `DOCUMENT_TEMPLATE_NOT_SELECTABLE` (422) (FR-038);
- `per_document` + a template of the same type whose scope is global or the document's channel → used;
- another type or another channel → `DOCUMENT_TEMPLATE_NOT_SELECTABLE`;
- not found → FR-031's resolution, result `source: 'default'` with `requestedTemplateMissing: true`
  (FR-039) — a quote must still print after its chosen template is deleted.
The admin list gains `applicableToChannel=<id>` (global ∪ that channel) for a future picker.
`comparisons` and `invoices` declare `default_only`.

**Alternatives rejected**: refusing when the chosen template is gone (a sales document that cannot be
re-printed); pinning by copying the layout onto the document (a version store nobody asked for, Q6).

## R-24 — Migrating invoice template data: a pull import by the table's owner, recorded once

**Decision**:
- **Who writes**: `document_templates` — the owner of the target table — and nobody else. **Who reads
  the legacy table**: `invoices` — its owner — through a function in its registration,
  `legacyImport: { source: 'invoice_templates', read(): Promise<LegacyTemplateRecord[]>,
  afterImport?(): Promise<void> }`. No migration and no service touches the other module's table
  (`module-migrations.md` item 4a, R1/R2; `module-composition.md` item 9a's reasoning about seams).
- **When**: (1) `document_templates`' boot **work** hook, after probing its own presence, for every
  present type with a `legacyImport`; (2) lazily, before any read or render of such a type
  (`ensureImported(type)`), cached per process once done — so a runtime switch-on with no restart, or
  `invoices` being off at boot, still converges on first use (no hook on the activation axis is added).
- **Once**: table `document_template_imports` `(document_type, source)` PK. One transaction: insert the
  marker **first** with `on conflict do nothing`; only the inserting transaction proceeds (concurrent
  processes serialise on the PK); rows inserted with their **original ids** (`on conflict (id) do
  nothing`); `afterImport()` (the permission grant, R-28) runs inside the transaction's lifetime and a
  failure rolls the marker back so the next attempt retries; the run is one `document_template.import`
  Command (one audit row with counts). A template deleted after import never returns — the marker, not
  the rows, decides (FR-082).
- **Mapping** (`invoice_templates` → `document_templates`): `id`, `name`, `sales_channel_id`, `version`,
  `created_at`, `updated_at` copied; `document_type = 'invoices.invoice'`; `is_default = active`;
  `content = { schemaVersion: 1, languages: <legacy languages map> }` with trees byte-identical;
  `code`, `is_system`, `languages` dropped (derived or meaningless now). The seeded `generic` row is
  imported like any other, edits included (FR-081).
- **Skipped**: rows whose `sales_channel_id` names no existing channel (they could never apply: the
  legacy table had no FK; importing would violate the new FK) — counted and reported in the audit
  state and the log. Two legacy actives in one scope cannot exist (legacy unique index).
- **Legacy table**: kept, read-only; `invoices` stops writing it (`ensureGenericSeed` and every write
  method removed). Dropping it is a later clean-up once every installation has imported.
  `cms`' block-names CLI gains `document_templates.content`; `invoice_templates.content` stays listed
  while the table exists.

**Rationale**: the only shape that keeps both ownership rules: the owner of each table is the only code
touching it, and the cross-module step is a published function in a registration, not SQL. A pull by
the target owner also handles the off-states: nothing happens while either module is absent, and the
first moment both are present converges.

**Alternatives rejected**:
- *A migration owned by `document_templates` reading `invoice_templates`* — R1 would require
  `document_templates` to depend on `invoices`: the generic core depending on a host.
- *A migration owned by `invoices` inserting into `document_templates`* — R2 forbids a write into another
  module's table, declared or not.
- *`invoices`' `installHook` through an `./install` surface* — install hooks do not run on upgrade of an
  already-installed module, which is every existing installation.
- *`invoices`' boot hook pushing rows through a gated port* — a boot hook cannot resolve a gated port of
  a module that may be off, and the import would then wait for the next restart.
- *Idempotency by ids alone, no marker* — would resurrect templates the operator deleted after the move.

## R-25 — Invoice rendering through registration hooks (revised after owner answer P1)

**Revision (owner answer P1)**: PDF appearance need not match the old renderer, so the golden parity
test below is dropped and the invoice design simplified: the ten section builders are the invoice
type's block renderers, the seeded generic tree is its built-in layout (`defaultContent()`, no
`renderBuiltIn` code layout), the logo block inlines its own image when it renders, and
`prepareRender` resolves contributed blocks and the KSeF-number rule. Behavioural tests assert the
required content (FR-083). The text below is the first revision's, kept as provenance.

**Decision**: the engine's registration grows four optional hooks, each used by invoices and generic in
meaning:

| Hook | Generic meaning | Invoices' implementation |
| --- | --- | --- |
| `prepareRender(data, { placedBlocks, preview })` → `prepared` | per-render precomputation handed to every block | resolves present contributors' `resolve(invoiceId)` (failure → `null`), computes `suppressKsefNumber`, inlines logo images (`embedInvoiceLogoImages`) |
| `renderBuiltIn(data, prepared)` → `Content[]` | code layout used when no tree renders anything | today's `builtinLayout()` |
| `pageDefaults` | root-prop defaults and pdfmake `styles` under stored root props | A4, margins 40/40/40/48, `fontSize 10`, `styles.docTitle`; no header/footer/info |
| `blocks()` (a function, not an array) | the type's blocks at this moment | own ten + `invoicePdfBlockRegistry.present()` adapted |

Invoices' render paths call `documentRenderPort.render({ documentType: 'invoices.invoice',
salesChannelId: detail.salesChannelId, language: 'pl-PL', data: { invoice: detail, amountLocale: 'pl' }
})` — the preview's sample uses `amountLocale: 'en'` as today. The **parity test** (SC-008) captures the
pdfmake document definition produced by today's `InvoicePdfRenderer.content()/buildDoc()` for a fixture
matrix (seed tree, edited tree, channel override, KSeF block placed/absent, correction, empty tree →
built-in, logo by URL and by asset) **before** the change, commits it as golden files, and asserts the
engine's definitions equal them after.

**Rationale**: parity is proven on the definition, not trusted; invoice code moves behind interfaces
instead of being rewritten.

## R-26 — Invoice e-mail attachment (N1 — owner: fix it now)

**Decision**: the dispatcher renders the attachment through `documentRenderPort.render` with exactly
the download's input — `{ documentType: 'invoices.invoice', salesChannelId: detail.salesChannelId,
language: 'pl-PL', data: { invoice: detail, amountLocale: 'pl' } }` — so the same invoice yields the
same layout by e-mail and by download (FR-093). `invoices` binds the facility (R-27), so the port is
resolved directly, without a presence probe; the dispatcher's existing `rethrowIfModuleDisabled` +
contained-failure policy (FR-029: issuance is never undone by a failed e-mail) is unchanged.

**Consequence for parity**: golden case 10 of `contracts/invoice-document.md` §5 (captured from today's
built-in, no-tree e-mail path) documents the *before*; after the move the e-mail expectation is
**deep-equal to the download's definition for the same invoice and the same template data**, asserted
for the seed tree, a channel override and the empty-tree fallback. It is the one intentional output
change for invoices and is announced in the invoices changeset's release note.

**Alternatives rejected**: keeping the built-in attachment for parity (the proposed default — the owner
chose otherwise); a setting choosing between the two (two layouts of one legal document is the defect
being fixed, not an option worth keeping).

## R-27 — Invoices bind `document_templates` (N2 — owner: default)

**Decision**: `document_templates` joins `invoices`' manifest `dependencies`. Consequences:
switching templates off while invoicing is on is refused by the lifecycle (dependencies fail closed);
migration order puts `document_templates` before `invoices`; invoices never render without templates.
**Alternative (not chosen)**: `degrades-without` with `whenAbsent: 'invoices print the
built-in invoice layout; operator templates apply again when document templates are back on'`,
presence probe in front of the port, `renderBuiltIn` locally otherwise.

## R-28 — Permissions continuity (N3 — owner: default)

**Decision**: invoices' `legacyImport.afterImport` performs a one-time grant through
`adminRolePort` (owner `admin_roles`, `nonDeactivatable` — added to `invoices`' dependencies): for each
role whose permissions include `invoices:read` add `document_templates:read`; `invoices:write` → add
`document_templates:write` (and `:read`). Idempotent (a present code is not re-added); runs once because
the import marker runs once; logged with the role codes changed. The facility knows nothing of invoice
codes (XIV) — the host does it in its own hook. `invoices:write`'s label drops "edit templates".
**Alternatives**: release-note instruction only; per-type permissions (rejected in R-16).

## R-29 — Admin routes, redirects and the withdrawn API (N4 — owner: default)

**Decision**:
- `invoices`' admin contributions keep `/invoices/templates` and `/invoices/templates/:id` as **redirect
  routes** (`<Navigate replace>` to `/document-templates?type=invoices.invoice` and
  `/document-templates/:id` — ids preserved by the import). `InvoiceSectionTabs` points at the new list.
- The five `/api/v1/admin/invoice-templates*` routes are **removed**; `invoices`' changeset is a
  breaking (major) bump with a migration note; `backend/test/fixtures/openapi-baseline.json` updated in
  the same MR.
- The invoice template pages, `templates/` folder and descriptor move or go: canvas renderers become
  admin block contributions; `InvoiceTemplatesPage.tsx`, `InvoiceTemplateEditor.tsx`,
  `described-blocks.tsx`, `invoice-builder-plugin.tsx`, `descriptor.ts`, `invoice-template-service.ts`
  are deleted; the ~29 `invoiceTemplates.*` keys leave the shared `_i18n` bundles (their ratchets are
  two-way) and the block field labels move into `invoices`' own bundles.
- Tests naming the old routes are rewritten against the new API in the same MR (`AGENTS.md` trap:
  grep `backend/test/**` for every deleted file and route).
**Alternative (not chosen)**: keep the five routes one release as deprecated adapters over
`documentTemplateService` (+1 port, +1 task).

## R-30 — Invoice editor languages (N5 — owner: default)

**Decision**: `invoices.invoice` registers `languages: ['pl-PL']`; the editor offers Polish
only; documents render `pl-PL`. Legacy content holding other language keys is imported unchanged and
simply never offered — no data dropped.

## R-31 — Invoices' off-state and the generic one

- `invoices` off: its type, blocks and templates invisible in the facility; rows kept; import deferred if
  not yet done. On again: back, import completes if pending.
- `document_templates` off: refused while `invoices` is on (R-27 default). With `invoices` off too: both
  surfaces gone; on again: everything back.
- Tests: `backend/test/integration/invoices/off-state.test.ts` and
  `_admin_surfaces/batch-twelve-palette-off-state.test.ts` are updated (the `invoice-templates` action is
  gone), plus a new refusal test for switching templates off under invoices.
