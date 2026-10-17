# Contract: admin UI — the export dialog and the Line items table editor

**Normative for**: `quote_requests` admin (`QR/src/admin`) and `document_templates` admin
(`DT/src/admin`). UX rules: `.claude/skills/ux-laws/SKILL.md` (WCAG 2.2 AA, design tokens, required
component states). Reuse: `@endora-commerce/admin-kit` (`ModalDialog`, `Select`, `Button`, `Alert`,
`Badge`, `useReorderList`, `TouchReorderButtons`, `ReorderAnnouncer`, `useModulePresence`).

## 1. Quote detail — *Export PDF* (`QR/src/admin/pages/RfqDetail.tsx`)

- A secondary button *Export PDF* (icon `FileDown` or the closest in `KnownIconNameSchema`) in the
  `PageHeader` actions, rendered only when `isPresent('document_templates')` and the quote is loaded
  (the screen is already gated by `rfqs:handle`). Every state of the quote (Q3).
- Opens `QuoteRequestPdfDialog` (`QR/src/admin/components/QuoteRequestPdfDialog.tsx`), which on open
  calls route Q1.
  - **Template** — `Select` listing *Built-in layout* (only when `effectiveDefaultId` is `null`), then
    channel templates, then all-channel templates, each with a *Default* badge and a channel caption.
    Preselected: `rememberedTemplateId` when present and not missing, else `effectiveDefaultId`, else
    built-in.
  - **Language** — `Select` of the selected option's `languages` (built-in: `builtInLanguages`),
    preselected `suggestedLanguage` when offered, else the first; labels from the content-languages list.
  - **Alert (warning)** when `rememberedTemplateMissing`: "The template chosen for this quote no longer
    exists. The default is selected."
  - **Hint** under the template select: "Your choice is remembered for this quote." (Q2).
  - **Link** *Manage PDF templates* → `/document-templates?type=quote_requests.quote_request`, only with
    `document_templates:read`.
  - **Primary** *Download PDF* → route Q3 as a blob. The selection is sent as `templateId` **only when
    it differs from what an export without a choice would use** (the remembered template, else the
    effective default), so exporting with the preselected default does not pin the quote to today's
    default; the server remembers a sent `templateId` that differs from the remembered one. Selecting
    *Built-in layout* while a template is remembered first calls route Q2 with `null`, then Q3 without
    `templateId`. The file is saved under the server's file name and the dialog closes. Busy state disables both
    buttons and shows progress text; failure keeps the dialog open with a translated error
    (`errors.<CODE>` lookup as in 152's editor). If the response says
    `X-Document-Template-Missing: true`, a toast says the default was used.
- States: loading (skeleton rows), empty (only the built-in layout — still exportable), error (retry),
  conflict impossible (no versioned write).

## 2. Line items table editor (`DT/src/admin/blocks/items-table/`)

Supplied by the facility's `coreBlockCanvas` for `document_templates.ItemsTable`: a canvas renderer and
custom Puck fields overriding the descriptor's `columns`, `detailRow`, `totals`, `grouping`,
`collection`. The editor page (`DocumentTemplateEditor.tsx`) wraps Puck in a facility-local
`DocumentCollectionsProvider` fed from `DocumentTypeDetail.collections` for the edited language.

- **Collection** — hidden when the type declares one collection; a `Select` otherwise.
- **Columns field** — an ordered list; each row shows the field's name (or *Unknown field* with a
  warning icon, FR-037), its header label, an **Internal** badge for `audience: 'internal'` with the
  tooltip "Customers do not otherwise see this value" (Q7), a visibility summary, and buttons
  *Edit*, *Move up*, *Move down* (`TouchReorderButtons`, keyboard reachable, moves announced by
  `ReorderAnnouncer`), *Remove* (disabled on the last column).
  - *Add column* opens a picker: search box + fields grouped by `group` (*Line*, *Pricing*,
    *Product attributes*, host groups), each with its name and Internal badge; picking adds a column with
    the field's `defaultFormat`/`defaultAlign`, empty label, `visibleWhen: always`, width `auto`.
  - *Edit* expands the row inline: header label (placeholder = the catalogue name), width (segmented:
    Auto / Fill / Fixed + number pt), alignment, format controls by value kind (decimals; currency
    display; date style), empty text, visibility (radio: *Always* / *Only if any line has a value* /
    *Never*).
  - Limit 16: *Add column* disabled with the reason as visible text.
- **Detail row field** — switch *Show a detail row under each line*; entries list with the same picker,
  label, visibility (*Only if it has a value* default / *Always* / *Never*), reorder, remove; separator,
  italics, font size.
- **Totals field** — list of the collection's summary fields with label, visibility (*Only if it has a
  value* default / *Always* / *Never*), *Emphasise*; reorder; Internal badge.
- **Grouping field** — `Select` *No grouping* or a field; empty-value label; subtotal field (numeric and
  money fields only) and its label.
- **Canvas** — an HTML table drawn over `sampleItems`/`sampleSummary` with the **same** shared
  functions as the PDF (`formatDocumentValue`, `evaluateDocumentCondition`, `sumDocumentValues`),
  repeating nothing of pagination; hidden-by-rule columns are drawn faded with an "hidden in this
  sample" caption so the operator can still select them.
- The merge-fields panel (152 `MergeFieldsPanel`) is unchanged; it does not list `item.*` (FR-045).

## 3. Document templates list

`DocumentTemplatesPage` needs no change for the new type (152 lists every present type). The
`?type=` deep link already exists.

## 4. i18n keys (flat; `en.json` and `pl.json` of the owning module)

`document_templates`:
`blocks.itemsTable.label` / `.description`, `blocks.category.data`, `itemsTable.collection`,
`itemsTable.columns.title`, `.add`, `.edit`, `.remove`, `.moveUp`, `.moveDown`, `.limit`, `.empty`,
`.unknownField`, `.internal`, `.internalHint`, `.label`, `.labelPlaceholder`, `.width`, `.width.auto`,
`.width.fill`, `.width.fixed`, `.align`, `.align.auto|left|center|right`, `.format.decimals`,
`.format.currencyDisplay`, `.format.currencyDisplay.symbol|code|none`, `.format.dateStyle`,
`.format.dateStyle.short|medium|long`, `.emptyText`, `.visibility`, `.visibility.always`,
`.visibility.anyHasValue`, `.visibility.hasValue`, `.visibility.never`, `.picker.search`,
`.picker.group.line|pricing|product|other`, `itemsTable.detailRow.*` (title, enable, entries, separator,
italics, fontSize), `itemsTable.totals.*` (title, add, emphasis), `itemsTable.grouping.*` (title, none,
field, emptyLabel, subtotalField, subtotalLabel), `itemsTable.style.*` (headerBackground, borderColor,
fontSize, stripedRows, stripeColor, emptyText), `itemsTable.canvas.hiddenInSample`.

`quote_requests`:
`documentTypes.quoteRequest.label` / `.description`, `documentTypes.quoteRequest.variables.<key>` (14),
`documentTypes.quoteRequest.collections.lines`, `blocks.quoteHeader|quoteParties|quoteNotes|quoteDetails
.label/.description`, `blocks.category.quote`, `pdf.export`, `pdf.dialog.title`, `.template`,
`.builtIn`, `.default`, `.allChannels`, `.language`, `.remembered`, `.rememberedMissing`, `.manage`,
`.download`, `.downloading`, `.error`, `.fallbackUsed`.

Backend-printed texts (catalogue names, built-in layout, block defaults, status labels on the PDF) live in
`QR/src/backend/document/texts.ts` (research R-20), not in the bundles.

## 5. Tests owed (`admin/test/modules/{quote_requests,document_templates}/`, `<StrictMode>`, `axe-core`)

- Dialog: hidden while the facility is absent; preselection rules (remembered / missing → default /
  built-in); language list follows the template; download calls Q3 with `templateId` only when needed;
  error and busy states; *Manage PDF templates* only with the permission; no axe violations.
- Columns field: add from the grouped picker, reorder by keyboard with announcement, edit and remove,
  limit message, unknown-field and Internal badges; detail/totals/grouping fields write the props shape of
  `data-model.md` §2; canvas hides `never` and `any_has_value`-without-value columns as the PDF would.
