# Feature Specification: Editable PDF template for the storefront product comparison

**Feature Branch**: `feat/152-compare-pdf-template` (spec directory `specs/152-compare-pdf-template/`)
**Created**: 2026-10-17
**Status**: Draft — seven open questions for the product owner (see *Open questions*). The plan
proceeds on the recommended default of each; three of them are marked `[NEEDS CLARIFICATION]`
where they bind a requirement.
**Input**: Product-owner request, verbatim: *"Powinna być możliwość zdefiniowania szablonu PDF dla
Porównywarki na Storefront UI. Czyli jak jestem na porównywarce (np.
https://demo.commerce.endora.software/compare) i kliknę w przycisk `PDF`, to szablon eksportowanego
PDF-a powinien być edytowalny w Admin UI, najlepiej przez Page Builder."* — translated: *"It should
be possible to define the PDF template of the storefront product comparison. When I am on the
comparison page and click the `PDF` button, the template of the exported PDF should be editable in
the Admin UI, ideally through the Page Builder."*

## Background

A buyer on the storefront comparison page can download the comparison as a PDF. Today that PDF has
one fixed layout that nobody outside engineering can change: an English title ("Product
comparison"), an English caption naming the display mode, and a table with one column per product
(image, name, price) and one row per compared attribute. It always uses English product names, even
for a buyer browsing in Polish, and it carries no logo, no contact details, no date, and no link
back to the comparison.

The Admin UI already lets an operator design one kind of PDF visually: **invoice templates**
(*Invoices → Templates*), built with the same Page Builder the CMS and e-mail editors use. This
feature gives the comparison PDF the same capability — and, because the request is the first of
several (a quote-request PDF is expected next), it introduces the template capability as a
**reusable document-template facility** that the comparison is the first user of, rather than a
second copy of the invoice editor.

## Vocabulary

- **Comparison PDF** — the file a buyer downloads with the `PDF` button on the storefront comparison
  page. Only the owner of a comparison can download it (unchanged).
- **Document type** — one kind of document the platform can produce from a template. This feature
  delivers exactly one: *Product comparison*. The facility is built so that further document types
  (for example a quote request) can be added later by the part of the platform that owns them.
- **Document template** — an operator-designed layout for one document type, edited in the Page
  Builder. It holds one layout per **language**.
- **Built-in layout** — the layout the platform ships for a document type. It is used when no
  template of that type is active, and it is the starting point of every new template.
- **Block** — one element placed on a template: general-purpose blocks (heading, text, image,
  spacer, divider, page break) and **comparison blocks** that print the comparison itself (header,
  comparison table, share link).
- **Merge field** — a placeholder such as `{{customerName}}` an operator types into a text block,
  replaced with the real value when the PDF is produced.
- **Scope** — where a template applies: **all sales channels** (global), or **one sales channel**
  (an override for that channel only).
- **Active template** — the one template of a document type that is used for a given scope. At most
  one per document type and scope.
- **Sample comparison** — a fixed, made-up comparison the editor and the preview use, so an operator
  can design without a real buyer's data.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Design the comparison PDF in the Page Builder and have buyers' downloads follow it (Priority: P1)

An operator opens *Document templates* in the Admin UI (from the sidebar, the ⌘K palette, or a
*PDF template* button on the *Comparisons* screen), picks *Product comparison*, creates a template
from the built-in layout, and edits it in the Page Builder: adds the company logo, changes the
title, chooses which product details the comparison table shows (image, SKU, price, availability)
and how differing rows are highlighted, and adds a footer with contact details and page numbers.
They preview the result as a real PDF filled with a sample comparison, save it and make it active.
The next buyer who clicks `PDF` on the storefront comparison page receives a PDF laid out exactly
like the preview, filled with their own comparison.

**Why this priority**: this is the request. Without it nothing the product owner asked for exists.

**Independent Test**: with one active template that adds a logo, a custom title and a footer, export
a two-product comparison from the storefront as its owner, and confirm the PDF carries the logo, the
title, the footer and both products' rows, while a comparison exported before activation used the
built-in layout.

**Acceptance Scenarios**:

1. **Given** no comparison template exists, **When** a buyer exports their comparison, **Then** the
   PDF uses the built-in layout, in the buyer's language.
2. **Given** an operator with permission to edit document templates, **When** they create a
   comparison template, **Then** it starts as a copy of the built-in layout, is not active, and
   buyers' exports are unchanged.
3. **Given** a template being edited, **When** the operator clicks *Preview PDF*, **Then** they get a
   PDF of the unsaved layout filled with the sample comparison, and nothing is saved.
4. **Given** a saved template, **When** the operator activates it, **Then** the next comparison PDF
   any buyer exports uses it, with that buyer's products, prices, attributes and display mode.
5. **Given** an active template whose comparison table hides product images and shows SKUs, **When**
   a buyer exports, **Then** the PDF's table has no images and does show each product's SKU.
6. **Given** an active template, **When** the operator deactivates it, **Then** exports go back to
   the built-in layout.
7. **Given** a buyer whose comparison is in *differences only* mode (and who hides empty rows on
   screen), **When** they export, **Then** the PDF shows the same rows as their screen.

---

### User Story 2 — The PDF speaks the buyer's language (Priority: P1)

A template carries one layout per language. The operator edits the Polish and English versions
separately (texts, labels, even block order), starting each new language from an existing one. A
buyer browsing the storefront in Polish gets the Polish version, with Polish product and attribute
names, Polish date format and Polish money format; a buyer browsing in English gets the English
one.

**Why this priority**: every user-facing output of the platform ships in Polish and English; a PDF
that is English-only for a Polish buyer — today's behaviour — is a defect this feature must not carry
into the new layouts.

**Independent Test**: with a template whose Polish title is "Porównanie" and English title is
"Comparison", export the same comparison with the storefront set to Polish and then to English, and
compare titles, product names, date and price formats.

**Acceptance Scenarios**:

1. **Given** a template with Polish and English layouts, **When** a buyer browsing in Polish exports,
   **Then** the PDF uses the Polish layout and Polish product names, dates and money formats.
2. **Given** a template with only an English layout, **When** a buyer browsing in Polish exports,
   **Then** the PDF uses the English layout, with Polish product names where the catalogue has them.
3. **Given** the operator adds a language to a template, **When** the editor opens it, **Then** the
   new language starts as a copy of an existing language's layout rather than empty.
4. **Given** no template exists, **When** a buyer browsing in Polish exports, **Then** the built-in
   layout is printed in Polish.

---

### User Story 3 — A different layout for one sales channel (Priority: P2)

A deployment serves several sales channels (for example two brands). The operator creates a
template that applies only to one channel — with that brand's logo and footer — while every other
channel keeps the template that applies to all channels.

**Why this priority**: multi-channel deployments brand each storefront separately; without this a
second brand prints the first brand's logo. It is P2 because a single-channel deployment does not
need it.

**Independent Test**: activate a global template and a channel-B template; export from channel A and
from channel B; each PDF carries its own layout.

**Acceptance Scenarios**:

1. **Given** an active global template and an active template for channel B, **When** a buyer on
   channel B exports, **Then** the channel-B template is used.
2. **Given** the same templates, **When** a buyer on channel A exports, **Then** the global template
   is used — never channel B's.
3. **Given** only a channel-B template is active, **When** a buyer on channel A exports, **Then** the
   built-in layout is used.

---

### User Story 4 — Manage templates safely (Priority: P2)

The operator keeps several comparison templates (for example a seasonal one), sees which one is
active in which scope, duplicates one to experiment without touching what buyers receive, renames,
deletes unused ones, and is protected from overwriting a colleague's simultaneous edit. Every change
is recorded in the audit log.

**Why this priority**: editing the active template changes what buyers receive on the next export;
operators need a safe way to prepare changes. P2 because a single template with careful editing
already delivers US1.

**Independent Test**: duplicate the active template, edit the copy, confirm exports are unchanged,
activate the copy, confirm exports switch and the original is no longer active; then save a stale
copy of the editor and confirm the save is refused.

**Acceptance Scenarios**:

1. **Given** an active template, **When** the operator duplicates it, **Then** the copy is inactive
   and exports are unchanged.
2. **Given** two templates in the same scope, **When** the operator activates the second, **Then** the
   first stops being active in the same step — there is never more than one active template per
   document type and scope, and never a moment with none if one was active before.
3. **Given** two operators editing the same template, **When** the second saves after the first,
   **Then** the second save is refused with a message saying the template changed, and nothing is
   overwritten.
4. **Given** any create, rename, save, activate, deactivate or delete, **When** it succeeds, **Then**
   the audit log records who did it, when, and to which template.
5. **Given** an operator who may view but not edit document templates, **When** they open the
   editor, **Then** they can preview but every saving or activating control is unavailable.

---

### User Story 5 — The same facility serves the next document type (Priority: P3)

A later feature adds a quote-request PDF. Its owner adds a *Quote request* document type with its own
blocks and sample data, and operators design it on the same *Document templates* screen with the same
general-purpose blocks — without any change to the template facility itself.

**Why this priority**: it is the reason the capability is built as a facility rather than inside the
comparison feature, but it delivers no user value in this release on its own.

**Independent Test**: in the test suite, a fixture document type registered by a test module appears
on the document templates screen, can be edited and previewed, and renders with its own blocks; when
the test module is switched off it disappears, and its stored templates are untouched.

**Acceptance Scenarios**:

1. **Given** a second document type contributed by another part of the platform, **When** an
   operator opens *Document templates*, **Then** both document types are listed with their own
   blocks and sample data.
2. **Given** the part of the platform owning a document type is switched off, **When** an operator
   opens *Document templates*, **Then** that document type and its templates are not shown, and
   switching it back on restores them unchanged.

---

### Edge Cases

- **A template places no block that prints anything** (for example everything deleted): the export
  uses the built-in layout rather than producing an empty PDF.
- **A template contains a block whose owner is switched off or no longer installed**: that block is
  skipped in the PDF, the rest prints, and the block's stored settings are kept for when the owner
  returns.
- **The comparison has many products** (up to the configured maximum of 16): the comparison table
  splits the products across as many tables (and pages) as needed, with the attribute names repeated
  on each; landscape orientation is chosen automatically for three or more products unless the
  template fixes the orientation.
- **A product image cannot be loaded**: the cell prints without the image; the export does not fail
  (unchanged).
- **A logo image is deleted from the assets library** after being placed: the PDF prints without the
  logo; the editor shows the block as missing its image.
- **A merge field has no value** (for example `{{organizationName}}` for a buyer who is not signed in):
  it prints as empty; a misspelled merge field prints literally so the operator notices it in the
  preview.
- **Some products are hidden from this buyer** (restricted to another organisation): the PDF says how
  many are hidden, as the screen does, and never names them.
- **The template's language is missing** for the buyer's language: the closest language is used (same
  base language, then English, then the first one the template has).
- **The sales channel of a channel-specific template is deleted**: its templates go with it; buyers
  of the remaining channels are unaffected.
- **The template facility is switched off** on the platform modules screen: comparison PDFs keep
  working with today's fixed layout; templates are kept and come back when it is switched on.
- **Product comparison is switched off**: its document type and templates disappear from the
  template screens, nothing is deleted.
- **An operator saves while a buyer is exporting**: the buyer gets either the previous or the new
  layout in full, never a mixture.
- **The rendered PDF would be unreasonably large** (an operator places hundreds of blocks): the
  editor refuses to save beyond the stated limits instead of producing exports that time out.

## Requirements *(mandatory)*

### Functional Requirements

#### Templates and their management

- **FR-001**: The Admin UI MUST provide a *Document templates* screen listing every available
  document type — in this release *Product comparison* — and, per type, its templates with name,
  scope (all channels or one named channel), languages, whether it is active, and when it last
  changed.
- **FR-002**: For each document type the screen MUST show the **built-in layout** as a non-editable
  entry that can be previewed and used as the starting point of a new template.
- **FR-003**: An operator with edit permission MUST be able to create a template for a document type,
  giving it a name and a scope, starting from the built-in layout or from a copy of an existing
  template of the same type. A new template MUST be inactive unless the operator asks to activate it
  on creation.
- **FR-004**: An operator with edit permission MUST be able to rename, duplicate (into the same or a
  different scope), activate, deactivate and delete templates. A template's scope MUST NOT change
  after creation; duplicating is the way to move a layout to another scope.
- **FR-005**: For each document type and scope there MUST be at most one active template.
  Activating a template MUST deactivate the previously active one of the same type and scope in the
  same step.
- **FR-006**: Saving a template MUST be refused, without overwriting, when the template changed since
  the operator loaded it; the operator MUST be told so.
- **FR-007**: Deleting an active template MUST be allowed only after confirmation that says exports
  in that scope will fall back to the next applicable layout (FR-031).
- **FR-008**: The system MUST refuse to save a layout larger than the published limits (number of
  blocks per language, total template size) with a message naming the limit. [Limits stated in the
  plan.]

#### Editing in the Page Builder

- **FR-010**: Templates MUST be edited in the Admin UI Page Builder — the same editor experience as
  invoice templates and CMS pages: a palette of blocks grouped in sections, a canvas, per-block
  settings, an outline, undo/redo, full-screen mode, and an explicit *Save*.
- **FR-011**: The palette for the comparison document type MUST offer these **general-purpose
  blocks**: heading, text (with merge fields), image from the assets library, spacer, divider and
  page break.
- **FR-012**: The palette MUST offer these **comparison blocks**:
  - **Comparison header** — title, optional date of export, optional caption naming the display mode
    (with editable wording for each mode), optional note saying whose prices are shown (the buyer's
    organisation's or the channel's public prices).
  - **Comparison table** — one column per product and one row per compared attribute, with
    switchable product image (and its size), product name, SKU, price and availability; an editable
    heading for the attribute column; the text printed for a missing value; highlighting of rows that
    are the same or differ, with colours; header and border colours; font size; how many products
    one table holds before the products continue in the next table; and the wording of the note
    about hidden products.
  - **Share link** — the address of the comparison's share page as text and, optionally, as a QR
    code, with an editable label. Shown only when the storefront address of the channel is
    configured.
- **FR-013**: The document as a whole MUST have settings for page size (A4 or Letter), orientation
  (automatic, portrait, landscape), margins, base font size, an optional repeating header and footer
  text on every page (with merge fields), and optional page numbers.
- **FR-014**: The editor MUST let the operator choose the language being edited among the platform's
  active content languages, and adding a language MUST start it as a copy of an existing language's
  layout.
- **FR-015**: The editor MUST offer *Preview PDF*, producing the real PDF of the layout currently on
  the canvas (saved or not), in the language being edited, filled with the sample comparison. It MUST
  NOT save anything.
- **FR-016**: The canvas MUST show each comparison block filled with the same sample comparison the
  preview uses, so the canvas and the preview do not disagree about content.
- **FR-017**: The editor MUST list the merge fields available for the document type, with a short
  description of each, so the operator does not have to guess their spelling.
- **FR-018**: A block the editor cannot draw (its owner is switched off or unknown) MUST stay in the
  template, be shown as a neutral placeholder naming it, and keep its settings.

#### What the comparison PDF contains

- **FR-020**: The comparison PDF MUST contain the buyer's own comparison exactly as the comparison
  page shows it to them: the same products, in the same order, with the same prices (theirs or the
  channel's), availability and attribute values, and the same rows for the active display mode and
  the *hide empty rows* switch.
- **FR-021**: Products the buyer may not see MUST NOT appear in the PDF in any form; when some are
  hidden the PDF MUST be able to say how many (the comparison table's hidden-products note).
- **FR-022**: Product names, attribute names, dates and amounts MUST be printed in the PDF's
  language: names in that language when the catalogue has them, dates and money in that language's
  format.
- **FR-023**: The comparison document type MUST offer at least these merge fields: export date,
  number of products compared, sales channel name, the signed-in buyer's name, their organisation's
  name, the share-page address, and — in the page header and footer — the current page number and
  page count. A merge field with no value for this export MUST print as empty.
  [NEEDS CLARIFICATION: Q4 — is this the right set of blocks and merge fields for the first release,
  and should the template be able to choose or reorder the compared attributes rather than follow the
  buyer's display mode?]

#### Producing the PDF

- **FR-030**: Clicking `PDF` on the storefront comparison page MUST produce the PDF from the template
  that applies to the buyer's sales channel and language, determined at the moment of export.
- **FR-031**: The template applied MUST be, in order: the active template for the buyer's sales
  channel; else the active template for all channels; else the built-in layout. A template that
  applies but places nothing printable MUST be treated as absent for this purpose.
  [NEEDS CLARIFICATION: Q3 — is "all channels, with optional per-channel override" the right scope,
  or are per-organisation / per-customer-group templates needed?]
- **FR-032**: Within the applied template the language used MUST be, in order: the buyer's language
  on the storefront; a language with the same base language; English; the first language the template
  has. The buyer's language MUST be the language the storefront is displayed in, falling back to the
  channel's default language.
- **FR-033**: Only the template's settings MAY change the PDF's layout; the PDF's data MUST come only
  from the buyer's comparison and the platform data the comparison page itself uses. A template MUST
  NOT be able to make the PDF include another buyer's data, another channel's data, or any file or
  address the operator did not choose from the assets library.
- **FR-034**: A buyer MUST receive a PDF rendered entirely from one version of the template, even if
  the template is being saved at the same moment.
- **FR-035**: When producing the PDF fails, the buyer MUST see the existing "PDF could not be
  generated" message in their language, and the failure MUST be logged with the template and block
  responsible. A failure of one product image MUST NOT fail the export (unchanged).
- **FR-036**: The file name, the owner-only access and the "empty comparison cannot be exported"
  behaviour of the export MUST stay as they are today.
  [NEEDS CLARIFICATION: Q2 — one active layout per scope as specified, or should the buyer choose
  between several published layouts (for example "with prices" / "without prices") when clicking
  `PDF`?]

#### Availability (switching modules on and off)

- **FR-050**: The document-template facility MUST be switchable on the platform modules screen,
  on by default. While it is off: its screens, sidebar entry, palette entry and the *PDF template*
  button on the *Comparisons* screen MUST be absent, its API MUST refuse as for any switched-off
  module, and the comparison PDF MUST keep working with today's fixed layout. Switching it on again
  MUST restore every template unchanged.
- **FR-051**: While product comparison is switched off, its document type, its blocks and its
  templates MUST NOT appear anywhere in the document-template screens or API, and its templates MUST
  be kept unchanged for when it returns.
- **FR-052**: A block of a switched-off owner placed in any template MUST be skipped when the PDF is
  produced and kept in storage (FR-018).

#### Permissions, auditing, discoverability, languages

- **FR-060**: Viewing document templates (list, editor, preview) and editing them (create, save,
  rename, duplicate, activate, deactivate, delete) MUST be two separately grantable permissions,
  listed on the admin roles screen with Polish and English labels.
- **FR-061**: Every change to a template (create, rename, save, activate, deactivate, delete) MUST be
  recorded in the audit log with the acting administrator, the template and the change, and a failed
  change MUST leave no audit entry.
- **FR-062**: *Document templates* MUST be reachable from the ⌘K / Ctrl+K command palette (also by
  searching "PDF", "comparison" or their Polish equivalents) and from the sidebar.
- **FR-063**: The *Comparisons* admin screen MUST offer a *PDF template* button leading to the
  comparison templates, shown only to administrators allowed to view document templates and only
  while the facility is on.
- **FR-064**: Every new text in the Admin UI and the storefront, every block and merge-field label,
  every error message and the built-in layout's printed texts MUST exist in Polish and English.
- **FR-065**: The end-user documentation MUST describe designing the comparison PDF, in Polish and
  English.

#### Reuse

- **FR-070**: Adding a further document type (for example a quote request) MUST require no change to
  the template facility: its owner supplies the document type's name, blocks, merge fields, sample
  data and built-in layout, and gets the list, editor, preview, scopes, languages, auditing and
  permissions of this feature.
- **FR-071**: Existing invoice templates MUST keep working exactly as they do today; this feature
  does not change them.

### Key Entities

- **Document type** — a kind of document the platform can produce from a template. Identified by a
  stable code (for example *product comparison*); supplied by the part of the platform that owns the
  document's data, together with its blocks, merge fields, sample data and built-in layout. Not
  stored by operators.
- **Document template** — an operator's layout for one document type: a name, a scope (all channels
  or one sales channel), whether it is active, a version used to detect concurrent edits, and one
  layout per language. At most one active per document type and scope.
- **Layout (per language)** — the ordered blocks with their settings plus the document's page
  settings, for one language.
- **Block** — one placed element, identified by a stable name that says which part of the platform
  owns it; its settings are kept as entered.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator who has never used the feature can create a comparison template with a
  logo, a new title and a footer, preview it and activate it in under 10 minutes, without help.
- **SC-002**: After activation, 100 % of comparison PDFs exported in the template's scope use it —
  verified by exporting from each channel and language combination the deployment serves.
- **SC-003**: A comparison of 16 products with images exports in under 5 seconds at the 95th
  percentile, and a preview of the built-in layout with the sample comparison appears in under
  3 seconds — no slower than today's export of the same comparison by more than 0.5 s.
- **SC-004**: A buyer browsing in Polish receives a PDF with no English text that comes from the
  platform (titles, captions, labels, notes) when the template has a Polish layout or no template
  exists.
- **SC-005**: Zero PDFs contain a product, price or name the exporting buyer cannot see on their
  comparison page — verified by the cross-organisation and cross-channel tests.
- **SC-006**: Switching the template facility off and on, or product comparison off and on, loses no
  template and changes no stored layout.
- **SC-007**: Adding the test-only second document type in the test suite touches no file of the
  template facility.

## Open questions

Each question has the default the design assumes. Q2, Q3 and Q4 are marked in the requirements
above; the others are recorded as assumptions.

- **Q1 — Build a reusable "Document templates" facility now, or a comparison-only template?**
  Default: a reusable facility with its own *Document templates* screen (comparison first; quote
  request next; invoices may move onto it later). Alternatives: (a) a comparison-only template inside
  the *Comparisons* section, copying the invoice editor; (b) extend the invoice template screen to
  host other documents.
- **Q2 — One active layout per scope, or several the buyer chooses from?** Default: one active per
  scope; the buyer just clicks `PDF`. Alternatives: (a) the buyer picks among published layouts in a
  small menu; (b) the layout depends on whether the buyer is signed in (for example no prices for
  anonymous visitors).
- **Q3 — Which scopes?** Default: all channels with an optional per-channel override. Alternatives:
  (a) all channels only; (b) additionally per organisation or customer group.
- **Q4 — Which blocks and merge fields in the first release; may the template control the attribute
  list?** Default: the set in FR-011–FR-013 and FR-023; the attribute rows always follow the buyer's
  display mode. Alternatives: (a) a smaller set (table, text, logo); (b) add product descriptions or
  a product-detail page per product; (c) let the template pick, order or exclude attributes.
- **Q5 — What when no template is active?** Default: the built-in layout, now in the buyer's
  language (and today's fixed English layout only while the facility is switched off). Alternatives:
  (a) keep today's English-only layout until an operator activates a template; (b) hide the `PDF`
  button until a template is active.
- **Q6 — Draft and publish, or edit live?** Default: edit live (saving the active template changes
  the next export) with *duplicate → edit → activate* as the safe path; no version history.
  Alternatives: (a) each template has a draft and a published version; (b) keep a version history
  with restore.
- **Q7 — Which language does the PDF use?** Default: the language the buyer has the storefront in,
  then the channel's default. Alternatives: (a) always the channel's default language; (b) let the
  buyer choose at export.

## Assumptions

- The PDF remains available only to the comparison's owner from the comparison page; recipients of a
  share link do not get a `PDF` button (unchanged; out of scope).
- Templates are shop configuration shared by all organisations; they are not per-organisation data.
- The storefront address used by the share-link block is the existing per-channel *storefront URL*
  setting; when it is not set the block prints nothing.
- Images placed by operators come from the assets library only; free image addresses are not
  offered (they would let the server fetch arbitrary addresses).
- Fonts are the platform's existing PDF fonts; custom fonts are out of scope.
- Invoice templates are untouched in this release (FR-071); moving them onto the facility is a
  possible later feature.

## Out of scope

- A quote-request (RFQ) PDF and its template — only the facility's readiness for it (US5).
- Moving invoice templates onto the facility.
- PDF export for share-link recipients, e-mailing the PDF, or attaching it anywhere.
- Custom fonts, multi-column layouts and nested containers in the first release.
- Version history, scheduled activation, and per-organisation or per-customer-group templates (see
  Q3, Q6).
- Translating the other hard-coded Polish texts of the storefront comparison page beyond the `PDF`
  button's own states (recorded as a separate defect in `research.md` R-21).
