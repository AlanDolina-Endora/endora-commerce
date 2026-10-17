# Feature Specification: Document templates — an editable PDF template for the storefront product comparison, with invoice templates moved onto the same facility

**Feature Branch**: `feat/152-compare-pdf-template` (spec directory `specs/152-compare-pdf-template/`)
**Created**: 2026-10-17
**Status**: Clarified — the owner answered Q1–Q7 on 2026-10-17 (see *Clarifications*). Q1 was
answered with an extension: invoice templates move onto the facility in this feature. The five
questions that extension raised (N1–N5) were answered the same day: N1 departs from the proposed
default (the invoice e-mail attachment follows the template now), N2–N5 take the defaults.
**Input**: Product-owner request, verbatim: *"Powinna być możliwość zdefiniowania szablonu PDF dla
Porównywarki na Storefront UI. Czyli jak jestem na porównywarce (np.
https://demo.commerce.endora.software/compare) i kliknę w przycisk `PDF`, to szablon eksportowanego
PDF-a powinien być edytowalny w Admin UI, najlepiej przez Page Builder."* — translated: *"It should
be possible to define the PDF template of the storefront product comparison. When I am on the
comparison page and click the `PDF` button, the template of the exported PDF should be editable in
the Admin UI, ideally through the Page Builder."*

## Background

A buyer on the storefront comparison page can download the comparison as a PDF. Today that PDF has
one fixed layout nobody outside engineering can change: an English title, an English caption naming
the display mode, and a table with one column per product (image, name, price) and one row per
compared attribute. It uses English product names even for a buyer browsing in Polish, and carries
no logo, contact details, date, or link back to the comparison.

The Admin UI already lets an operator design one kind of PDF visually: **invoice templates**
(*Invoices → Templates*), built with the same Page Builder as CMS pages and e-mails. This feature
turns that capability into a **document-template facility** shared by every kind of generated
document: the product comparison is its first new user, **invoice templates move onto it** with
their behaviour unchanged, and a quote-request PDF (a later feature) will be the next.

## Vocabulary

- **Comparison PDF** — the file a buyer downloads with the `PDF` button on the storefront comparison
  page. Only the comparison's owner can download it (unchanged).
- **Document type** — one kind of document produced from a template. This feature delivers two:
  *Product comparison* and *Invoice*. Further types are added by the part of the platform owning
  their data.
- **Document template** — an operator-designed layout for one document type, edited in the Page
  Builder, holding one layout per **language**.
- **Blocks of a document type** — the Page Builder components an operator may place on a template of
  that type. **Each document type has its own set**: blocks that print its own data (for example the
  comparison table, or an invoice's VAT summary), plus — only if the type opts in — the
  general-purpose blocks (heading, text, image, spacer, divider, page break).
- **Built-in layout** — the layout the platform ships for a document type: used when no template
  applies, and the starting point of every new template.
- **Merge field** — a placeholder such as `{{customerName}}` typed into a text, replaced with the real
  value when the PDF is produced.
- **Scope** — where a template applies: **all sales channels** (global), or **one sales channel**.
- **Default template** — the template of a document type used for a scope when nothing else is
  chosen. A scope may hold several templates; exactly one or none of them is its default.
- **Per-document selection** — for document types that allow it, a person picks a specific template
  for one individual document (the default preselected). Neither type delivered here allows it: the
  comparison and the invoice always use the default. Quote requests will.
- **Sample document** — fixed, made-up data the editor and the preview use, so an operator can design
  without real customer data.

## Clarifications

### Session 2026-10-17 (owner)

- **Q1** — Reusable facility or comparison-only? → **A reusable `document_templates` facility**, with
  the explicit requirement that **each document type has its own set of Page Builder blocks**; the
  editor of a template offers only its type's blocks plus the general-purpose blocks the type opts
  into. **Extended by the owner: invoice templates move onto the facility in this feature** — invoices
  become a document type, existing invoice templates are migrated without loss, their default and
  per-channel behaviour is preserved, the old *Invoices → Templates* address redirects, and the
  invoice PDF output is unchanged (FR-080–FR-092).
- **Q2** — One layout or several? → **Several templates per document type and scope, one marked
  default.** A document type declares whether per-document selection is allowed; producing a document
  may name a template explicitly. The comparison uses the default only (the buyer just clicks `PDF`);
  invoices keep today's semantics (default only); quote requests (later) will allow a per-quote choice
  with the default preselected (FR-005, FR-037–FR-039).
- **Q3** — Scope? → **All channels with an optional per-channel override** (as recommended).
- **Q4** — Blocks and merge fields? → **The recommended set** (FR-012, FR-013, FR-023); the attribute
  rows follow the buyer's display mode.
- **Q5** — No template? → **The built-in layout in the buyer's language**; today's fixed English layout
  only while the facility is switched off (as recommended).
- **Q6** — Draft/publish? → **Edit live**; *duplicate → edit → set as default* is the safe path; no
  version history (as recommended).
- **Q7** — Language? → **The buyer's storefront language, then the channel's default** (as
  recommended).

### Session 2026-10-17 (owner, second round — N1–N5)

- **N1** — Should the invoice e-mail attachment use the invoice template? → **Yes, fix it now**
  (departs from the proposed default). The PDF attached to the invoice e-mail is produced through the
  same template resolution as the invoice download, so the same invoice yields the same layout on both
  paths (FR-093). The release note says that e-mailed invoice PDFs now follow the configured template.
- **N2** — May the template facility be switched off while invoicing is on? → **No** (default):
  invoices bind the facility, and switching it off is refused until invoicing is off (FR-050).
- **N3** — How do administrators keep access to invoice templates? → **A one-time, audited automatic
  grant** through the admin roles module (default): `invoices:read` ⇒ `document_templates:read`,
  `invoices:write` ⇒ `document_templates:write` (FR-089).
- **N4** — The former invoice-template administration API? → **Withdraw it now** (default), as a
  breaking (major) change of the invoices package with a release note (FR-092).
- **N5** — Invoices stay Polish-only? → **Yes** (default) (FR-085).

### Session 2026-10-17 (owner, third round — PDF appearance)

- **P1** — Must invoice and comparison PDFs look exactly as before the move? → **No.** Nobody uses
  invoice or comparison PDF templates in production yet, so backward compatibility of the PDF
  *appearance* is not a concern. The byte- or definition-identical golden parity requirement is
  dropped; FR-083 and SC-008 now require **behaviour**: every invoice PDF still carries all required
  content (seller and buyer data, lines, VAT summary, totals, amount in words, the KSeF-number rule,
  the logo) through the template path, and the e-mail attachment uses the same template as the
  download. The invoice move may re-express invoice sections as invoice-type blocks and a built-in
  layout on the new facility rather than wrapping the legacy renderer behind compatibility hooks — the
  simpler design is preferred. Still required: invoice template data moved into the facility by the
  one-time import with no data loss (FR-081, FR-082), the redirects (FR-088), and the N2–N4 decisions.
  Release notes may simply say the PDF layouts can change.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Design the comparison PDF in the Page Builder and have buyers' downloads follow it (Priority: P1)

An operator opens *Document templates* in the Admin UI (from the sidebar, the ⌘K palette, or a *PDF
template* button on the *Comparisons* screen), picks *Product comparison*, creates a template from
the built-in layout, and edits it: adds the company logo, changes the title, chooses which product
details the comparison table shows (image, SKU, price, availability) and how differing rows are
highlighted, and adds a footer with contact details and page numbers. The palette offers only blocks
that make sense for a comparison. They preview a real PDF filled with a sample comparison, save, and
set the template as default. The next buyer who clicks `PDF` receives a PDF laid out like the
preview, filled with their own comparison.

**Why this priority**: this is the request.

**Independent Test**: with one default template that adds a logo, a custom title and a footer, export
a two-product comparison as its owner and confirm the PDF carries the logo, title, footer and both
products' rows, while an export made before the template became default used the built-in layout.

**Acceptance Scenarios**:

1. **Given** no comparison template exists, **When** a buyer exports, **Then** the PDF uses the
   built-in layout, in the buyer's language.
2. **Given** an operator with permission to edit document templates, **When** they create a comparison
   template, **Then** it starts as a copy of the built-in layout, is not the default, and buyers'
   exports are unchanged.
3. **Given** the comparison template editor, **When** the operator opens the block palette, **Then** it
   lists the comparison blocks and the general-purpose blocks — and no invoice block.
4. **Given** a template being edited, **When** the operator clicks *Preview PDF*, **Then** they get a
   PDF of the unsaved layout filled with the sample comparison, and nothing is saved.
5. **Given** a saved template, **When** the operator sets it as default, **Then** the next comparison
   PDF any buyer exports uses it, with that buyer's products, prices, attributes and display mode.
6. **Given** a default template whose table hides images and shows SKUs, **When** a buyer exports,
   **Then** the table has no images and shows each product's SKU.
7. **Given** a default template, **When** the operator clears its default flag, **Then** exports go back
   to the built-in layout.
8. **Given** a buyer in *differences only* mode who hides empty rows on screen, **When** they export,
   **Then** the PDF shows the same rows as their screen.

---

### User Story 2 — The comparison PDF speaks the buyer's language (Priority: P1)

A template carries one layout per language. The operator edits the Polish and English versions
separately, starting a new language from an existing one. A buyer browsing in Polish gets the Polish
version with Polish product and attribute names, date and money formats; a buyer browsing in English
gets the English one.

**Why this priority**: every user-facing output ships in Polish and English; today's English-only PDF
for a Polish buyer is a defect the new layouts must not carry.

**Independent Test**: with a template whose Polish title is "Porównanie" and English title is
"Comparison", export the same comparison with the storefront in Polish and then in English.

**Acceptance Scenarios**:

1. **Given** a template with Polish and English layouts, **When** a buyer browsing in Polish exports,
   **Then** the PDF uses the Polish layout, Polish names, dates and money formats.
2. **Given** a template with only an English layout, **When** a buyer browsing in Polish exports,
   **Then** the English layout is used, with Polish product names where the catalogue has them.
3. **Given** the operator adds a language to a template, **When** the editor opens it, **Then** it
   starts as a copy of an existing language's layout.
4. **Given** no template exists, **When** a buyer browsing in Polish exports, **Then** the built-in
   layout is printed in Polish.

---

### User Story 3 — A different layout for one sales channel (Priority: P2)

The operator creates a comparison template for one sales channel only — another brand's logo and
footer — while every other channel keeps the template that applies to all channels.

**Why this priority**: multi-brand deployments; a single-channel deployment does not need it.

**Independent Test**: set a global default and a channel-B default; export from channel A and from
channel B; each PDF carries its own layout.

**Acceptance Scenarios**:

1. **Given** a global default and a channel-B default, **When** a buyer on channel B exports, **Then**
   the channel-B template is used.
2. **Given** the same, **When** a buyer on channel A exports, **Then** the global default is used —
   never channel B's.
3. **Given** only a channel-B default, **When** a buyer on channel A exports, **Then** the built-in
   layout is used.

---

### User Story 4 — Manage templates safely (Priority: P2)

The operator keeps several templates per type and scope, sees which is default where, duplicates one
to experiment without touching what customers receive, renames, deletes unused ones, and is protected
from overwriting a colleague's simultaneous edit. Every change is in the audit log.

**Why this priority**: editing the default template changes the next document produced; operators
need the duplicate → edit → set-as-default path. P2 because careful editing of a single template
already delivers US1.

**Independent Test**: duplicate the default template, edit the copy, confirm exports are unchanged,
set the copy as default, confirm exports switch and the original is no longer default; then save a
stale editor and confirm the save is refused.

**Acceptance Scenarios**:

1. **Given** a default template, **When** the operator duplicates it, **Then** the copy is not default
   and documents are unchanged.
2. **Given** two templates in one scope, **When** the operator sets the second as default, **Then** the
   first stops being default in the same step — never two defaults, and never a moment with none if
   there was one.
3. **Given** two operators editing one template, **When** the second saves after the first, **Then**
   the second save is refused with a message, and nothing is overwritten.
4. **Given** any create, rename, save, set-default, clear-default or delete, **When** it succeeds,
   **Then** the audit log records who, when, and which template.
5. **Given** an operator who may view but not edit document templates, **When** they open the editor,
   **Then** they can preview but every saving or default-setting control is unavailable.

---

### User Story 5 — Invoice templates live in Document templates, unchanged (Priority: P2)

After the upgrade, an operator who designed invoice templates finds them under *Document templates →
Invoice*: same names, same layouts, same scopes, and the template that was in force for each scope
is that scope's default. *Invoices → Templates* and old bookmarks lead there. Every invoice PDF —
downloaded by an administrator, downloaded by the customer, regenerated, previewed — looks exactly as
before in content (its layout may change, owner answer P1), and the PDF attached to the invoice e-mail
now uses the same template as the download of the same invoice (owner answer N1; before the move it
ignored templates). The invoice editor offers exactly
the invoice blocks it offered before (including blocks other installed modules contribute, such as a
KSeF section), and nothing from the comparison.

**Why this priority**: the owner requires it in this feature; it adds no new user capability, but a
regression here touches a legal document, so it carries the strictest acceptance criteria of the
feature.

**Independent Test**: on a database holding invoice templates (a global one, a channel override, an
edited generic template, a template placing a contributed block), upgrade; check that every template is
in *Document templates*, that every invoice PDF — a regular invoice, a correction and an invoice of each
channel — carries the required content from its scope's template; open the old *Invoices → Templates*
address.

**Acceptance Scenarios**:

1. **Given** invoice templates before the upgrade, **When** the platform is upgraded, **Then** each
   appears under *Document templates → Invoice* with its name, scope and layout, and the one that was
   in force for each scope is that scope's default.
2. **Given** the upgrade, **When** any invoice PDF is produced, **Then** it carries all the content an
   invoice requires (FR-083); its layout may differ from before (owner answer P1).
3. **Given** an operator opens *Invoices → Templates* or an old link to one invoice template, **Then**
   they land on the same templates in *Document templates*.
4. **Given** the invoice template editor, **When** the operator opens the palette, **Then** it offers
   the invoice blocks (and blocks contributed to invoices by other installed modules) and no comparison
   or general-purpose block.
5. **Given** an operator deleted a migrated template, **When** the platform restarts or is upgraded
   again, **Then** the template does not come back.
6. **Given** administrators who could edit invoice templates before the upgrade, **When** the upgrade
   completes, **Then** they can still edit invoice templates.
7. **Given** an invoice template is the default for an invoice's scope, **When** the invoice e-mail is
   sent with the PDF attached, **Then** the attached PDF has the same content as the PDF downloaded for
   that invoice (FR-093).

---

### User Story 6 — The facility serves the next document type, including per-document choice (Priority: P3)

A later feature adds a quote-request PDF whose sales representative may pick a template for each
quote, with the default preselected. Its owner adds a *Quote request* document type declaring its
blocks, sample data, built-in layout and that per-document selection is allowed — with no change to
the template facility.

**Why this priority**: the reason the capability is a facility; no user value in this release by
itself.

**Independent Test**: in the test suite, a test-only document type that allows per-document selection
appears on the screen, renders with its default, renders with an explicitly chosen template, falls
back to the default when the chosen template was deleted, and disappears (rows untouched) when its
owner is switched off.

**Acceptance Scenarios**:

1. **Given** a document type allowing per-document selection, **When** a document is produced naming
   one of its templates for the document's scope, **Then** that template is used.
2. **Given** a document type that does not allow it (the comparison, the invoice), **When** a document
   is produced naming a template, **Then** the request is refused.
3. **Given** a named template that was deleted since it was chosen, **When** the document is produced,
   **Then** the default for its scope is used, and the result says so.

---

### Edge Cases

- **A template places nothing printable**: the next layout in the order of FR-031 is used rather
  than an empty PDF.
- **A template contains a block whose owner is switched off or uninstalled**: the block is skipped in
  the PDF, the rest prints, and its stored settings are kept.
- **A block of another document type is pasted into a template** (for example through the
  clipboard): saving is refused, naming the block.
- **Many products** (up to the maximum of 16): the comparison table splits products across tables and
  pages, repeating the attribute names; orientation is landscape from three products unless fixed.
- **A product image or a logo cannot be loaded**: printed without it; the document does not fail.
- **A merge field has no value**: prints empty; a misspelled one prints literally.
- **Some products are hidden from this buyer**: the PDF can say how many; it never names them.
- **The template lacks the buyer's language**: the closest language is used (same base language,
  then English, then the first available).
- **A channel with channel-specific templates is deleted**: its templates go with it.
- **The template facility is switched off**: comparison PDFs use today's fixed layout; templates are
  kept and return when it is switched on. While invoicing is on, switching the facility off is refused
  (owner answer N2).
- **Product comparison or invoicing is switched off**: its document type and templates disappear
  from the template screens; nothing is deleted.
- **A save happens while a document is being produced**: the document uses one version of the
  template in full, never a mixture.
- **A former invoice template referenced a sales channel that no longer exists**: it could not apply
  to anything before the upgrade; it is not migrated, and the upgrade reports it.
- **Invoicing is switched off during the upgrade**: its templates are migrated the first time
  invoicing is present again, with the same result.

## Requirements *(mandatory)*

### Functional Requirements

#### Templates and their management

- **FR-001**: The Admin UI MUST provide a *Document templates* screen listing every available
  document type — in this release *Product comparison* and *Invoice* — and, per type, its templates
  with name, scope, languages, whether it is the default of its scope, and last change.
- **FR-002**: For each document type the screen MUST show the **built-in layout** as a non-editable
  entry that can be previewed and used as the starting point of a new template.
- **FR-003**: An operator with edit permission MUST be able to create a template for a document type,
  naming it and choosing its scope, starting from the built-in layout or a copy of an existing
  template of the same type. A new template MUST NOT be the default unless the operator asks for it
  on creation.
- **FR-004**: An operator with edit permission MUST be able to rename, duplicate (into the same or
  another scope), set as default, clear the default flag of, and delete templates. A template's scope
  MUST NOT change after creation.
- **FR-005**: A document type and scope MAY hold several templates; at most one of them MUST be the
  default. Setting a template as default MUST clear the previous default of the same type and scope
  in the same step.
- **FR-006**: Saving MUST be refused, without overwriting, when the template changed since the
  operator loaded it.
- **FR-007**: Deleting a default template MUST require confirmation stating what will apply instead.
- **FR-008**: Layouts beyond the published limits (blocks per language, total size) MUST be refused
  with a message naming the limit.

#### Editing in the Page Builder

- **FR-010**: Templates MUST be edited in the Admin UI Page Builder with the editor experience of
  invoice templates and CMS pages: palette, canvas, per-block settings, outline, undo/redo,
  full-screen, explicit *Save*.
- **FR-011**: **Each document type MUST have its own set of blocks**, and the editor of a template
  MUST offer only the blocks of the template's document type, plus the general-purpose blocks if —
  and only if — the type opts into them. Blocks other installed modules contribute to a specific
  document type (for example a KSeF section on invoices) MUST be offered for that type only.
- **FR-012**: The *Product comparison* type MUST opt into all general-purpose blocks — heading, text
  (with merge fields), image from the assets library, spacer, divider, page break — and offer these
  comparison blocks:
  - **Comparison header** — title, optional export date, optional display-mode caption (wording per
    mode), optional note on whose prices are shown.
  - **Comparison table** — one column per product, one row per compared attribute; switchable image
    (and size), name, SKU, price, availability; editable attribute-column heading and missing-value
    text; highlighting of same/different rows with colours; header and border colours; font size;
    products per table before continuing in the next; hidden-products note wording.
  - **Share link** — the comparison's share-page address as text and optionally as a QR code, shown
    only when the channel's storefront address is configured.
- **FR-013**: A document MUST have page settings — page size (A4, Letter), orientation (automatic,
  portrait, landscape), margins, base font size, optional repeating header and footer text with merge
  fields, optional page numbers — with defaults set by the document type.
- **FR-014**: The editor MUST let the operator choose the language being edited among the languages
  the document type supports (all active content languages for the comparison), and a new language
  MUST start as a copy of an existing one.
- **FR-015**: *Preview PDF* MUST produce the real PDF of the canvas (saved or not) in the edited
  language, filled with the type's sample document, and MUST NOT save anything.
- **FR-016**: The canvas MUST show the type's blocks filled with the same sample the preview uses.
- **FR-017**: The editor MUST list the type's merge fields with a description of each.
- **FR-018**: A block the editor cannot draw (owner off or unknown) MUST stay in the template as a
  neutral placeholder naming it, with its settings kept.
- **FR-019**: Saving a template containing a block that a present module declares but that the
  template's document type does not offer MUST be refused, naming the block.

#### What the comparison PDF contains

- **FR-020**: The comparison PDF MUST contain the buyer's comparison exactly as their comparison page
  shows it: same products in the same order, same prices (theirs or the channel's), availability and
  values, and the same rows for the display mode and the *hide empty rows* switch.
- **FR-021**: Products the buyer may not see MUST NOT appear in any form; the table MAY say how many
  are hidden.
- **FR-022**: Product names, attribute names, dates and amounts MUST be printed in the PDF's language.
- **FR-023**: The comparison type MUST offer merge fields for: export date, number of products, sales
  channel name, signed-in buyer's name, their organisation's name, share-page address, and — in the
  page header and footer — page number and page count. A merge field without a value prints empty.

#### Producing documents

- **FR-030**: Clicking `PDF` on the comparison page MUST produce the PDF from the template that
  applies to the buyer's sales channel and language at the moment of export.
- **FR-031**: Unless a template is explicitly chosen (FR-037), the layout applied MUST be, in order:
  the default template of the document's sales channel; else the default template for all channels;
  else the built-in layout. A layout placing nothing printable counts as absent.
- **FR-032**: The comparison PDF's language MUST be, in order: the buyer's storefront language, a
  language with the same base language, English, the first the template has; the buyer's storefront
  language is the one the storefront is displayed in, falling back to the channel's default language.
- **FR-033**: A template MUST change only the layout. A document's data MUST come only from the part
  of the platform producing it (the buyer's comparison; the invoice); a template MUST NOT make a
  document include another customer's or another channel's data, or any file or address not chosen
  from the assets library (the invoice logo keeps its existing image options, FR-086).
- **FR-034**: A document MUST be produced entirely from one version of a template.
- **FR-035**: When producing the comparison PDF fails, the buyer MUST see the existing "PDF could not
  be generated" message in their language, and the failure MUST be logged with the template and
  block responsible. One failed image MUST NOT fail the document.
- **FR-036**: The comparison export's file name, owner-only access and the refusal of an empty
  comparison MUST stay as today.
- **FR-037**: A document type MUST declare whether per-document selection is allowed. When it is, the
  part of the platform producing a document MAY name one template of that type whose scope is all
  channels or the document's channel, and that template MUST be used.
- **FR-038**: Naming a template for a document type that does not allow selection, or a template of
  another type or another channel, MUST be refused.
- **FR-039**: A named template that no longer exists MUST be replaced by the layout FR-031 selects,
  and the outcome MUST say the replacement happened.

#### Invoices moved onto the facility

- **FR-080**: *Invoice* MUST be a document type of the facility, offering exactly the ten invoice
  blocks of today (header, parties, line items, VAT summary, totals, notes, spacer, divider, logo,
  footer) plus the blocks other installed modules contribute to invoices — and **not** the
  general-purpose blocks.
- **FR-081**: Every invoice template existing before the upgrade, including the generic template the
  platform seeded (with any operator edits), MUST be migrated with its identity, name, scope, layout
  and version. A template that was active for its scope MUST become that scope's default. No invoice
  template data MUST be deleted by the upgrade.
- **FR-082**: The migration MUST happen once per installation: re-running, restarting, or switching
  invoicing off and on MUST NOT duplicate templates or resurrect templates deleted after migration.
- **FR-083**: Every invoice PDF produced after the upgrade — administrator download, customer
  download, regeneration, preview and the e-mail attachment — MUST be produced through the invoice
  document type and MUST carry all the content an invoice requires: seller and buyer data, the line
  items, the VAT summary, the totals with the amount in words, the KSeF number (printed exactly once,
  FR-087) and the logo when one is placed. Its layout MAY differ from the layout before the upgrade
  (owner answer P1). The e-mail attachment is also governed by FR-093.
- **FR-084**: Invoice templates MUST keep today's selection semantics: the default for the invoice's
  channel, else the default for all channels, else the built-in layout; invoices do not allow
  per-document selection.
- **FR-085**: Invoice PDFs MUST keep today's language (the Polish layout and Polish amount in words for
  documents; the preview's amount in words in English), and the invoice editor MUST offer only the
  languages invoice templates are printed in.
- **FR-086**: The invoice logo block MUST keep its image options (assets library or address).
- **FR-087**: Blocks other modules contribute to invoices (KSeF) MUST keep rendering, being described
  in the editor, and printing the KSeF number exactly once, as today — with no change required of the
  contributing module.
- **FR-088**: *Invoices → Templates* and the address of each former invoice template MUST lead to the
  corresponding place in *Document templates*; the invoices screen's *Templates* tab MUST keep leading
  to the invoice templates.
- **FR-089**: Administrators who could view or edit invoice templates before the upgrade MUST be able
  to do so after it without an administrator granting anything by hand: once per installation, every
  role holding `invoices:read` gains `document_templates:read` and every role holding `invoices:write`
  gains `document_templates:write` (and `:read`), recorded in the audit log (owner answer N3).
- **FR-090**: The ⌘K palette MUST keep finding invoice templates (by "invoice template", "szablon
  faktury").
- **FR-091**: Invoice behaviour outside templates — numbering, issuing, corrections, e-mails, KSeF —
  MUST NOT change.
- **FR-092**: The former invoice-template administration API is withdrawn as part of the move, with no
  deprecation period; the change MUST be released as a breaking (major) change of the invoices package
  and announced in the release notes (owner answer N4).
- **FR-093**: The PDF attached to the invoice e-mail MUST be produced through the same template
  resolution as the invoice download (FR-084: the default for the invoice's channel, else for all
  channels, else the built-in layout), so that the same invoice is e-mailed and downloaded from the
  same template. The release notes MUST say that e-mailed invoice PDFs now
  follow the configured template (owner answer N1).

#### Availability (switching modules on and off)

- **FR-050**: The document-template facility MUST be switchable on the platform modules screen, on by
  default. While it is off: its screens, sidebar entry, palette entry and links to it MUST be absent,
  its API MUST refuse as for any switched-off module, the comparison PDF MUST keep working with
  today's fixed layout, and every template MUST come back unchanged when it is switched on. While
  invoicing is on, switching the facility off MUST be refused, naming invoicing (owner answer N2).
- **FR-051**: While the module owning a document type (comparison, invoicing) is switched off, its
  type, blocks and templates MUST NOT appear in the template screens or API, and they MUST be kept
  unchanged.
- **FR-052**: A placed block of a switched-off owner MUST be skipped when producing a document and
  kept in storage.

#### Permissions, auditing, discoverability, languages

- **FR-060**: Viewing document templates (list, editor, preview) and editing them MUST be two
  separately grantable permissions, labelled in Polish and English on the admin roles screen.
- **FR-061**: Every template change MUST be recorded in the audit log with the acting administrator,
  the template and the change; a failed change MUST leave no entry. The invoice migration MUST be
  recorded.
- **FR-062**: *Document templates* MUST be reachable from the ⌘K palette (also by "PDF",
  "comparison", "invoice template" and their Polish equivalents) and from the sidebar.
- **FR-063**: The *Comparisons* admin screen MUST offer a *PDF template* button leading to the
  comparison templates, only for administrators allowed to view document templates and only while
  the facility is on.
- **FR-064**: Every new text in the Admin UI and the storefront, every block and merge-field label,
  every error message and the comparison built-in layout's printed texts MUST exist in Polish and
  English.
- **FR-065**: The end-user documentation MUST describe designing comparison and invoice templates in
  *Document templates*, in Polish and English, and the invoice documentation MUST point there.

#### Reuse

- **FR-070**: Adding a further document type MUST require no change to the facility: its owner
  supplies the type's name, blocks, whether it opts into general-purpose blocks, merge fields, sample
  data, built-in layout, supported languages, page defaults, and whether per-document selection is
  allowed.

### Key Entities

- **Document type** — a kind of document produced from a template; supplied by the module owning the
  document's data with its blocks, general-purpose-block opt-in, merge fields, sample, built-in
  layout, supported languages, page defaults and selection rule. Not stored by operators.
- **Document template** — an operator layout for one document type: name, scope, whether it is the
  default of its scope, a version for concurrent-edit detection, and one layout per language.
- **Layout (per language)** — ordered blocks with their settings plus page settings, for one language.
- **Block** — one placed element with a stable name saying which module owns it; settings kept as
  entered.
- **Template import record** — that a document type's templates from a former location (invoice
  templates) have been imported, when, and how many; what makes the move happen once.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator new to the feature creates a comparison template with a logo, a new title
  and a footer, previews it and sets it as default in under 10 minutes, without help.
- **SC-002**: After a template becomes default, 100 % of comparison PDFs exported in its scope use it
  — verified per channel and language combination.
- **SC-003**: A 16-product comparison with images exports in under 5 seconds at the 95th percentile,
  no more than 0.5 s slower than today; a built-in-layout preview appears in under 3 seconds; invoice
  PDF production time stays within 10 % of today's.
- **SC-004**: A buyer browsing in Polish receives a comparison PDF with no English platform text when
  the template has a Polish layout or no template exists.
- **SC-005**: Zero documents contain data the requesting customer cannot see on screen — verified by
  the cross-organisation and cross-channel tests.
- **SC-006**: Switching the facility, comparison or invoicing off and on loses no template and changes
  no stored layout.
- **SC-007**: Adding the test-only document type touches no file of the facility.
- **SC-008**: For a reference set of invoice templates and invoices (global, per-channel, edited
  generic, contributed KSeF block, correction, nothing-printable fallback), 100 % of invoice PDFs
  downloaded, regenerated, previewed or e-mailed after the upgrade carry the required content of
  FR-083, and 100 % of e-mail attachments are produced from the same template as the download of the
  same invoice.
- **SC-009**: Zero invoice templates lost or duplicated by the upgrade, counted per installation.

## Open questions

None. N1–N5, raised by the owner's Q1 extension, were answered on 2026-10-17 — see *Clarifications*,
second session. N1 departs from the proposed default; N2–N5 take it.

## Assumptions

- The comparison PDF stays available only to the comparison's owner; share-link recipients get no
  `PDF` button.
- Templates are shop configuration shared by all organisations.
- The share-link block uses the existing per-channel *storefront URL* setting; unset → nothing
  printed.
- New images placed by operators in general-purpose blocks come from the assets library only.
- Fonts are the platform's existing PDF fonts.
- Creating a template no longer makes it the default automatically (invoice templates used to); the
  operator ticks *Set as default* — the owner's Q6 answer makes that the safe path.
- The former invoice-templates storage is kept, read-only, after the move; removing it is a later
  clean-up once every installation has migrated.

## Out of scope

- The quote-request PDF and its per-quote template choice — only the facility's readiness (US6).
- PDF export for share-link recipients; e-mailing the comparison.
- Custom fonts, multi-column containers and nested layouts.
- Version history, scheduled default changes, per-organisation or per-customer-group templates.
- Invoice PDFs in languages other than Polish (owner answer N5).
- Translating other hard-coded texts of the storefront comparison page beyond the `PDF` button
  (`research.md` R-21).
