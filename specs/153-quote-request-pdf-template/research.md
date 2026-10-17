# Research: Quote request PDF export, per-quote template, configurable line-items table

**Feature**: `specs/153-quote-request-pdf-template/` | **Date**: 2026-10-17
**Builds on**: `specs/152-compare-pdf-template/` (the `document_templates` facility) and
`specs/146-quote-request-pricing-history/` (reference price on quote lines).

Every decision is stated as **decision → rationale → alternatives rejected**. Facts are cited to files
in this checkout. Abbreviations: `DT` = `packages/modules/document_templates`, `QR` =
`packages/modules/quote_requests`, `CT` = `packages/contracts/src`.

---

## R-1 — What a quote line holds today (facts)

`QR/src/backend/entities/quote-request-item.entity.ts` and the admin projection
`QR/src/backend/services/rfq-service.ts` `serializeFull`:

| Datum | Source | Notes |
| --- | --- | --- |
| product name | `productName` snapshot | packaging-unit name already appended (feature 043) |
| variant | `variantLabel` snapshot | |
| quantity | `quantity` (integer) | in base pieces |
| packaging unit | `packagingUnitName`, `packagingUnitBaseQuantity` | nullable pair |
| customer's proposal | `desiredUnitPrice`, or the submission record (146 `customerProposedUnitPrice`) | customer sees `desiredUnitPrice` |
| agreed unit price | `agreedUnitPrice` (net) | `null` until a representative prices it |
| reference ("list") unit price | `referenceUnitPrice`, `referenceCurrency`, `referenceCapturedAt` | 146: **admin-only**, never on a customer reply (threat model T7, `customer-projection.ts`) |
| `discountPercent` | column | **never written by any path** (146 spec, *Current state*) |
| currency | `lineCurrency` | hard-coded `PLN` on every write path (146) |
| line note | `lineNote` | |
| VAT rate | not stored; `taxRateForOrganization` at read | one rate per quote (organisation VAT status) |

Not in the data at all: **SKU** (only `productId`; the catalogue has it through
`CatalogProductReadPort.findByIds` / `listVariantsByProductIds`), **unit of measure** (the catalogue has
none; only packaging units), **lead time** (no field anywhere in `catalog` or `CT`), **line-level
custom fields** (`CT/custom-fields.ts` `supportedEntityTypeSchema` attaches custom fields to
`quote_request`, never to its lines). Product attributes live in
`CatalogProductRecord.attributeValues`, their definitions and labels in `CatalogAttributeReadPort`
(`CT/catalog.ts`). The quote header has `customFieldValues`, whose definitions carry an audience
(`customer` / `internal`, `CT/custom-fields.ts`).

Totals today (`QR/src/backend/services/summarize.ts`): **every line or `null`** — the agreed total exists
only when every line has an agreed price; gross = net × (1 + taxRate).

## R-2 — What the merged facility offers a per-document host, and what it lacks (facts)

Present (`DT/src`, `CT/document-templates.ts`): `selection: 'per_document'`, `render({ templateId })`
with the 152 FR-037–FR-039 rules (`services/template-resolver.ts`), `requestedTemplateMissing` in the
result, `GET /api/v1/admin/document-templates?type=…&applicableToChannel=<id>` (route 4) for a picker,
per-type palettes, built-in layout, per-language trees, merge fields (`rendering/merge-fields.ts`).

Missing for this feature:

1. **No notion of a document's lines.** Every table is a host-owned block with its own props
   (`comparisons/src/backend/document/blocks/table.ts`, invoices' `InvoiceLineItems`). Nothing lets a
   template choose columns from a catalogue.
2. **The picker list needs `document_templates:read`** (route 4 is behind it,
   `DT/src/backend/routes.admin.ts`). A sales representative holds `rfqs:handle`; making them hold the
   template-management code to *pick* a template couples two permission domains (R-14).
3. **Merge-field keys cannot carry a path**: `mergeFieldKeyRe = /^[a-z][A-Za-z0-9]*$/` and the
   interpolator's regex do not match a dot, so `{{item.sku}}` prints verbatim today — which is exactly
   the reservation D3 needs (R-23).
4. **Nested layouts are refused** (`documentTemplateTreeSchema` rejects `zones`; the renderer walks
   `content` flat). A repeater needs a slot; that is the repeater feature's change, not this one (R-23).
5. The US6 stand-in `backend/test/fixtures/document-types/fixture-document-type.ts` registers
   `quote_requests.fixture_note` under this module's id (R-24).

## R-3 — Where the configurable table lives: a facility-owned, data-bound block

**Decision**: `document_templates` owns one new block, **`document_templates.ItemsTable`** ("Line items
table"), and a new registration member, **`collections`**: a document type declares its line
collections (field catalogue, lines, totals); the block binds to one collection by key and does all the
rendering. The block is offered to a type **iff the type declares at least one collection** — a third
palette rule beside "type blocks" and "core blocks the type opts into" (`DocumentTypeRegistry.palette`).

**Rationale**: owner D2 asks for the generic machinery in the facility so invoices and the comparison
can adopt it. A facility-owned block is the only shape in which a host adopts it by *declaring data*
and writes no renderer and no editor: the host never imports facility code (Principle I —
`check:module-boundary` forbids reaching into `DT/src`), and the column editor, the renderer, the
formatter and the save-time validation exist once. It is the same idiom as the core blocks (owned and
rendered by the facility, offered per type), extended with a data binding — and it is what the future
repeater binds to as well (R-23).

**Alternatives rejected**:
- *Host-owned block (`quote_requests.QuoteLineItems`) calling a shared table renderer*: the renderer
  would have to live in a package every host may import — `@endora-commerce/contracts` holding pdfmake
  layout code, or a new package — and the column editor would still need a host-side copy or a shared
  React package; each adopting host re-implements the binding. More surface, same result.
- *A bespoke quote table with fixed toggles (show SKU / show discount …)* (the comparison table's
  shape): exactly what D2 asks to avoid — a new column means a code change, and nothing is reusable.
- *The generic repeater now*: parked by the owner (D3); it also needs nested layouts (R-2 item 4).

## R-4 — The line field catalogue

**Decision**: a collection declares

```ts
fields(language): Promise<readonly DocumentFieldDefinition[]>   // the catalogue, labels resolved in `language`
items(data): readonly DocumentItem[]                             // synchronous, pure, from the host's own data
summaryFields?(language): Promise<readonly DocumentFieldDefinition[]>
summary?(data): Readonly<Record<string, DocumentValue>>
```

A field definition carries `path` (the key), `label` (resolved for the requested language), `valueKind`,
`group` (`line` | `pricing` | `product` | free host string), `audience` (`customer` | `internal`),
`defaultFormat`, `defaultAlign`, optional `sampleValue`. The **path grammar** is
`^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9_-]{1,100})?$` — a plain key (`sku`, `lineNet`) or one family
segment (`attributes.colour`). The facility reserves the family **`row`** and adds `row.number`
(*Position*) to every collection itself; a host path in `row.*` is a registration error.

**Rationale**:
- **`fields()` is async and language-parameterised** because part of a real catalogue is data: product
  attributes come from `catalogAttributeReadPort.listAll()` with per-locale labels. Expanding families
  into concrete paths (`attributes.colour`) rather than serving "parametric fields" keeps the editor a
  flat, grouped picker and keeps a stored column a plain string.
- **`items()` is synchronous and pure over the host's data**: the host builds its data (including the
  attribute values of the quoted products) before calling the port, exactly as the comparison builds its
  view. The facility never queries anything, a sample is just data, and the function is unit-testable.
- **Labels resolved in the template's language** serve both purposes: the editor (which already asks
  for the type in the edited language, `getDocumentType(code, language)`) and the PDF's default header
  when a column's label is empty.
- **`audience`** is metadata the editor uses now (Q7's warning) and the storefront path needs if Q1 is
  answered "yes" (R-26). Feature 146 already decided which quote data is internal; the catalogue is
  where that knowledge must travel with the field.
- **`sampleValue`**: a sample quote cannot know a shop's attribute codes, so a field may declare the value
  the preview shows when the sample lacks it (otherwise every attribute column previews empty and an
  *only if any line has a value* column vanishes from the preview).

**Alternatives rejected**: a static catalogue on the registration (cannot list a shop's attributes);
host-formatted string values (the template could no longer choose decimals, currency display or
alignment); catalogue labels as i18n keys only (attribute labels are data, not bundle keys).

## R-5 — Values and formatting, shared by the PDF and the editor canvas

**Decision**: values are typed:

```ts
type DocumentValue =
  | { kind: 'text'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'money'; amount: number; currency: string }
  | { kind: 'percent'; value: number }            // 12.5 = 12.5 %
  | { kind: 'date'; value: string }               // ISO date or date-time
  | null;
```

Formatting (`formatDocumentValue(value, format, language)`), "has a value" (`documentValueHasValue`),
rule evaluation (`evaluateDocumentCondition`) and money summing (`sumDocumentValues`) are **pure
functions in `CT/document-templates.ts`**, used by the facility's renderer and by its admin canvas, so the
editor shows exactly what the PDF prints (FR-036). `Intl.NumberFormat` / `Intl.DateTimeFormat` with the
PDF language; money rounded to two decimals after summing.

**Rationale**: the contracts package is the one dependency-free place both the backend and the admin
already import; it already carries pure shared logic (`documentContentByteSize`, the diacritic fold of
`text-normalization.ts` shared by admin and storefront). Two implementations of a formatter are two
answers waiting to disagree.

**Alternatives rejected**: format only on the server and have the canvas call the preview endpoint for
every edit (a round trip per keystroke; the 152 canvas already draws locally over the served sample);
a formatter in `page-builder-core` (a React package the backend renderer should not depend on).

"Has a value": `null`, a missing path, and a text that is empty after trimming have none; every
number — including `0` — has one. A host that means "nothing to say" answers `null` (R-11: no discount
→ `null`, not `0`).

## R-6 — One rule model for visibility, evaluated over a scope

**Decision**:

```ts
type DocumentCondition =
  | { op: 'always' }
  | { op: 'never' }
  | { op: 'has_value'; field?: string }       // the current scope: one item, or the totals
  | { op: 'any_has_value'; field?: string };  // the collection scope: any item
evaluateDocumentCondition(condition, scope: { items?: readonly DocumentItem[]; item?: DocumentItem;
                                              summary?: Readonly<Record<string, DocumentValue>> },
                          defaultField: string): boolean
```

`field` omitted means "the field of the column / entry / row carrying the rule". Columns offer
*always / any_has_value / never*; detail entries and totals rows offer *always / has_value / never*.
At save the schema is strict (an unknown `op` is refused, FR-043); at render an unreadable rule is read
as `always` (hostile-props rule of 152, `DT/src/backend/rendering/props.ts`).

**Rationale**: D3 requires the repeater's "conditional child blocks" to reuse this model. Conditions
are therefore data (a discriminated union with room for `equals`, `not_equals`, `greater_than`,
`all_of`, `any_of`, `not`) evaluated over an explicit **scope** that already has an item level —
exactly what a block inside a repeater needs (`has_value` over the current item). v1 ships the four ops
it uses and nothing more (Principle IV).

**Alternatives rejected**: a visibility enum per column (`'always' | 'if_any' | 'never'`) — reads the
same in the UI but is a dead end for the repeater; an expression language (`"item.discount > 0"`) —
a parser, an injection surface and nothing the owner asked for; reusing `admin-kit`'s
`RuleBuilder` (promotion rules, a different value model) — noted as a candidate UI for the richer ops
later.

## R-7 — Column settings, per-language labels

**Decision**: the column list is stored in the block's props (`columns: DocumentTableColumn[]`), one
object per column: `id`, `field`, `label`, `width` (`'auto' | 'fill' | number` pt 10–400), `align`
(`'auto' | 'left' | 'center' | 'right'`), `format` (`decimals` 0–4, `currencyDisplay`
`'symbol' | 'code' | 'none'`, `dateStyle` `'short' | 'medium' | 'long'`), `emptyText` (≤ 50),
`visibleWhen`. 1–16 columns.

**Per-language header labels come for free**: a template already holds **one tree per language**
(152 R-9), so the Polish tree's column has the Polish label. An empty label prints the catalogue's name
in the tree's language. New language layouts start as a copy (152 FR-014), so the operator translates
labels, not structure.

**Alternatives rejected**: a `{ pl, en }` label map inside one shared column list — a second
translation mechanism beside the per-language trees, and a template could no longer have different
columns per language (a legitimate need: a Polish layout with *PKWiU* attribute column).

## R-8 — Printing the table with pdfmake

**Decision** (`DT/src/backend/rendering/items-table.ts`):

- Columns: drop `never`; drop `any_has_value` columns with no item value; nothing left → `emptyText`
  node. Widths: `auto` → `'auto'`, `fill` → `'*'`, numbers → pt; if the sum of fixed widths exceeds the
  usable width (`context.pageWidth`), scale them proportionally.
- `table.headerRows: 1` (header repeated on every page), `dontBreakRows: true` (a line never splits).
- Detail row: a following row with one cell `colSpan: <visible columns>`; empty → no row. Keeping a
  line with its detail row on one page uses pdfmake's `pageBreakBefore` hook over the detail row's
  node (SHOULD; verified in the quickstart, not by a definition test).
- Grouping: a full-width group header row before each group, an optional full-width subtotal row
  after it; groups in order of first appearance; empty values under `groupEmptyLabel`.
- Totals: a separate two-column table (label, value), right-aligned under the main table,
  `unbreakable: true`; emphasised rows bold with a top border.
- Style props: `headerBackground`, `borderColor`, `fontSize` (6–14), `stripedRows`, `stripeColor`.
- Cell alignment: `auto` → right for `number`, `money`, `percent`; left otherwise.

**Rationale**: pdfmake's own table features give the page-break behaviour D2 asks for; a separate
totals table avoids colSpan arithmetic against a variable column set and keeps the totals together.

**Alternatives rejected**: totals as `colSpan` rows inside the main table (fragile when columns hide);
printing the detail entries inside the first cell (breaks column alignment and widths).

## R-9 — Detail row, totals, grouping — semantics

- **Detail row** (`detailRow`): `enabled`, `entries` (≤ 8: `field`, `label`, `visibleWhen` default
  `has_value`), `separator` (default ` · `), `italics`, `fontSize`. Printed `label: value` (label omitted
  when empty). Item scope.
- **Totals** (`totals`, ≤ 10): `field` (a path of `summaryFields`), `label`, `visibleWhen` (default
  `has_value`), `emphasis`. Summary scope.
- **Grouping** (`grouping`): `field` or `null`, `emptyLabel`, `subtotalField` (a numeric or money item
  field) or `null`, `subtotalLabel`. Subtotal = `sumDocumentValues` over the group (money of one
  currency; mixed currencies → no value).

## R-10 — The *Quote request* document type

**Decision**: `quote_requests` registers **`quote_requests.quote_request`** from a contribution-only
boot hook (152 pattern, `comparisons/src/backend/index.ts`): `selection: 'per_document'`,
`coreBlocks: 'all'`, `languages` absent (every active content language), one collection **`lines`**,
four quote blocks (`QuoteHeader`, `QuoteParties`, `QuoteNotes`, `QuoteDetails`), the merge fields of
FR-023, page defaults A4 portrait, margins 40/32/40/32, 9 pt, the built-in layout in `en-US` and
`pl-PL`, and a fictitious sample quote.

**Rationale**: the code names the entity (`quote_request`, as in `CT/custom-fields.ts`), not a reading
of its state ("quote" / "offer"); it is permanent once stored. 152 R-22 sketched
`quote_requests.quote`; nothing stored uses it.

Seller details are **not** a quote block: they are the operator's text in a core *Text* block (with the
logo in a core *Image* block). The seller settings `invoices.seller.*` belong to `invoices`; reading
them would make `quote_requests` depend on a switchable module for a PDF header.

**Alternatives rejected**: `default_only` (contradicts D1); reading invoice seller settings (above); a
quote-owned totals block (the Line items table's totals already cover it — one place for totals).

## R-11 — Derived pricing semantics

**Decision** (pure, `QR/src/backend/document/quote-lines.ts`):

| Field | Kind | Audience | Value |
| --- | --- | --- | --- |
| `listUnitPrice` | money | internal | `referenceUnitPrice` in `referenceCurrency` |
| `proposedUnitPrice` | money | customer | `desiredUnitPrice` ?? submission-record proposal |
| `unitPrice` | money | customer | `agreedUnitPrice` (net, *price after discount*) |
| `unitGrossPrice` | money | customer | round2(unitPrice × (1 + rate)) |
| `discountPercent` | percent | internal | round2((list − agreed) / list × 100) when list > agreed, same currency, list > 0; else `null` |
| `unitDiscount` | money | internal | round2(list − agreed) under the same condition |
| `lineDiscount` | money | internal | round2(unitDiscount × quantity) |
| `lineListValue` | money | internal | round2(list × quantity) |
| `lineNet` | money | customer | round2(agreed × quantity) |
| `vatRate` | percent | customer | quote rate × 100 |
| `lineVat` | money | customer | round2(lineNet × rate) |
| `lineGross` | money | customer | lineNet + lineVat |

Totals (every line or `null`, `summarize.ts`'s rule): `listTotal` (internal; every line has a list
price in the line currency), `discountTotal` (internal; sum of `lineDiscount`, `null` when every line's
is `null`), `netTotal`, `vatRate`, `vatTotal` = round2(netTotal × rate), `grossTotal` = net + VAT.
Mixed line currencies → every total `null`.

**Rationale**: "list price" in the owner's words is 146's reference price — the customer's own price
captured at request. The stored `discountPercent` column is never written (R-1), so discounts are
derived. VAT from the net total matches the quote screens' "gross = total × (1 + rate)". A line's VAT
column may then differ by a cent from the VAT total; stated in the docs.

**Alternatives rejected**: the *current* list price from `buyerLinePricePort` (moves after the offer was
made; the PDF would disagree with the screen); negative discounts for a price above list (the owner's
example — the discount column disappears when nobody got one — needs "no discount" = no value); VAT
per line summed (disagrees with the quote list's total).

## R-12 — Building the quote's document data

**Decision**: `QuoteRequestDocumentDataBuilder` (`QR/src/backend/document/`) builds
`QuoteRequestDocumentData` (`CT/quote-requests.ts`) **for an administrator**: it loads the quote through
`RfqAdminService`'s visibility rule (`findVisibleForAdmin` — sales-rep organisation scope), the lines,
the tax rate, the organisation (`organizationDetailsPort`), the customer (`customerAccountReadPort`),
the assigned representative (`adminUserReadPort`), the channel name and default language (kernel
`salesChannelResolutionPort`), SKUs and attribute values of the quoted products
(`catalogProductReadPort.findByIds` + `listVariantsByProductIds`), attribute definitions shown on the
product page (`catalogAttributeReadPort.listByFlag('isVisibleOnProductPage')`, option labels via
`optionLabelIndex()`), and the custom fields whose definition's audience is `customer`
(`customFieldDefinitionReadPort`). One read per port per export. Every one of these modules is
already in `QR`'s `dependencies`, and `catalog`, `custom_fields` and `sales_channels` are
`nonDeactivatable`.

Attribute values are stored in the data as display text per line (`attributes: Record<code, string>`),
resolved in the export language with the catalogue's option labels.

**Rationale**: the data is built under the requesting administrator's context, so a template cannot
widen what the PDF shows (152 FR-033, Principle XI). Attributes flagged *visible on product page* are
the ones a customer can already see.

**Alternatives rejected**: all attributes (internal attributes on a customer document); the comparable
attributes flag (a comparison concept).

## R-13 — The chosen template is remembered on the quote (owner answer Q2)

**Decision**: a nullable `document_template_id uuid` column on `quote_requests`, written by one Command
`quote_request.set_document_template` (audit before/after `{ documentTemplateId }`, `skipAudit` when
unchanged — the 146 Command idiom, `QR/src/backend/commands/negotiation-policy-commands.ts`, with the
authority step inside the Command). **No foreign key** (the target is another module's table, and the
quote must survive the template's deletion); a stale id is handled by the port's
`requestedTemplateMissing` fallback (152 R-23). The write does **not** bump `quote_requests.version`,
create a revision or an RFQ event (FR-010): the choice is presentation, not offer content, and bumping
the version would fail a colleague's concurrent offer edit for no reason. The admin quote reply gains
`documentTemplateId` (admin replies only; not in `CUSTOMER_ITEM_KEYS`/the customer reply).

**Rationale**: D1 says the choice is "for each individual quote"; remembering it is the reading that
makes "per quote" mean something beyond one download, and it is what a storefront export (Q1) would
print with. A column on the org-scoped row inherits the tenant filter.

**Alternatives rejected**: a separate `quote_request_document_settings` table (a second org-scoped
entity for one value); a foreign key to `document_templates` (cross-module FK; would make deleting a
template fail or cascade into quotes); bumping `version` (above). The owner confirmed Q2 ("stored, audited,
preselected next time") on 2026-10-17.

## R-14 — The picker's list for sales representatives

**Decision**: `DocumentRenderPort` gains **`listChoices({ documentType, salesChannelId })`**, answering
the type's templates whose scope is global or that channel (`id`, `name`, `salesChannelId`,
`languages`, `isDefault`), the id FR-031 would use without a choice (`effectiveDefaultId`, `null` = the
built-in layout) and the built-in layout's languages. Refused for a `default_only` type
(`DOCUMENT_TEMPLATE_NOT_SELECTABLE`). `quote_requests` serves it under `rfqs:handle` with the quote's
visibility (`GET /api/v1/admin/quote-requests/:id/document-templates`).

**Rationale**: the permission to pick belongs to the quote, not to template management; the facility
answers from its own table through its own port, so no module reads another's table.

**Alternatives rejected**: requiring `document_templates:read` for representatives (couples permission
domains; gives them the template screens); a second port (one more edge to declare for the same
owner and the same gate); reading `document_templates` from `quote_requests` (Principle I).

## R-15 — The export route and the language

**Decision**: `GET /api/v1/admin/quote-requests/:id/pdf?templateId=<uuid>&language=<code>` under
`requireAdmin('rfqs:handle')` and quote visibility. `templateId` absent → the remembered template (if
any) → default resolution. If `templateId` differs from the remembered one, the route runs the
remember Command first (FR-005) and then renders. `language` absent → the channel's default language
(the system default channel for a quote without a channel). Response `application/pdf`,
`Content-Disposition: attachment; filename="<businessId>.pdf"` (sanitised to `[A-Za-z0-9._-]`),
`Cache-Control: no-store`, and `X-Document-Template-Id`, `X-Document-Template-Source`,
`X-Document-Template-Missing` so the dialog can say a fallback happened.

**Rationale**: GET keeps the download a plain link-like call, as the comparison export; the remember
step on an explicit choice is the one place the choice and the download agree by construction. The
dialog sends `templateId` only when the selection differs from what an export without a choice would
use (`admin-ui.md` §1), so a representative who just accepts the preselected default does not pin the
quote to it — a later change of the default still reaches that quote.

**Alternatives rejected**: a separate "remember" click (two actions for one intent); POST for the
export (no body worth posting).

## R-16 — Activation edges and off-states

**Decision**: `quote_requests` declares two `nonBindingDependencies` on `document_templates`:
`documentTypeRegistry` (`contributes-to`) and `documentRenderPort` (**`refuses-without`**, whenAbsent:
"quote requests cannot be exported to PDF and no PDF template can be chosen"). The three quote PDF
routes resolve the gated port and therefore answer 503 `MODULE_DISABLED` while the facility is off; the
admin hides *Export PDF* through `useModulePresence().isPresent('document_templates')`.

**Rationale**: binding (`dependencies`) would make the facility's activation control dead while quote
requests are on, for a capability that is optional for a quote; there is no honest fixed-layout
fallback to degrade to (the comparison had one; a quote PDF never existed). `refuses-without` is the
manifest spelling of "this operation stops" (`specs/conventions/module-composition.md` item 4a).

**Alternatives rejected**: `dependencies` (above); a hard-coded quote layout as a degrade path (a
second renderer to maintain for an off-state nobody needs).

## R-17 — Permissions, palette, navigation

- No new permission: export and remember require `rfqs:handle` plus organisation visibility; template
  management keeps `document_templates:read/write`.
- ⌘K: the facility's `open-document-templates` action gains quote keywords (`quote pdf`, `offer
  template`, `szablon oferty`, `oferta pdf`, `zapytanie ofertowe`) — the 152 precedent (comparison and
  invoice keywords live there). Exporting is a contextual action on one quote, not a landing surface,
  so it gets no palette action (Principle XVI covers the module's surfaces, which `open-rfq-inbox`
  already reaches).
- The dialog's *Manage PDF templates* link (`/document-templates?type=quote_requests.quote_request`)
  is shown with `document_templates:read` and facility presence (152 FR-063 precedent,
  `comparisons/src/admin/pages/ComparisonsListPage.tsx`).

## R-18 — Auditing

Template design: the facility's six Commands, unchanged. Remembering a template: one `quote_requests`
Command (R-13). Sending the PDF by e-mail: one `quote_requests` Command (R-27). Producing a PDF for
download: a read, not audited (owner answer Q6). The audit row of the remember Command records
the template id; the export response headers carry the template id and version actually used.

## R-19 — Tenancy and channel scoping

- `quote_requests` is `@OrgScoped`; the new column inherits it. The data builder runs in the admin's
  request context through the visibility rule (R-12).
- Templates stay `@GlobalEntity` shop configuration (152). `listChoices` and `render` accept only
  global or same-channel templates; a quote with `salesChannelId = null` sees global templates only and
  resolves defaults with a `null` channel (152 R-15: a null channel matches no channel row).

## R-20 — Languages

Backend-printed texts (built-in layout, catalogue labels, block defaults) live in per-language maps in
`QR/src/backend/document/texts.ts` (`en-US`, `pl-PL`; other languages fall back to English — the
comparison's `BUILT_IN_TEXTS` precedent). Admin texts in the module bundles (`QR/i18n`, `DT/i18n`).
Attribute and custom-field labels come from their per-locale data with the facility's language chain.

## R-21 — Limits and performance

ItemsTable: 1–16 columns, ≤ 8 detail entries, ≤ 10 totals, strings ≤ 200 (labels) / 50 (empty texts),
validated at save (FR-043) on top of 152's content limits. Render is O(lines × columns); one read per
port; no cache. Budget: 200 lines p95 < 5 s (SC-003), measured by a bench beside 152's.

## R-22 — Invoices and the comparison are not migrated now

- **Invoices**: `invoices.InvoiceLineItems` is a legal-document section with its own builder and
  behavioural tests (152 FR-083); adopting means declaring a `lines` collection over `InvoiceDetail`,
  replacing the block in the built-in layout, and re-proving FR-083 — not trivial, so not now.
- **Comparison**: its table is a transposed attribute matrix (products as columns); a line collection
  does not describe it. No adoption planned.

## R-23 — Future extension: the repeater block (parked, D3)

What a later **Repeater** (`document_templates.Repeater`: a Puck slot rendered once per item of a
collection) needs, and what this feature already provides or reserves:

| Need | Provided now | Left for the repeater |
| --- | --- | --- |
| Which items to repeat | `collections[]` with `items(data)` (R-4) | — |
| What an item exposes | the field catalogue with paths (R-4) | — |
| Item placeholders in texts | grammar reserved: `{{item.<path>}}`; prints literally today (the interpolator's regex does not match a dot) and a test pins it (FR-045) | an interpolator scope chain `[itemScope, documentScope]`; the merge-field panel listing the catalogue under `item.` |
| Conditional child blocks | `DocumentCondition` with an item scope (`has_value`) and `evaluateDocumentCondition(…, { item })` (R-6) | a `visibleWhen` prop on any block inside a repeater; more ops |
| Formatting a value in text | `formatDocumentValue` (R-5) | a default format per field when interpolated |
| Nested layout | — | `documentTemplateTreeSchema` accepting one slot level; recursive node walk in validation, palette check, limits and the renderer |

Constraints v1 must respect so the table above stays true: field paths never contain more than one dot
and never start with `item` or `row` (registration refuses); stored rules use the union, never a bare
string; the table renderer reads values only through `items()` and the shared functions, so a repeater
reading the same items sees the same values.

## R-24 — Replacing the 152 test-only quote type

**Decision**: delete `backend/test/fixtures/document-types/fixture-document-type.ts`; re-target
`backend/test/contract/document_templates/second-type.test.ts` and the off-state cases of
`admin-api.test.ts` to the real `quote_requests.quote_request`. The *facility-is-untouched* proof
(152 SC-007) moves to a test-only collection-declaring type registered under a **test-only** id in a
unit test of the registry and renderer (SC-007 of this feature), which needs no module presence.

**Rationale**: two types under one module's id would make both tests ambiguous about which type an
off-state hides; the real type now exercises the per-document path end to end. Per the `AGENTS.md`
trap, every importer of the deleted file is grepped in `backend/test/**` in the same change.

## R-25 — No new dependency, no cache, no event

`pdfmake`, `Intl`, Zod, React/Puck, `admin-kit`'s `useReorderList` + `TouchReorderButtons` (keyboard
and touch reordering of columns) are all in place. No Redis cache (a render reads two indexed rows,
152 R-14). No domain event (nothing reacts to an export).

## R-26 — Audience of fields and the storefront question (Q1)

v1 (admin-only export, owner answer Q1) uses `audience` for the editor warning (Q7). If a later feature
lets customers export too, the storefront route passes `audience: 'customer'` to the port, and the facility blanks
every `internal` field in columns, detail entries, totals and grouping before formatting — one rule in
one place, not per host. The design is ready for it; the render input member is added only with that
answer (Principle IV).

## R-27 — *Send PDF to customer* (owner answer Q4)

**Facts.** `quote_requests` sends **no** e-mail today: every transition writes
`quote_request_notification_events` rows with status `queued` (`RfqNotificationService`), and nothing
delivers them (`QR/docs/quote_requests.md` § *Notifications*). The platform's e-mail machinery is
`transactional_emails`: a module declares an e-mail in its manifest (`transactionalEmails`), pushes its
default subject and body per language into `emailDefaultsPort` from a contribution-only boot hook, and
sends through `transactionalEmailSenderAccessor()` → `TransactionalEmailSender.send`, which already
takes `attachments` and `document` (`CT/transactional-emails.ts`; invoices and `crm`'s event reminder
are the precedents — `crm/src/backend/email-templates/event-reminder-defaults.ts`). The sender answers
`sent | logged | deactivated | no_transport | no_definition`; a transport failure **throws**
(`email/src/backend/services/recording-mailer.ts`), after the delivery record is written.
`transactional_emails` and `email` are `nonDeactivatable`; the operator's "off" for one e-mail is the
per-e-mail `active` switch (issue #89). The quote's admin History is built from `quote_request_events`
(`services/history/history-projection.ts`), read only by the admin service — customers never see it.

**Decision.**

1. **A new transactional e-mail `quote_request_pdf`** declared in `QR/src/manifest.ts`
   (`transactionalEmails`, group `quote_requests`), defaults in `en-US` and `pl-PL` built with
   `simpleEmailBodyTree` (`QR/src/backend/email-templates/quote-pdf-defaults.ts`), pushed from the
   module's contribution-only boot hook. Variables: `quote.number`, `quote.validUntil`,
   `customer.name`, `salesRep.name`, `salesRep.email`, `channel.name`, `message`. The operator edits
   it, per language and channel, or switches it off, on the *E-mail templates* screen like every other.
   `transactional_emails` joins `quote_requests`' `dependencies` (non-deactivatable, no cycle — the
   `crm` precedent).
2. **Route Q4** `POST /api/v1/admin/quote-requests/:id/pdf/send` under `rfqs:handle` and visibility,
   body `{ templateId?: uuid, language?: lang, recipients: email[1..5], message?: string ≤ 2000 }`,
   per-admin rate limit 10/minute (`config.rateLimit`, the `routes.customer.ts` precedent). It runs
   the remember Command when `templateId` differs from the remembered one (as Q3), renders through
   `documentRenderPort` exactly as Q3, refuses a PDF over **10 MiB** (422
   `QUOTE_REQUEST_PDF_TOO_LARGE`, `details.maxBytes`), then runs the Command below.
3. **Command `quote_request.send_document`** (`QR/src/backend/commands/document-template-commands.ts`):
   authority (visibility) first; sends one e-mail per recipient through the sender with the PDF
   attached (`<businessId>.pdf`, `application/pdf`), `document: { type: 'quote_request', id }`,
   `messageId` `quote-request-pdf:<sendId>:<n>`, the quote's channel and the PDF's language. Outcomes:
   - the first answer `deactivated` / `no_transport` / `no_definition` → 409
     `QUOTE_REQUEST_PDF_EMAIL_UNAVAILABLE` (`details.code` = the outcome, the envelope's refusal token),
     nothing recorded — the answer is the same for every recipient, so it stops at the first;
   - a thrown transport error for one recipient is collected; the others are still tried;
   - none delivered → 502 `QUOTE_REQUEST_PDF_SEND_FAILED`, nothing recorded;
   - some delivered → one `quote_request_events` row `pdf-sent` with payload
     `{ recipients, templateId, templateName, language, message }` (delivered addresses only) and the
     audit `after: { templateId, language, recipients, failedRecipients }` — never the PDF bytes.
   The Command does not touch `version`, revisions or offer content (FR-096).
4. **History**: event type `pdf-sent` (one migration widening `qre_event_type_check`), projected as the
   admin History kind `pdf_sent` with `delivery: { recipients, templateName, language, message }`
   (`quoteRequestHistoryEntrySchema` gains `delivery`, nullable). Admin-only by construction.
5. **Choices**: route Q1's `QuoteRequestDocumentChoices` gains `requesterEmail: string | null` (the
   requesting customer account's e-mail, read through `customerAccountReadPort` already in use), the
   dialog's preselected recipient.
6. **Admin**: one dialog component in two modes — *Export PDF* (download) and *Send PDF to customer*
   (send: recipients editor with format validation and the limit, message textarea, *Send*). Both
   buttons appear only while `document_templates` and `transactional_emails` are present.

**Rationale.** The e-mail must be editable "like other transactional e-mails" (owner); declaring it is
the one mechanism that gives the operator the editor, per-channel content, languages and the switch.
Sending inside the request (≤ 5 messages) gives the representative an immediate, honest answer — the
queue-backed `quote_request_notification_events` path delivers nothing today and would hide failures.
Separate e-mails per recipient keep one delivery record per address (the sender's `to` is single) and
avoid disclosing one recipient's address to another. Stopping at the first *configuration* outcome but
continuing past a *transport* failure distinguishes "nothing can be sent" from "this address
bounced". Allowing arbitrary addresses (bounded at 5) matches how B2B offers travel — to a purchasing
colleague — while the audit and history keep every address visible.

**Alternatives rejected**: queueing the e-mail through BullMQ (no immediate failure report, and the
attachment would need storage between request and worker); one e-mail with every recipient in `To`
(discloses addresses; the sender takes one `to`); only the requester's address (the owner asked for
editing and adding recipients); attaching the PDF to the automatic revision e-mails (not asked; those
e-mails do not exist yet); recording the event on `quote_request_notification_events` (that table is
an undelivered queue keyed by recipient account ids, not addresses).
