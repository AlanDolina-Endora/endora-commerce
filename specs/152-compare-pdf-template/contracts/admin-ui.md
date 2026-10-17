# Contract: Admin UI — Document templates screens, editor, discoverability

**Owner**: `document_templates` (`packages/modules/document_templates/src/admin/`), with one link and
three block contributions from `comparisons`. Built from `@endora-commerce/admin-kit` and the
page-builder packages only (Principle IX); UX rules per `.claude/skills/ux-laws/SKILL.md`.

## 1. Contributions (`src/admin/index.ts`)

| Kind | Value |
| --- | --- |
| route | `/document-templates` → `pages/DocumentTemplatesPage`, `requiredPermission: 'document_templates:read'`, `index: true` |
| route | `/document-templates/:id` → `pages/DocumentTemplateEditor`, `requiredPermission: 'document_templates:read'` |
| nav | `{ to: '/document-templates', labelKey: 'nav.documentTemplates.label', icon: 'FileText', section: 'content', requiredPermission: 'document_templates:read' }` |

Manifest `actions` (Principle XVI): `open-document-templates` → `/document-templates`, `icon:
'FileText'`, `requiredPermission: 'document_templates:read'`, keywords `['pdf', 'template', 'document
template', 'comparison pdf', 'szablon', 'szablon pdf', 'porównanie', 'dokument']`, weight 650.

## 2. `/document-templates` — list

- One card per available document type (route 1), label and description in the owner's namespace;
  `?type=<code>` scrolls to and expands that card (the `comparisons` link uses it).
- Inside a card: the **Built-in layout** row (badge *Built-in*, actions *Preview*, *Create from this*),
  then templates (route 4) as a table: name, scope (*All channels* / channel name), languages, status
  badge (*Active* / *Inactive*), last change; row actions *Edit*, *Duplicate…*, *Activate* /
  *Deactivate*, *Delete…*.
- *New template* dialog: name, scope (select: all channels + each channel), source (built-in or an
  existing template of the type), *Activate now* checkbox.
- *Delete…* on an active template: confirmation naming the fallback (FR-007).
- Without `document_templates:write`: every mutating control hidden; *Preview* and *Edit* (read-only)
  remain.
- States: loading skeleton, empty (no types available → explains that a module providing documents
  must be enabled), error with retry.

## 3. `/document-templates/:id` — editor

Structure follows `InvoiceTemplateEditor.tsx`: `PageHeader` with name, scope and status; `Puck` with
`withPuckLegacySideBar`, outline plugin, `PageBuilderHeaderActions`, `PageBuilderOverlayBridge`,
full-screen toggle, `SaveButtonGroup`.

- **Config**: route 3's descriptor through `editorConfigFromDescriptor` — core blocks rendered by this
  module's own editor configs; host blocks by `useAdminBlockContributions('document')` for the
  owner; anything else the neutral stand-in (FR-018). Root fields from `rootFields`.
- **Sample**: route 2's `sample` provided through `DocumentSampleProvider`
  (`@endora-commerce/page-builder-core/contributions`), read by contributed renderers via
  `useDocumentSample<T>()`; refetched when the language changes.
- **Language switcher**: active content languages from `GET /api/v1/i18n/config`; languages present in
  the template marked; choosing an absent one offers *Start from <current language>* (FR-014).
- **Merge fields panel**: route 2's `variables`, each with label and a copy-to-clipboard `{{key}}`
  chip; header/footer-only keys marked.
- **Preview PDF**: POST route 12 with the canvas tree and current language; opens the PDF in a new
  tab; button busy state; error toast with the translated envelope message.
- **Save**: PUT route 8 with `expectedVersion`; on `VERSION_CONFLICT` a blocking dialog offering
  *Reload* (discard local) — never a silent overwrite.
- **Activate / Deactivate** in the header, with the same version handling.
- Read-only mode without `document_templates:write`: Puck in read-only, Save/Activate hidden,
  Preview available.

## 4. `comparisons` admin

`ComparisonsListPage.tsx` header: secondary button *PDF template* (`lucide` `FileText`) linking to
`/document-templates?type=comparisons.comparison`; rendered only when
`useModulePresence()` reports `document_templates` present **and** `hasPermission('document_templates:read')`.

## 5. Page-builder-core additions (`packages/page-builder-core/src/contributions/`)

- `DocumentBlockEditorConfig` — `PageBuilderBlockEditorConfig` whose `render` may call
  `useDocumentSample()`.
- `DocumentSampleProvider` / `useDocumentSample<T>()` — React context; `null` outside a provider (the
  renderer draws a neutral box then).
- `AdminBlockContributionSchema.context` gains `'document'`; `useAdminBlockContributions` accepts it.

## 6. i18n keys (flat, both `en.json` and `pl.json`)

`document_templates`: `nav.documentTemplates.label`, `actions.openDocumentTemplates.{label,description}`,
`adminRoles.permission.document_templates:read`, `adminRoles.permission.document_templates:write`,
`blocks.category.layout`, `blocks.{heading,text,image,spacer,divider,pageBreak}.{label,description}`,
`root.fields.*`, `variables.date`, `variables.page`, `variables.pages`, `page.*` / `editor.*` /
`dialog.*` strings of §2–§3, `errors.DOCUMENT_TEMPLATE_NOT_FOUND`, `errors.DOCUMENT_TYPE_NOT_AVAILABLE`,
`errors.DOCUMENT_TEMPLATE_INVALID`, `errors.DOCUMENT_TEMPLATE_ACTIVE`, `errors.DOCUMENT_RENDER_FAILED`.

`comparisons`: `documentTypes.comparison.{label,description}`,
`documentTypes.comparison.variables.{productCount,channelName,customerName,organizationName,shareUrl}`,
`blocks.category.comparison`, `blocks.{comparisonHeader,comparisonTable,comparisonShareLink}.{label,description}`,
the field labels of the three editor configs, `list.pdfTemplate`.

## 7. Tests owed

`admin/test/modules/document_templates/` (or co-located under the module's `src/admin/`, per
`specs/106-module-owned-tests/contracts/module-test-ownership.md`): list renders types, built-in row
and templates; write controls hidden without the code; editor composes core + contributed + stand-in
blocks; version-conflict dialog; preview posts the canvas tree; language copy flow. `axe-core` (admin
devDependency since feature 147) on both pages in `<StrictMode>`. `comparisons`: link shown only with
presence + permission.
