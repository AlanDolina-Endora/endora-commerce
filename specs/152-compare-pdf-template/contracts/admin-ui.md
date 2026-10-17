# Contract: Admin UI — Document templates screens, editor, discoverability

**Owner**: `document_templates` (`packages/modules/document_templates/src/admin/`), with block
contributions and links from `comparisons` and `invoices`. Built from `@endora-commerce/admin-kit` and
the page-builder packages only (Principle IX); UX rules per `.claude/skills/ux-laws/SKILL.md`.

## 1. Contributions (`src/admin/index.ts`)

| Kind | Value |
| --- | --- |
| route | `/document-templates` → `pages/DocumentTemplatesPage`, `requiredPermission: 'document_templates:read'`, `index: true` |
| route | `/document-templates/:id` → `pages/DocumentTemplateEditor`, `requiredPermission: 'document_templates:read'` |
| nav | `{ to: '/document-templates', labelKey: 'nav.documentTemplates.label', icon: 'FileText', section: 'content', requiredPermission: 'document_templates:read' }` |

Manifest `actions` (Principle XVI): `open-document-templates` → `/document-templates`, `icon:
'FileText'`, `requiredPermission: 'document_templates:read'`, keywords `['pdf', 'template', 'document
template', 'comparison pdf', 'invoice template', 'szablon', 'szablon pdf', 'szablon faktury',
'porównanie', 'dokument']`, weight 650. (`invoices`' former `invoice-templates` action is removed —
FR-090 is met by these keywords.)

## 2. `/document-templates` — list

- One card per available document type (route 1), label and description in the owner's namespace;
  `?type=<code>` scrolls to and expands that card (the `comparisons` button and the invoices tab use it).
- Inside a card: the **Built-in layout** row (badge *Built-in*, *Preview*, *Create from this*), then
  templates (route 4) grouped by scope (*All channels* first, then each channel): name, languages,
  *Default* badge, last change; row actions *Edit*, *Duplicate…*, *Set as default* / *Clear default*,
  *Delete…*.
- *New template* dialog: name, scope (all channels + each channel), source (built-in or an existing
  template of the type), *Set as default* checkbox (unticked).
- *Delete…* on a default template: confirmation naming what applies instead (FR-007), sends
  `confirmDefault`.
- Without `document_templates:write`: mutating controls hidden; *Preview* and *Edit* (read-only) remain.
- States: loading skeleton; empty (no document type available → explains that a module providing
  documents must be enabled); error with retry.

## 3. `/document-templates/:id` — editor

Structure follows today's `InvoiceTemplateEditor.tsx`: `PageHeader` with name, type, scope and
*Default* badge; `Puck` with `withPuckLegacySideBar`, outline plugin, `PageBuilderHeaderActions`,
`PageBuilderOverlayBridge`, full-screen toggle, `SaveButtonGroup`.

- **Palette = the type's blocks only** (owner Q1): route 3 lists exactly the type's palette; the
  config is built from it with `editorConfigFromDescriptor`. Canvas renderers: core blocks — this
  module's own editor configs; type blocks — `useAdminBlockContributions('document')` of the owning
  module; anything without a renderer (e.g. `ksef.InvoiceSection`, or a block of an absent owner) — the
  neutral, editable stand-in (FR-018). Declared `defaultProps` merge under stored props (what
  `hydrateInvoiceDefaults` did). Root fields from `rootFields`, defaults from route 2's `pageDefaults`.
- **Sample**: route 2's `sample` through `DocumentSampleProvider`; contributed renderers read it with
  `useDocumentSample<T>()`; refetched per language.
- **Language switcher**: route 2's `languages`, or — when `null` — active content languages from
  `GET /api/v1/i18n/config`. Hidden when the type allows one language (invoices: Polish only, N5).
  Choosing an absent language offers *Start from <current language>* (FR-014).
- **Merge fields panel**: route 2's `variables` (hidden when none — invoices); copy-to-clipboard
  `{{key}}` chips; header/footer-only keys marked.
- **Preview PDF**: POST route 12 with the canvas tree and language; opens in a new tab; busy state;
  translated error toast.
- **Save**: PUT route 8 with `expectedVersion`; `VERSION_CONFLICT` → blocking dialog offering *Reload*
  — never a silent overwrite; `DOCUMENT_TEMPLATE_INVALID` with `details.blockName` → the offending block
  selected in the outline.
- **Set as default / Clear default** in the header, same version handling.
- Read-only without `document_templates:write`.

## 4. Links from host modules

- `comparisons` — `ComparisonsListPage.tsx` header button *PDF template* → `/document-templates?type=
  comparisons.comparison`, rendered only when `useModulePresence()` reports `document_templates` present
  **and** `hasPermission('document_templates:read')`.
- `invoices` — `InvoiceSectionTabs` *Templates* tab → `/document-templates?type=invoices.invoice`
  (shown with `document_templates:read`; `document_templates` is a binding dependency, so it is present
  whenever invoices are). Redirect routes `/invoices/templates` and `/invoices/templates/:id` →
  `contracts/invoice-document.md` §4.

## 5. Page-builder-core / admin-kit additions

- `DocumentBlockEditorConfig` — `PageBuilderBlockEditorConfig` whose `render` may call
  `useDocumentSample()`.
- `DocumentSampleProvider` / `useDocumentSample<T>()` — React context; `null` outside a provider.
- `AdminBlockContributionSchema.context` gains `'document'`; `useAdminBlockContributions` accepts it.

## 6. i18n keys (flat, both `en.json` and `pl.json`)

`document_templates`: `nav.documentTemplates.label`, `actions.openDocumentTemplates.{label,description}`,
`adminRoles.permission.document_templates:{read,write}`, `blocks.category.layout`,
`blocks.{heading,text,image,spacer,divider,pageBreak}.{label,description}`, `root.fields.*`,
`variables.{date,page,pages}`, `page.*` / `editor.*` / `dialog.*` strings of §2–§3, and
`errors.{DOCUMENT_TEMPLATE_NOT_FOUND,DOCUMENT_TYPE_NOT_AVAILABLE,DOCUMENT_TEMPLATE_INVALID,
DOCUMENT_TEMPLATE_IS_DEFAULT,DOCUMENT_TEMPLATE_NOT_SELECTABLE,DOCUMENT_RENDER_FAILED}`.

`comparisons`: `documentTypes.comparison.{label,description}`,
`documentTypes.comparison.variables.{productCount,channelName,customerName,organizationName,shareUrl}`,
`blocks.category.comparison`, `blocks.{comparisonHeader,comparisonTable,comparisonShareLink}.{label,description}`,
editor field labels, `list.pdfTemplate`.

`invoices`: `documentTypes.invoice.{label,description}`, the invoice block field labels (moved from the
English literals of `pdf-components/descriptor.ts`); **removed** from `_i18n`: `invoiceTemplates.*`,
`appShell.nav.invoiceTemplates`.

## 7. Tests owed

`admin/test/modules/document_templates/`: list renders both types, built-in rows, scopes and default
badges; write controls hidden without the code; the comparison editor's palette has 3 + 6 blocks and
no invoice block; the invoice editor's palette has the 10 invoice blocks + a contributed one and no
core block, no language switcher, no merge-field panel; stand-in keeps an unknown block's props
through a save; version-conflict dialog; preview posts the canvas tree; language copy flow. `axe-core`
on both pages in `<StrictMode>`. `comparisons`: button shown only with presence + permission.
`invoices`: redirects land on the new routes with the same id; the tab points at the invoice card.
