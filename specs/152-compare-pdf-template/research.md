# Research: Editable PDF template for the storefront product comparison

**Feature**: `specs/152-compare-pdf-template/` | **Date**: 2026-10-17 | **Measured on**:
`origin/master` at `c0f70efd6`

Every decision is stated as *decision → rationale → alternatives rejected*. Facts are cited to the
file that carries them; a citation of a pre-migration feature (`007`, `047`, `096`, `134`) is
provenance and resolves only in the historical repository (`AGENTS.md` § *Working agreement*,
D-247).

---

## R-1 — How the comparison PDF is produced today (facts)

| Fact | Where |
| --- | --- |
| The `PDF` button calls `exportComparisonPdf()`, which `fetch`es `GET /api/v1/comparisons/me/pdf` from the browser and saves the blob. It sends **no** `Accept-Language` and no `X-Sales-Channel` header — the browser's own `Accept-Language` reaches the backend, not the storefront's locale | `storefront/lib/api/comparisons.ts` (`rawFetch`, `exportComparisonPdf`), `storefront/components/ComparisonTable.tsx` (`ExportPdfButton`) |
| The PDF is generated **server-side**, by the `comparisons` module, with `pdfmake` (already a dependency of `comparisons`, `invoices` and `backend`) | `packages/modules/comparisons/src/backend/routes.public.ts` (`GET /api/v1/comparisons/me/pdf`), `.../services/comparison-pdf-renderer.ts` |
| The route resolves the owner from the session/anonymous cookie, the channel with `getResolvedChannel(request)`, and the data with `comparisonService.buildOwnerView(comparison, channelId, { kind: 'buyer', audience })` — the same view the comparison page reads, already priced for the viewer and already filtered of products the viewer may not see | `routes.public.ts` lines 173–212; `packages/contracts/src/comparisons.ts` (`comparisonOwnerViewSchema`: `products`, `comparableAttributes`, `displayMode`, `pricedFor`, `hiddenProductCount`, `shareToken`) |
| The layout is hard-coded: an English `h1` "Product comparison", an English caption `Mode: <label>`, one table (header row = image ≤120 px, name, `"<amount> <currency>"`; body rows filtered by display mode, coloured by `rowClass`), landscape from 3 products | `comparison-pdf-renderer.ts` (`buildDocumentDefinition`, `pickOrientation`, `filterRowsByMode`, `MODE_LABELS`) |
| Product and attribute names are always printed in **English**: `localised()` reads `value['en-US'] ?? value['en'] ?? first` regardless of the buyer's language | `comparison-pdf-renderer.ts` (`localised`) |
| The storefront's *Hide empty rows* switch is client-only, so the PDF ignores it | `storefront/components/ComparisonTable.tsx` (component doc block) |
| Images are pre-fetched by `AssetByteFetcher` (HTTP, `file://`, path) into data URIs with a 1×1 fallback; pdfmake's URL access is denied | `.../services/asset-byte-fetcher.ts`, `comparison-pdf-renderer.ts` constructor |
| `hiddenProductCount` is on the view but the PDF never mentions it | `comparison-pdf-renderer.ts` |
| Errors: `COMPARISON_EMPTY` (409) and `PDF_GENERATION_FAILED` (503) are `comparisons`' codes | `packages/modules/comparisons/src/manifest.ts` (`errorCodes`) |

## R-2 — How invoice templates work (facts), and what of it is reusable

| Fact | Where |
| --- | --- |
| A template is a row in `invoice_templates` (`@GlobalEntity`): `code`, `name`, `sales_channel_id` (null = global), `content` jsonb = `{ schema_version, languages: { <lang>: <Puck Data> } }`, `languages`, `active`, `is_system`, `version`; one active per channel by a partial unique index | `packages/modules/invoices/src/backend/entities/invoice-template.entity.ts`, migration `20260629T125121_invoices_module.ts` |
| Resolution: channel active → global active → the seeded generic row; language tree by exact key else the first | `.../services/invoice-template-service.ts` (`resolveTree`), `.../pdf-components/tree-mapper.ts` (`pickLanguageTree`) |
| Rendering walks the top-level Puck nodes and maps each block name to a pdfmake section builder; a name nothing renders is skipped; a tree yielding nothing falls back to the built-in layout | `tree-mapper.ts` (`treeToContent`), `.../services/invoice-pdf-renderer.ts` (`content`, `builtinLayout`) |
| Other modules contribute blocks through an ungated, presence-filtered contribution registry (`invoicePdfBlockRegistry`) — the KSeF block's seam since feature 134 | `.../services/invoice-pdf-block-registry.ts`, `packages/contracts/src/invoices.ts` (`InvoicePdfBlockRegistration`, `InvoicePdfBlockRegistryPort`) |
| Library images are inlined as data URIs through `assetReadPort.openAssetBytes` (PNG/JPEG only) to avoid pdfmake's self-HTTP deadlock; but a free **URL** source is also fetched server-side with a 3 s timeout | `.../pdf-components/embed-logo-images.ts` |
| The admin editor is Puck with the shared chrome: `PageBuilderHeaderActions`, `PageBuilderOverlayBridge`, `withPuckLegacySideBar`, `PageBuilderOutline`, a served descriptor merged with stored names (`withDescribedInvoiceBlocks`), Save with optimistic `version`, *Preview PDF* via `POST …/:id/preview` rendering a **sample invoice** | `packages/modules/invoices/src/admin/pages/InvoiceTemplateEditor.tsx`, `.../admin/templates/{invoice-puck-config.tsx,described-blocks.tsx,invoice-builder-plugin.tsx}` |
| The canvas renderers mirror the PDF sections against a **frontend copy** of the sample invoice — two samples that must be kept equal by hand | `invoice-puck-config.tsx` (`sampleInvoice`) vs `.../pdf-components/sample.ts` |
| Block labels and fields served to the editor are **English literals** in the backend descriptor; the manifest declarations carry `fields: {}` | `.../pdf-components/descriptor.ts`, `packages/modules/invoices/src/manifest.ts` (`blocks`) |
| Writes audit through `recordAuditFromContext` by hand, not through the Command Bus | `invoice-template-service.ts` (`#audit`) |
| The editor language is hard-coded to `pl-PL` | `InvoiceTemplateEditor.tsx` (`LANGUAGE`) |

**What is worth reusing** — the *design*: a Puck envelope per language, channel → global → built-in
resolution, a top-level block walk to pdfmake with skip-unknown and fall-back-when-empty, data-URI
image inlining with network denied, a contribution registry for blocks a third module renders, the
editor chrome and the sample-backed preview. **What is not** — the hand-written audit, English-only
descriptor labels, the duplicated sample, the hard-coded editor language, and URL image sources.

## R-3 — Where the capability lives: a new module `document_templates`

**Decision**: A new switchable module **`document_templates`** (`packages/modules/document_templates/`)
owns the generic capability: the `document_templates` table, the template Commands, the admin API,
the *Document templates* screens and editor, the render engine (Puck tree → pdfmake), the
general-purpose blocks, and two seams — a contribution registry hosts push **document types** into,
and a gated render port hosts call. `comparisons` contributes the *Product comparison* document type
and calls the port. Nothing about comparisons is stored or interpreted in `document_templates`.

**Rationale**: Principle XIV is written for exactly this shape — *"a capability that spans multiple
host entity types MUST be built as an entity-agnostic core whose host-specific behaviour lives behind
documented extension points"* — and the request names three hosts within one roadmap (comparison
now, quote request next, invoices conceivably later). Domain ownership, not code size, justifies the
module: "the layout of a generated document" is not a comparison concept, not an invoice concept and
not a CMS page. As a module it gets, for free, everything a capability needs and a library does not
have: a table with an owner, permissions, a palette entry, an activation switch, docs, i18n bundles.

**Alternatives rejected**:
- **A comparison-only template inside `comparisons`** (copy the invoice pattern). Works for one
  host; the quote request would make a third copy of table, Commands, routes, editor, preview and
  language handling. The request explicitly asks for reuse.
- **Generalise `invoices`' template machinery in place** (add a `document_type` column to
  `invoice_templates`). Makes comparisons depend on invoicing — a switchable, potentially paid module
  — so switching invoicing off would take comparison templates with it; and Principle XIV forbids
  absorbing another host into an entity-specific mechanism and requires that mechanism stay
  untouched.
- **Put it in `cms`.** `cms` owns pages and their publication; PDF documents of other modules are not
  its domain, and switching the CMS off would remove PDF layouts of comparisons.
- **A library package only** (shared renderer + editor shell; each host keeps its own table, Commands,
  routes and screens). Removes the duplicated *rendering* but keeps the duplicated *management* —
  roughly two thirds of the work — per host, and gives operators one templates screen per module.
  The render engine still lives in one place under R-3, inside the module that owns it.

## R-4 — Invoices are not migrated in this feature

**Decision**: `invoices` and `invoice_templates` are not touched (FR-071). The contracts are shaped so
that a later adapter can register an `invoices.invoice` document type without changing
`document_templates`' schema; the one missing piece for that adapter — blocks contributed by a
*third* module into another host's document type (the KSeF case) — is designed as an additive
`registerBlock` on the same registry (contract `document-type-registry.md` §6) and **not built**.

**Rationale**: Principle XIV — *"generalize the design, not the code … any later convergence is an
adapter, not a rewrite"*. The invoice PDF is a legal document with numbering, KSeF interplay and
existing operator templates; migrating stored invoice templates is a separate, owner-approved change
with its own data migration and regression surface.

**Alternatives rejected**: migrate invoices now (scope and risk, and nobody asked); extract shared
helpers (`embed-logo-images.ts`, font setup) out of `invoices` into the new module and make
`invoices` import them (a cross-module code dependency from a legal-document module onto a switchable
one, for ~100 lines).

## R-5 — The host seam: a contribution registry plus a gated render port

**Decision**: Two seams, both typed in `packages/contracts/src/document-templates.ts`:

1. **`documentTypeRegistry`** — an ungated contribution registry (`AdminSearchProviderRegistryPort`
   idiom): a host calls `register(registration)` from its contribution-only boot hook; the registry
   filters by the registering module's effective presence on every read. The registration carries
   functions — block renderers, sample data, built-in layout, merge-field resolution, orientation hint
   — that a manifest cannot carry.
2. **`documentRenderPort`** — `ctx.di.providePort` (gated). `render({ documentType, salesChannelId,
   language, data })` resolves the template, renders and returns the bytes plus which template was
   used. The host passes its data in; the core hands it, opaque, to the host's own block renderers.

`comparisons` declares both in `nonBindingDependencies`: `documentTypeRegistry` as **`contributes-to`**
and `documentRenderPort` as **`degrades-without`** (`whenAbsent`: "comparison PDFs use the fixed
built-in layout"), probing `effectiveState.isPresent('document_templates')` in front of the port and
calling its retained fixed renderer otherwise (the `catalog` → `inventoryAvailabilityPort` shape,
`packages/modules/catalog/src/backend/index.ts`).

**Rationale**: the data a comparison PDF needs (viewer-priced, audience-filtered view) can only be
produced by `comparisons`, inside the buyer's request and tenant context; letting the core *pull* it
would require the core to know the host's identity model. Push-the-data keeps the core
entity-agnostic (XIV) and keeps tenant scoping where it already is (XI). `degrades-without` rather
than `dependencies` keeps `document_templates.enabled` a real switch: binding it would make switching
templates off refuse while comparisons is on.

**Alternatives rejected**: the core pulls data through a host-registered loader keyed by an id
(needs the host's actor/audience semantics in the core's API); the host renders with a library and
only *reads* the template tree from the core (then the admin preview needs a host route, and the
engine is shipped in every host); a manifest-declared `documentTypes` field reconciled at boot like
`transactionalEmails` (adds a manifest field and a reconciler for data that is code — renderers —
anyway).

## R-6 — Block vocabulary and ownership: a new Page Builder context `document`

**Decision**: Add **`document`** to `pageBuilderContextSchema` (`packages/contracts/src/cms.ts`) and to
`AdminBlockContributionSchema.context` (`packages/contracts/src/admin-contributions.ts`). Blocks are
declared in manifests with `contexts: ['document']` (feature 096 rules, `blockNameRe`):
`document_templates.{Heading,Text,Image,Spacer,Divider,PageBreak}` in category `layout`, and
`comparisons.{ComparisonHeader,ComparisonTable,ComparisonShareLink}` in category `comparison`. A
document type's registration lists which host blocks it offers; core blocks are offered to every
type. One context for *every* document type: it never grows per type.

**Rationale**: the persisted name is permanent and must say its owner (`check:block-names`); manifest
declarations give the palette translated labels (`labelKey` in the owner's bundle — fixing R-2's
English-only descriptor) and presence filtering through the existing manifest machinery
(`resolvedModuleRegistry`, as `cms`' `page-builder-registry.ts` reads it). Feature 096's policy — a
stored block of an absent owner is skipped, never rewritten — applies unchanged.

**Alternatives rejected**: a context per document type (`comparison`, `quote`, …) — a contracts
change per host and a generic block re-declared per context; reusing `invoice` — wrong palette and
wrong owner semantics; blocks declared only in the registry (no manifest) — loses `check:block-names`,
translated labels and the palette machinery.

## R-7 — The editor: invoice editor's shape, feature 141's contributions, server preview as authority

**Decision**: `document_templates` ships one generic editor (`/document-templates/:id`) built like
`InvoiceTemplateEditor.tsx` (Puck + `@endora-commerce/page-builder-admin` chrome +
`@endora-commerce/page-builder-core/editor` plugins). The Puck config is composed from a served
descriptor (core + the type's host blocks, translated labels, fields, default props, categories,
root fields) with `editorConfigFromDescriptor` (`packages/page-builder-core/src/contributions/
descriptor-editor.tsx`): a host's **admin block contribution** for context `document` supplies the
canvas renderer and field overrides (colour pickers, an asset picker), and a block with none gets
the neutral, editable stand-in (FR-018). The **sample data** the canvas draws is served by the
backend from the registration (`GET …/types/:code`), so canvas and PDF preview read the same sample
(fixing R-2's duplicated sample). *Preview PDF* renders the canvas's current tree on the server and
is the authority on what the PDF looks like.

**Rationale**: reuse before build (IX); the 141 contribution path is exactly "a module ships the
editor renderer for its own block"; a single sample removes a drift class.

**Alternatives rejected**: an editor per host (duplication); a live PDF canvas (re-rendering a PDF on
every keystroke is slow and loses Puck's direct manipulation); host canvas renderers that receive no
sample (blocks drawn empty, operator designs blind).

## R-8 — Template model, scope and resolution; the built-in layout is virtual

**Decision**:
- One table `document_templates`; at most one **active** row per `(document_type, scope)`, scope =
  global (`sales_channel_id` null) or one channel — a partial unique index (`data-model.md`).
- **Scope is immutable** after creation; *duplicate* moves a layout to another scope.
- Resolution: channel-active → global-active → **the registration's built-in layout**. A template
  whose tree for the chosen language has no renderable node counts as absent (invoice FR-016's rule).
- The built-in layout is **virtual**: it is the registration's `defaultContent()`, never a seeded row.
  The list shows it as a read-only entry; *Create* copies it.
- Activation is one Command that deactivates the previous active row of the same scope inside the same
  transaction, so the index never sees two and the scope is never momentarily empty.

**Rationale**: a virtual default needs no boot seed, no seed-revision bookkeeping (invoices'
`GENERIC_INVOICE_TEMPLATE_SEED_REVISION`), and — decisively — no write by `comparisons` into a table
`document_templates` owns (`module-migrations.md` item 4a, R2 forbids it). Immutable scope removes the
"move an active template into an occupied scope" conflict and its error code.

**Alternatives rejected**: seeded `is_system` rows per type (above); mutable scope with
deactivate-on-move or a 409 (surprising either way); a separate "assignment" table mapping
`(type, scope) → template` (one more table and Command for what one boolean and an index express).

## R-9 — Languages

**Decision**:
- A template's `content` is `{ schemaVersion: 1, languages: { <content-language-code>: <tree> } }`,
  keyed by the platform's content-language codes (`en-US`, `pl-PL`, as product names are).
- **Render language** (FR-032), decided by the host route: the storefront's locale, which the `PDF`
  button now sends as `Accept-Language` (R-18); else the channel's `defaultLanguage`; else `en-US`.
  The tree is chosen exact → same primary subtag → `en-US`/`en` → first key — the order
  `CatalogQueryService.pickLang` already uses for names, so a PDF never names a product in one
  language and titles it in another.
- The editor lists the platform's active content languages (`GET /api/v1/i18n/config`) and creates a
  missing language as a copy of the current one (FR-014).
- Printed **platform prose** (built-in titles, captions, notes) lives in the built-in layout's
  per-language trees as block props — operator content once copied — so the backend translates by
  choosing a tree (case 1 of `specs/conventions/module-i18n.md`); dates and money are formatted with
  `Intl` for the render language.

**Rationale**: matches invoice templates and CMS pages; a per-language structure is what
`check:default-language-prose` admits for Polish literals in code.

**Alternatives rejected**: one tree with per-field translations (Puck has no per-field i18n; every
text field would become a map); render-time translation of block labels through the `_i18n` port
(adds a binding edge on `_i18n` and makes operator-edited text and platform text indistinguishable).

## R-10 — Merge fields

**Decision**: Text-bearing core blocks and the page header/footer interpolate `{{key}}`. Keys come from
two sources: core (`date`, plus `page` and `pages` in header/footer only) and the registration's
`variables` (declared with module-relative label keys, resolved by `resolveVariables(data,
context)`). A known key with no value prints empty; an unknown key prints verbatim (FR-023, edge
cases). Values are inserted as text — no markup, no expressions.

**Rationale**: the transactional-email templates already teach operators the `{{…}}` idiom
(`transactionalEmails[].variables` in manifests); literal printing of typos is the cheapest
"you misspelled it" signal and shows in the preview.

**Alternatives rejected**: a template language (Handlebars) — new dependency and an execution surface
for admin-authored content; dedicated "merge field" blocks only — clumsy for a sentence like
"Prepared for {{organizationName}} on {{date}}".

## R-11 — Fallbacks: module off, no template, nothing printable

**Decision**: three distinct cases.

| Situation | Comparison PDF |
| --- | --- |
| `document_templates` absent or off | `comparisons`' **fixed renderer, unchanged** (today's layout) — the `degrades-without` branch |
| on, no applicable template, or the applicable one prints nothing | the registration's **built-in layout** through the engine — today's layout, localised |
| on, applicable template | the template |

The fixed renderer stays in `comparisons` and is refactored only to share pure helpers
(`filterRowsByMode`, `pickOrientation`, table layout) with the new blocks; its output is held by its
existing tests (`comparison-pdf-renderer.test.ts`, `…-bytes.test.ts`).

**Rationale**: Principle XVII — an off module behaves as never installed, and comparisons must not
fail because a switchable sibling is off. Keeping the fixed renderer byte-stable makes the off path
verifiable by the existing tests.

**Alternatives rejected**: make `document_templates` a binding dependency of `comparisons` and delete
the fixed renderer (templates could not be switched off while comparisons is on); render the
built-in layout without the engine when off (needs the engine in `comparisons` — R-3's library
alternative again). [Q5 asks the owner whether the localised built-in layout should replace today's
layout immediately.]

## R-12 — Images and network access

**Decision**: The core `Image` block takes an **assets-library asset id only**; bytes are read through
`assetReadPort.openAssetBytes` and inlined as data URIs (PNG/JPEG; others skipped), with pdfmake's URL
policy denying everything. No free-URL source. Host blocks bring their own images (comparisons keeps
`AssetByteFetcher` for product images). `assets_library` is a binding dependency — it is
`nonDeactivatable` (`packages/modules/assets_library/src/manifest.ts`), so the edge disables nothing.

**Rationale**: a free URL fetched server-side on behalf of an admin-authored template is an SSRF
primitive (`embed-logo-images.ts`' `fetchExternalImage` is one); the assets library already serves
every image an operator legitimately uploads.

**Alternatives rejected**: copy invoices' URL source (SSRF); allow-listed hosts (configuration surface
for no stated need).

## R-13 — Auditing through the Command Bus; no undo, no events

**Decision**: Every write is a Command run by `CommandBus.run` (`packages/platform/src/commands/
command-bus.ts`), `objectType: 'document_template'`: `document_template.create` (also duplicate),
`.rename`, `.save_content`, `.activate`, `.deactivate`, `.delete`. Audit state carries identity,
scope, version, active flag and, for content, the language and a SHA-256 of the saved tree — not the
tree (size). No Command is reversible; no domain event is emitted. The service never calls the audit
writer (contrast `invoice-template-service.ts`).

**Rationale**: Principle XIII; content digests make "what changed" verifiable without bloating
`audit_log_entries`. Undo of a layout save is better served by *duplicate before editing* (and, if the
owner wants it, a version history — Q6) than by the bulk-undo machinery, which is built for
per-record field restores.

**Alternatives rejected**: full tree in audit state (hundreds of KB per save); reversible
`save_content` (conflict model built for bulk field edits).

## R-14 — Caching: none

**Decision**: No cache. A render reads at most two indexed rows (`document_type`, `sales_channel_id`,
`active`) — the cost is noise next to image fetching and pdfmake. Consequently no invalidation, no
pub/sub channel and no event.

**Rationale**: Principle IV; PDF export is a human click, not a hot path. If measurement (SC-003)
ever says otherwise, the platform's pattern is an in-process cache dropped on a lifecycle pub/sub
message published after the Commands commit; nothing in this design prevents adding it.

## R-15 — Tenancy and channel scoping

**Decision**: `DocumentTemplate` is `@GlobalEntity()` (platform-global configuration, as
`InvoiceTemplate`). Tenant data enters a render only as the `data` the host passes in, which
`comparisons` builds under the buyer's request context exactly as the page does (Principle XI is
unchanged on that path). The channel is the request's resolved channel (`getResolvedChannel`, which
throws rather than returning null); a channel-scoped template is selected only by exact channel id, so
an unresolved channel can never match one (Principle XII: fail closed). Channel ids written by the
admin are validated through the kernel's `salesChannelResolutionPort.getById` and protected by an
FK to the kernel-owned `sales_channels` table with `on delete cascade`.

**Required tests**: a template of channel B is never used for a channel-A export; a buyer of
organisation A exporting never sees organisation B's prices or restricted products (existing view
guarantees, re-asserted through the new path); a template cannot reference data outside what the host
passed (engine unit test: blocks receive only `data`, `props`, `language`, `variables`).

## R-16 — Permissions, palette, navigation

**Decision**: `document_templates:read` (list, type detail, builder config, template detail, preview)
and `document_templates:write` (every Command). Palette action `open-document-templates` →
`/document-templates` (`requiredPermission: 'document_templates:read'`, keywords include `pdf`,
`template`, `szablon`, `comparison`, `porównanie`, `dokument`). Sidebar entry in section `content`.
`comparisons`' admin list page shows a *PDF template* link to
`/document-templates?type=comparisons.comparison`, rendered only when `useModulePresence()` reports
`document_templates` present and the admin holds `document_templates:read`.

**Rationale**: `requireAdmin` literals must be resolvable constants (`module-admin-surfaces.md`), so
per-document-type permissions would have to be the *host's* codes enforced by the core's routes —
computed, which the inventory refuses. Two module-level codes are the honest granularity.

**Alternatives rejected**: reuse `comparisons:*` (the core would enforce a host's code; and
`comparisons` has no write code); per-type codes generated from registrations (not literal).

## R-17 — Failure policy inside a render

**Decision**: A **host block renderer that throws fails the render** (`DOCUMENT_RENDER_FAILED`, logged
with template id, version, block name), and the comparisons route answers its existing
`PDF_GENERATION_FAILED`. Image failures are handled inside blocks and never throw (FR-035). A
`ModuleDisabledError` raised inside a renderer is re-thrown, never swallowed
(`rethrowIfModuleDisabled`, `module-composition.md` item 7).

**Rationale**: invoices treat contributed *enrichments* as optional because an invoice is a legal
document that must always render; a comparison PDF silently missing its table is worse than an
explicit, retryable error.

## R-18 — Storefront changes

**Decision**: `exportComparisonPdf({ locale, hideEmptyRows })` sends `Accept-Language: <storefront
locale>` and `?hideEmptyRows=true|false`; `app/compare/page.tsx` passes the server context's `locale`
to `ComparisonTable`. The `PDF` button's own two Polish literals (`Generowanie…`, `Nie udało się
wygenerować PDF.`) move to `storefront/lib/i18n/messages.ts` (en + pl), because the button is touched.
No other storefront change; the page stays SSR-capable (VII).

**Rationale**: the backend cannot know the storefront's language from a browser `fetch` otherwise
(R-1), and the PDF must mirror the screen (FR-020).

## R-19 — No new runtime dependency

`pdfmake` (with its bundled Roboto, which covers Polish diacritics, and its native `qr` node for the
share-link QR code), `@puckeditor/core`, the page-builder packages, Zod and MikroORM are all present.
`document_templates`' generated `package.json` peers on `pdfmake` and `@types/pdfmake` exactly as
`comparisons` and `invoices` do. pdfmake's font and URL-policy setters are process-global; every module
sets the same values (Roboto; deny-all), so a third setter changes nothing — recorded so nobody
"fixes" it into a shared mutable seam.

## R-20 — Limits and performance

**Decision**: per language ≤ 200 top-level nodes; serialized `content` ≤ 512 KiB; ≤ 10 languages per
template; text props ≤ 5 000 characters; images per template ≤ 20; comparison table
`productsPerTable` 1–8 (default 4). Enforced by Zod on write (`DOCUMENT_TEMPLATE_INVALID`, 422 with the
path) and defensively at render (excess nodes ignored). SC-003 is a perf test at 16 products.

## R-21 — Defects observed and left out of scope

- `storefront/app/compare/page.tsx` hard-codes Polish breadcrumbs, heading and description, and
  `ComparisonTable.tsx` other Polish labels — Principle-VIII-compliant (string literals) but against
  the i18n policy. Only the `PDF` button's strings are fixed here (R-18); the rest belongs to a
  storefront i18n sweep.
- Invoice templates' English-only descriptor labels, duplicated sample and hand-written audit
  (R-2) — candidates for the later invoices adapter, not this feature.

## R-22 — Reuse path for the quote-request PDF (not built)

A later feature adds, inside `quote_requests` only: block declarations with `contexts: ['document']`;
a `quote_requests.quote` registration (blocks, sample quote, built-in layout, merge fields); admin
block contributions for its canvas; and a `PDF` route calling `documentRenderPort` behind a presence
probe. `document_templates` changes nothing (FR-070, SC-007 — proven now by the fixture document type
in the test suite, `tasks.md` US5).
