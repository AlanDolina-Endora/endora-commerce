# Feature Specification: Quote request PDF export with a per-quote, Page Builder–designed template and a configurable line-items table

**Feature Branch**: `feat/153-quote-request-pdf-template` (spec directory `specs/153-quote-request-pdf-template/`)
**Created**: 2026-10-17
**Status**: Ready for implementation — owner decisions D1–D3 (below) are fixed and the owner answered
the open questions Q1–Q7 on 2026-10-17 (*Clarifications*). Q4 was answered differently from the
recommendation: a *Send PDF to customer* action is in scope (User Story 8, FR-090–FR-099).
**Input**: Product-owner request, verbatim: *"Dodać możliwość eksportu Zapytania Ofertowego do PDF z
możliwością wyboru szablonu PDF dla Zapytania Ofertowego. Idealnie byłoby, gdyby wygląd szablonu PDF
dla Zapytania Ofertowego można było tworzyć z wykorzystaniem Page Builder, na podobnej zasadzie jak
jest to robione dla Szablonów Faktur."* — translated: *"Add the ability to export a Quote Request to
PDF, with a choice of the PDF template for the Quote Request. Ideally the look of the Quote Request
PDF template could be designed with the Page Builder, on the same principle as Invoice Templates."*

## Background

Feature `specs/152-compare-pdf-template/` built the **document templates** facility: an operator
designs a PDF for a *document type* in the Page Builder, per language and per sales channel, with one
default per scope. Invoices and the storefront product comparison use it. That feature anticipated the
quote request as the first document type whose templates a person may pick **per document**, and
proved the shape with a test-only stand-in.

A sales representative has no way today to hand a customer a quote as a document: the quote lives
only on the admin and storefront screens.

## Owner decisions (2026-10-17, given with the task)

- **D1 — Per-quote choice.** The sales representative chooses a template for each individual quote
  request; the default template is preselected.
- **D2 — The template controls the line-item columns.** Delivered as a **Line items table** block with
  configurable columns: an ordered list of columns, each showing one field of a **line-item field
  catalogue declared by the document type**, with a per-language header label, width, alignment and
  number/currency format, and a visibility rule (*always* / *only if any line has a value* / *never*);
  plus an optional detail row under each line, totals rows and optional grouping; printed as a real
  table that continues across pages with its header row repeated. The general machinery belongs to the
  document-template facility so invoices and the comparison can adopt it later.
- **D3 — Repeater parked.** A general "repeat these blocks once per line" block is **not built now**,
  but nothing delivered here may have to be redone to add it later: the line-item field catalogue, the
  visibility rules and the item-level placeholders must be reusable by it.

## Vocabulary

- **Quote PDF** — the PDF of one quote request, produced on demand from its current lines.
- **Quote template** — a document template of the *Quote request* document type (`specs/152-…`
  vocabulary: scope, default, built-in layout, language layouts).
- **Chosen template** — the quote template a representative picked for one quote; remembered on that
  quote (Q2).
- **Line items table** — a block that prints a document's lines as a table whose columns the template
  defines.
- **Line field** — one piece of information about a line the table can show (product name, quantity,
  unit price after discount, …). The set a document type offers is its **line field catalogue**.
- **Visibility rule** — when a column, a detail entry or a totals row is printed: *always*, *only if
  it has a value* (any line, for a column), or *never*.
- **List price** — the price the customer would normally have paid for the product, recorded when the
  line was requested (feature 146's reference price). **Discount** — the difference between the list
  price and the agreed price, when the agreed price is lower.
- **Internal field** — a line field whose value the customer does not see anywhere else in the
  platform (list price, discount); the editor says so when a template prints one.

## Clarifications

### Session 2026-10-17 — owner answers to Q1–Q7

- **Q1 — Who may export?** → **Administrators only** in this release: a representative holding the
  quote-handling permission who can see the quote's organisation. No storefront export.
- **Q2 — Is the chosen template stored on the quote?** → **Yes.** The template a representative picks
  is remembered on the quote, the change is audited, and it is preselected next time for everybody.
- **Q3 — In which states may a quote be exported?** → **Every state.** Lines without an agreed price
  print an empty price, and totals that need every price are left out.
- **Q4 — Is the PDF sent by e-mail?** → **Changed from the recommendation: yes, through a dedicated
  *Send PDF to customer* action** on the admin quote request screen (User Story 8). The dialog offers
  the export choices (template, preselected per Q2; language, per Q5) plus the recipients — the quote's
  requesting customer's e-mail preselected, further addresses may be added — and an optional personal
  message. The e-mail is a transactional e-mail whose subject and body the operator edits like every
  other one (Polish and English defaults), with the rendered PDF attached. Sending is an audited
  action recorded on the quote's history. Design decisions taken under this answer:
  - **Recipients**: arbitrary, well-formed addresses are allowed (a buyer often forwards an offer to a
    colleague in purchasing) — at most **5** per send after removing duplicates (case-insensitive);
    the requester's address is preselected but removable. Every address is recorded in the audit
    entry and on the history.
  - **Personal message**: optional plain text, at most 2 000 characters, printed in the e-mail body.
  - **Limits**: the PDF attached may not exceed **10 MiB**; one administrator may send at most **10**
    quote PDFs a minute; a send that cannot be performed answers a translated error and records
    nothing.
- **Q5 — Which language?** → The representative **picks the language** in the export and send dialogs,
  preselected with the default language of the quote's sales channel. The e-mail is written in the
  same language as the PDF.
- **Q6 — Is an export recorded?** → **No** for a plain download (it is a read). Only changing the
  remembered template and *Send PDF to customer* are audited.
- **Q7 — May a template print internal fields?** → **Yes, with a visible warning in the editor** on
  every column, detail entry or totals row that prints one.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Export a quote request to PDF with a chosen template (Priority: P1)

On a quote request's admin screen a sales representative clicks *Export PDF*. A dialog offers the
quote templates that apply to the quote's sales channel, with the template remembered for this quote
— or, if none, the default template — preselected, and the language preselected. They download the
PDF: the quote's number, customer, lines, prices and totals laid out as the template says.

**Why this priority**: this is the request.

**Independent Test**: with a default quote template and a second one, export a three-line quote with
each and confirm both PDFs carry the quote's lines and totals in their own layout; reopen the dialog
and confirm the second template is now preselected.

**Acceptance Scenarios**:

1. **Given** no quote template exists, **When** the representative exports, **Then** the dialog offers
   only the built-in layout and the PDF uses it.
2. **Given** a global default template and another global template, **When** the representative opens
   the dialog for a quote with no remembered template, **Then** the default is preselected and both
   are offered.
3. **Given** the representative picks the other template and downloads, **When** anyone opens the
   dialog for that quote again, **Then** that template is preselected (Q2) and the change is in the
   audit log.
4. **Given** the remembered template was deleted, **When** the dialog opens, **Then** it says so and
   preselects the default, and an export without a choice uses the default.
5. **Given** a template scoped to channel B, **When** the quote was raised on channel A, **Then** that
   template is neither offered nor accepted.
6. **Given** a representative who may not see the quote's organisation, **When** they request its
   PDF, **Then** the request is refused exactly as opening the quote is.
7. **Given** the downloaded file, **Then** its name is the quote's number.

---

### User Story 2 — Design quote templates in the Page Builder (Priority: P1)

An operator opens *Document templates → Quote request* (sidebar, ⌘K, or *Manage PDF templates* in
the export dialog), creates a template from the built-in layout, adds the company logo and seller
details, rearranges the quote header, buyer and notes blocks, previews a PDF filled with a sample
quote, and sets it as default — exactly as for comparison and invoice templates.

**Why this priority**: the request names the Page Builder.

**Independent Test**: create a quote template with a logo and seller text, preview it, set it as
default, export a real quote and see the logo and text.

**Acceptance Scenarios**:

1. **Given** the quote template editor, **When** the operator opens the palette, **Then** it offers the
   quote blocks, the Line items table and the general-purpose blocks — no invoice or comparison block.
2. **Given** *Preview PDF*, **Then** the operator gets a PDF of the unsaved canvas filled with the
   sample quote, in the edited language, and nothing is saved.
3. **Given** merge fields such as `{{quoteNumber}}`, `{{validUntil}}`, `{{salesRepName}}`, **When**
   used in a text, **Then** the PDF prints the quote's values.
4. **Given** several quote templates for one scope, **Then** at most one is the default, as for every
   document type.

---

### User Story 3 — A line items table whose columns the template defines (Priority: P1)

In the Line items table's settings the operator builds the column list: adds *Position*, *Product*,
*SKU*, *Quantity*, *List price*, *Discount %*, *Price after discount*, *Net*, *VAT*, *Gross* from the
quote's line field catalogue, reorders them, renames a header in each language, sets widths,
alignment and money format, and makes *Discount %* print only if any line has a discount. One
template shows discounts, another one does not.

**Why this priority**: owner decision D2 — the reason a quote PDF needs more than a fixed layout.

**Independent Test**: export one quote with two templates — one with list price and discount columns
whose rule is *only if any line has a value*, one without — first for a quote with one discounted
line, then for a quote with none: the first template prints the discount columns only for the first
quote; the second never does.

**Acceptance Scenarios**:

1. **Given** the column editor, **When** the operator adds a column, **Then** they choose its field
   from the quote's line field catalogue, grouped (line, pricing, product attributes), each with its
   name and a mark on internal fields.
2. **Given** a column with an empty header label, **Then** the field's name in the PDF's language is
   printed; **given** a label, **Then** that label is printed in that language's layout.
3. **Given** a column rule *only if any line has a value*, **When** no line has a value for it, **Then**
   the column is left out and the remaining columns share the width.
4. **Given** a column rule *never*, **Then** the column is never printed but its settings are kept.
5. **Given** money columns, **Then** amounts are printed in the quote's currency with the chosen
   decimals and currency display, in the PDF language's number format; numbers are right-aligned
   unless set otherwise.
6. **Given** a quote with 120 lines, **Then** the table continues across pages, repeats its header row
   on every page, and never splits one line's row across a page.
7. **Given** a product attribute column (for example *Colour* or a shop's *Lead time* attribute),
   **Then** each line prints that product's value of the attribute in the PDF's language.
8. **Given** a template containing a column whose field no longer exists (an attribute was deleted),
   **Then** the column prints its empty text and the document does not fail.

---

### User Story 4 — Detail row, totals and grouping (Priority: P2)

The operator turns on a detail row that prints, under each line, its note and the product's lead-time
attribute ("Note: … · Lead time: …"), only where there is something to say; adds totals rows — list
value, discounts, net, VAT, gross — the discount row only when there is a discount; and, for a long
quote, groups the lines by the product's *Brand* attribute with a subtotal per group.

**Why this priority**: owner decision D2 lists them as block options; a quote is readable without
them.

**Independent Test**: export a quote where one line has a note and none has a discount: exactly one
detail row prints; the discount totals row is absent; with grouping on, lines are grouped by brand in
order of first appearance with correct subtotals.

**Acceptance Scenarios**:

1. **Given** a detail row with two entries, **When** a line has neither value, **Then** no detail row
   prints under it; **when** it has one, **Then** only that entry prints.
2. **Given** totals rows, **When** every line has an agreed price, **Then** net, VAT and gross print
   and gross = net + VAT; **when** a line has none, **Then** totals that need it are left out (Q3).
3. **Given** grouping by a field, **Then** each group starts with a header row naming the value
   (lines without a value under a group named by the configured text), keeps the lines' order within
   the group, and — if set — ends with a subtotal of the chosen money field.

---

### User Story 5 — The PDF speaks the chosen language (Priority: P2)

A template holds one layout per language. The representative exports a quote for a Polish customer
in Polish and for a German customer in English; every printed platform text, field name, number,
money amount and date follows the language.

**Why this priority**: every user-facing output ships in Polish and English.

**Independent Test**: export one quote in `pl-PL` and `en-US` with a template holding both layouts.

**Acceptance Scenarios**:

1. **Given** the export dialog, **Then** the language is preselected with the default language of the
   quote's sales channel and can be changed (Q5).
2. **Given** a language the template lacks, **Then** the closest language the template has is used
   (same rule as every document type).
3. **Given** the built-in layout, **Then** it exists in Polish and English.

---

### User Story 6 — Templates per sales channel (Priority: P2)

A multi-brand shop keeps a quote template for channel B with another logo; quotes raised on channel B
default to it, quotes on other channels never see it.

**Independent Test**: global default + channel-B default; export a channel-A and a channel-B quote
without choosing.

**Acceptance Scenarios**:

1. **Given** a channel-B default and a global default, **When** a channel-B quote is exported without a
   choice, **Then** the channel-B default is used; a channel-A quote uses the global default.
2. **Given** a quote recorded without a channel, **Then** only all-channel templates are offered.

---

### User Story 7 — The configurable table is ready for other documents and a future repeater (Priority: P3)

A later feature lets invoices adopt the Line items table, or adds a block that repeats a group of
blocks once per line with item-level placeholders such as `{{item.sku}}`. Neither has to change the
line field catalogue, the visibility rules or the stored templates delivered here.

**Why this priority**: owner decisions D2 and D3; no user value in this release by itself.

**Independent Test**: in the test suite, a test-only document type declaring its own line collection
gets the Line items table in its palette and prints its own lines through it, with no change to the
facility; the visibility rules are evaluated by one function that already accepts an item scope.

**Acceptance Scenarios**:

1. **Given** a document type declaring a line collection, **Then** the Line items table is offered in
   its palette and prints that type's lines; **given** one declaring none, **Then** it is not offered
   and saving a template containing it is refused.
2. **Given** a text containing `{{item.sku}}` outside any line, **Then** it prints literally (the
   placeholder is reserved, not resolved).

---

### User Story 8 — Send the quote PDF to the customer by e-mail (Priority: P2)

On a quote request's admin screen a sales representative clicks *Send PDF to customer*. The dialog
offers the same template and language choices as *Export PDF*, the recipients — the requesting
customer's e-mail already filled in — and an optional personal message. They click *Send*: every
recipient receives the operator-editable *Quote request PDF* e-mail with the quote's PDF attached, the
quote's history shows who sent it to whom, with which template and in which language, and the audit
log records the same.

**Why this priority**: owner answer Q4 — handing the offer to the customer without leaving the
platform. A representative can already download and forward the PDF (US1), so it is not MVP.

**Independent Test**: with a quote whose requester has an e-mail, send the PDF with the remembered
template and a message to the requester and one extra address; both receive an e-mail with the PDF
attached and the message in the body; the history shows one *PDF sent* entry naming both addresses;
the audit log has one entry; switching the e-mail off in *E-mail templates* makes the next send fail
with a clear message and record nothing.

**Acceptance Scenarios**:

1. **Given** the quote's requester has an e-mail address, **When** the representative opens *Send PDF
   to customer*, **Then** the template and language are preselected as for the export and the
   requester's address is the only recipient.
2. **Given** the representative adds a second, well-formed address and a message and sends, **Then**
   each recipient receives one e-mail in the chosen language with the PDF named after the quote's
   number attached and the message in the body.
3. **Given** a malformed address, more than 5 recipients, or no recipient, **When** they try to send,
   **Then** the dialog says what is wrong and nothing is sent.
4. **Given** a successful send, **Then** the quote's history shows a *PDF sent* entry with the acting
   representative, the recipients, the template and the language, and the audit log records the same
   without the PDF.
5. **Given** a template other than the remembered one, **When** the representative sends with it,
   **Then** it is remembered as for an export (Q2).
6. **Given** the *Quote request PDF* e-mail is switched off, or no mail transport is configured,
   **When** they send, **Then** they are told the e-mail cannot be sent and why, and nothing is
   recorded.
7. **Given** document templates are switched off, **Then** *Send PDF to customer* is absent and the
   send API refuses.
8. **Given** a representative who may not see the quote's organisation, **Then** sending is refused
   exactly as opening the quote is.

---

### Edge Cases

- **A quote with no agreed prices** (*Pending*): price, net, VAT and gross cells are empty; totals that
  need every price are left out; the PDF does not fail (Q3).
- **Lines in different currencies** (not produced today): per-line amounts print in their own
  currency; totals across currencies are left out.
- **List price in another currency than the line**: discount fields have no value for that line.
- **Agreed price above the list price**: no discount (the discount fields have no value).
- **Every column hidden by its rule**: the table prints its header-less empty text instead of an empty
  grid.
- **Too wide**: fixed widths larger than the page are scaled down to fit; the PDF does not fail.
- **The remembered template was deleted or moved out of reach**: the default is used and the dialog
  says so; nothing is cleared automatically.
- **The template's channel was deleted**: its templates go with it (152); a quote that remembered one
  falls back to the default.
- **An image or logo cannot be loaded**: printed without it.
- **A merge field has no value** (no sales representative assigned, no validity date): prints empty.
- **A product was deleted after it was quoted**: the line keeps its stored name; SKU and attribute
  cells are empty.
- **Document templates switched off**: *Export PDF* is absent and the export API refuses; the
  remembered template stays stored and works again when switched back on.
- **Quote requests switched off**: the *Quote request* document type and its templates disappear from
  the template screens; nothing is deleted.
- **A save while a quote is being exported**: the PDF uses one version of the template in full.
- **Sending: the PDF is larger than 10 MiB**: nothing is sent; the dialog says the PDF is too large
  to e-mail and suggests downloading it.
- **Sending: one recipient's delivery fails, another's succeeds**: the e-mail stays sent to the
  successful ones; the dialog names the failed addresses; the history and audit list only the
  addresses the e-mail was handed to.
- **Sending: the requester has no e-mail address** (a deleted customer account): no recipient is
  preselected; the representative types one.

## Requirements *(mandatory)*

### Functional Requirements

#### Exporting a quote request

- **FR-001**: The admin quote request screen MUST offer *Export PDF* to an administrator who may handle
  quote requests and see the quote's organisation, while document templates are on.
- **FR-002**: *Export PDF* MUST open a dialog offering every quote template whose scope is all channels
  or the quote's sales channel, plus the built-in layout when no default exists, each marked if it is
  the default; the template remembered for the quote — else the default that applies to the quote's
  channel — MUST be preselected (D1).
- **FR-003**: The dialog MUST let the representative choose the PDF language among the languages the
  chosen layout holds, preselected with the default language of the quote's sales channel (Q5).
- **FR-004**: Downloading MUST produce the PDF of the quote's **current** lines, header and prices with
  the chosen template and language, named after the quote's number.
- **FR-005**: Choosing a template other than the remembered one and downloading MUST remember it for
  the quote (Q2); remembering is a change recorded in the audit log with the acting administrator and
  the previous and new template; choosing the same one records nothing.
- **FR-006**: An export without an explicit choice MUST use the remembered template, else the default
  for the quote's channel, else the default for all channels, else the built-in layout (152 FR-031).
- **FR-007**: A remembered or chosen template that no longer exists MUST be replaced by the default of
  FR-006, and the dialog MUST say so; a template of another document type or of another sales channel
  MUST be refused.
- **FR-008**: The export MUST be available in every quote state (Q3).
- **FR-009**: The quote PDF MUST contain only the quote's own data as the representative may see it;
  a template MUST NOT make it include another organisation's or another channel's data.
- **FR-010**: Remembering a template MUST NOT change the quote's offer, revision or version, and MUST
  NOT make a concurrent edit of the offer fail.
- **FR-011**: The dialog MUST offer *Manage PDF templates*, leading to the quote templates, only to an
  administrator who may view document templates.
- **FR-012**: A failed export MUST show a translated message and be logged with the quote, the template
  and the block responsible.

#### What the quote PDF can contain

- **FR-020**: The *Quote request* document type MUST allow per-document selection, hold layouts in any
  active content language, and opt into every general-purpose block (heading, text, image, spacer,
  divider, page break).
- **FR-021**: It MUST offer these quote blocks: **Quote header** (title, quote number, issue date,
  validity date, revision number, each switchable, labels editable), **Buyer and contact** (the
  organisation's name, legal name, tax ID and registered address; the requesting customer's name and
  e-mail; the assigned sales representative's name and e-mail — each switchable), **Quote notes** (the
  quote's header note with an editable label), and **Quote details** (the quote's custom fields that
  customers may see, as label–value pairs).
- **FR-022**: It MUST offer the **Line items table** bound to the quote's lines (FR-030–FR-048).
- **FR-023**: It MUST offer these merge fields: quote number, validity date, revision number, status,
  currency, organisation name, organisation tax ID, customer name, customer e-mail, sales representative
  name and e-mail, sales channel name, net total, gross total — plus the facility's date, page and page
  count.
- **FR-024**: Its built-in layout MUST exist in Polish and English and print: a header with the quote
  number, dates and validity; buyer and contact; the notes; a line items table with position, product,
  quantity, unit, price after discount, VAT rate, net and gross, plus list price and discount % only if
  any line has a discount; and totals rows.
- **FR-025**: The quote line field catalogue MUST offer, derived from the quote's data: position,
  product name, variant, SKU, quantity, packaging unit, quantity in packaging units, list unit price,
  customer's proposed unit price, unit price after discount, unit gross price, discount %, unit discount,
  line discount, line list value, line net, VAT rate, line VAT, line gross, line note, and one field per
  product attribute shown on the product page. Fields that do not exist in the platform's data — a
  dedicated lead-time field, per-line custom fields — MUST NOT be invented; a shop's own lead-time
  attribute is reachable as a product attribute.
- **FR-026**: List price and the discount fields MUST be marked **internal** (Q7); the editor MUST warn
  on every column, detail entry or totals row printing an internal field.
- **FR-027**: Discount fields MUST have a value only for a line whose agreed price is lower than its
  list price in the same currency.
- **FR-028**: Line net MUST be the agreed unit price × quantity; totals MUST follow the quote's
  existing rule — computed only when every line has an agreed price; VAT MUST be computed from the net
  total at the quote's VAT rate; gross = net + VAT. All amounts MUST be rounded to the currency's
  minor unit.
- **FR-029**: The totals offered MUST be: list value, discounts, net, VAT rate, VAT, gross.

#### The Line items table (facility, reusable)

- **FR-030**: The document-template facility MUST provide a **Line items table** block, offered to a
  document type if and only if the type declares a line collection; saving a template that places it in
  a type that declares none MUST be refused, naming the block.
- **FR-031**: A document type MUST be able to declare, without changing the facility, one or more line
  collections, each with a name, a **field catalogue** (key, name in the requested language, value
  kind, default format and alignment, internal or not, group) and its lines' values; the facility MUST
  add a *Position* field to every collection.
- **FR-032**: The table's columns MUST be an ordered list (1 to 16) the operator edits: add, remove,
  reorder (also from the keyboard), and per column: field, header label (empty = the field's name),
  width (automatic, fill the rest, or fixed), alignment (automatic by value kind, left, centre, right),
  format (decimals; for money: symbol, code or no currency; for dates: short, medium, long) and the text
  printed when a line has no value.
- **FR-033**: Every column MUST carry a visibility rule: *always*, *only if any line has a value*,
  *never* (D2). A hidden column's width MUST be shared by the others.
- **FR-034**: The table MUST be printed as a real table: its header row repeated on every page, no line
  split across pages, and widths scaled to the page when fixed widths exceed it.
- **FR-035**: The table MUST offer header background, border colour, font size and striped rows, and
  an *empty* text printed instead of the table when the collection has no lines or every column is
  hidden.
- **FR-036**: Values MUST be formatted by the facility in the PDF's language — the same formatting in
  the editor's canvas and in the PDF.
- **FR-037**: A column, detail entry or totals row naming a field the catalogue no longer offers MUST
  print its empty text and not fail the document; the editor MUST flag it.
- **FR-040**: The table MUST offer an optional **detail row** under each line: an ordered list (up to 8)
  of entries, each a field with a label and a visibility rule (default *only if it has a value*),
  printed as "label: value" pairs separated by a configurable separator, spanning the table's width,
  and left out for a line where no entry prints.
- **FR-041**: The table MUST offer **totals rows**: an ordered list (up to 10) of the collection's
  totals, each with a label and a visibility rule (*always*, *only if it has a value*, *never*), the
  last ones optionally emphasised, printed right-aligned under the table.
- **FR-042**: The table MUST offer optional **grouping** by one field: lines grouped by its value in
  order of first appearance, keeping their order within a group, each group under a header row
  showing the value (or a configurable text when the value is empty), optionally followed by a
  subtotal row of one numeric or money field.
- **FR-043**: The facility MUST validate the table's settings when a template is saved (counts, field
  and rule shapes, ranges), refusing with a message that names the setting.
- **FR-044**: The visibility rules MUST be one reusable rule model evaluated over a scope — all lines
  of a collection, one line, or the totals — so a later block can use the same rules (D3).
- **FR-045**: Item-level placeholders of the form `{{item.<field>}}` MUST be reserved for a later
  repeater and MUST print literally wherever no line is in scope (D3).

#### Generic facility behaviour retained from 152

- **FR-050**: Everything 152 requires of every document type — management, scopes, one default per
  scope, concurrent-edit refusal, preview, per-language layouts, limits, single-snapshot rendering,
  failure policy, auditing of template changes — MUST apply to quote templates unchanged.
- **FR-051**: Per-document selection MUST obey 152 FR-037–FR-039: only templates of the type, global or
  of the document's channel; a missing one replaced by the default and reported.

#### Sending the quote PDF by e-mail (owner answer Q4)

- **FR-090**: The admin quote request screen MUST offer *Send PDF to customer* under the same
  conditions as *Export PDF* (FR-001, FR-060), in every quote state (Q3).
- **FR-091**: *Send PDF to customer* MUST open a dialog offering the template and language choices of
  FR-002, FR-003 and FR-007, plus the recipients and an optional personal message (at most 2 000
  characters).
- **FR-092**: The recipients MUST be preselected with the requesting customer's e-mail address when
  it has one; the representative MAY remove it and add other addresses. Every address MUST be a
  well-formed e-mail address; duplicates (case-insensitive) MUST be merged; at least 1 and at most 5
  recipients MUST be sent to. Arbitrary addresses are allowed.
- **FR-093**: Sending MUST render the quote PDF exactly as the export would with the same choices
  (FR-004, FR-006, FR-007) and deliver it to every recipient as a separate e-mail of the
  transactional e-mail *Quote request PDF*, written in the PDF's language, with the PDF attached under
  the export's file name.
- **FR-094**: The *Quote request PDF* e-mail MUST be editable and switchable off like every other
  transactional e-mail, ship default subjects and bodies in Polish and English, and offer the
  variables quote number, validity date, customer name, sales representative name and e-mail, sales
  channel name and the personal message.
- **FR-095**: A send whose template differs from the remembered one MUST remember it, exactly as an
  export does (FR-005).
- **FR-096**: A successful send MUST be recorded as one audited action naming the acting
  administrator, the template, the language and the recipients the e-mail was handed to — never the
  PDF itself — and MUST add one *PDF sent* entry with the same facts to the quote's admin history.
  It MUST NOT change the quote's offer, revision or version.
- **FR-097**: A send MUST be refused, with a translated message and nothing recorded, when the PDF
  exceeds 10 MiB, when the *Quote request PDF* e-mail is switched off, when no mail transport is
  configured, or when every recipient's delivery fails; when only some deliveries fail, the dialog
  MUST name the failed addresses and only the delivered ones are recorded.
- **FR-098**: One administrator MUST NOT be able to send more than 10 quote PDFs a minute; the excess
  is refused with a translated message.
- **FR-099**: Sending MUST require the quote-handling permission and the quote's organisation
  visibility (FR-070); while document templates are off it MUST be absent and refused (FR-060).

#### Availability

- **FR-060**: While document templates are off: *Export PDF* and the dialog MUST be absent, the quote
  PDF API MUST refuse, and every remembered template MUST be kept and work again when switched on.
- **FR-061**: While quote requests are off: the *Quote request* type, its blocks and templates MUST NOT
  appear in the template screens or API, and MUST be kept unchanged.

#### Permissions, auditing, discoverability, languages, documentation

- **FR-070**: Exporting, sending and remembering a template MUST require the existing quote-handling
  permission and the quote's organisation visibility; no new permission.
- **FR-071**: Remembering a template (FR-005) and sending the PDF (FR-096) MUST be audited; template
  design changes are audited by the facility (FR-050). Producing a PDF for download is not recorded
  (Q6).
- **FR-072**: The ⌘K palette MUST find document templates also by "quote PDF", "offer template",
  "szablon oferty", "zapytanie ofertowe PDF".
- **FR-073**: Every new admin text, block and field name, merge-field description, error message and
  built-in printed text MUST exist in Polish and English.
- **FR-074**: The end-user documentation MUST describe exporting a quote to PDF, sending it to the
  customer, and designing quote templates, including the Line items table, in Polish and English.

#### Reuse

- **FR-080**: Adopting the Line items table in another document type MUST require only declaring a
  line collection on that type; invoices and the comparison are not migrated in this feature.

### Key Entities

- **Quote request** (existing) — gains the **remembered template**: a reference to a quote template, or
  none.
- **Line collection** (declared, not stored) — the lines of a document type that a Line items table
  can print, with its field catalogue and totals.
- **Line field** (declared) — key, name per language, value kind, default format and alignment,
  internal flag, group.
- **Line items table settings** (stored inside a template's layout) — columns, detail row, totals rows,
  grouping, style.
- **Visibility rule** (stored inside those settings) — always, never, has a value, any line has a value.
- **PDF delivery** (a quote history event) — who sent the quote PDF, to which addresses, with which
  template and in which language.

## Success Criteria *(mandatory)*

- **SC-001**: A representative exports a quote with a non-default template in under 30 seconds from
  the quote screen, without help.
- **SC-002**: An operator new to the feature builds a quote template whose table shows a discount column
  only when a discount exists, previews and saves it, in under 15 minutes.
- **SC-003**: A 200-line quote exports in under 5 seconds at the 95th percentile; the dialog opens in
  under 1 second.
- **SC-004**: 100 % of exports without an explicit choice use the template FR-006 selects — verified per
  remembered / channel default / global default / built-in combination.
- **SC-005**: Zero quote PDFs contain data of an organisation the exporting representative cannot see,
  or a template of another channel — verified by the cross-organisation and cross-channel tests.
- **SC-006**: Switching document templates or quote requests off and on loses no template, no
  remembered choice and changes no stored layout.
- **SC-007**: A test-only document type adopts the Line items table by declaring a collection and
  touches no file of the facility.
- **SC-008**: For a reference set of quotes (discounted / not, priced / unpriced, packaging units,
  notes, attributes, 1 and 120 lines), 100 % of PDFs print totals that equal the quote screen's.
- **SC-009**: A representative sends a quote PDF to the requester from the quote screen in under 30
  seconds; 100 % of successful sends appear on the quote's history and in the audit log, and 0 refused
  sends do.

## Assumptions

- Quote templates are shop configuration shared by all organisations (152).
- Seller details (company name, address, bank account) are typed into the template's text blocks; the
  invoice seller settings belong to invoicing and are not read.
- The PDF shows the quote's current offer; earlier revisions are not exported.
- The quote's VAT rate is the single rate the quote screen already shows for the organisation.
- SKU and product attributes are read from the catalogue at export time (the quote stores only the
  product's name); a deleted product prints them empty.
- Fonts are the platform's existing PDF fonts.

## Out of scope

- The storefront export (Q1 alternative) and export audit entries (Q6 alternative).
- Attaching the PDF to the automatic quote e-mails (new offer revision and the like): the PDF is sent
  only by the explicit *Send PDF to customer* action (Q4).
- Scheduled or bulk sending; carbon copies; attachments other than the quote PDF.
- Product images in table cells; per-line custom fields (none exist in the platform).
- Adopting the Line items table in invoices or the comparison (FR-080).
- The repeater block (D3) — only its prerequisites (FR-044, FR-045).
- Exporting an earlier revision; bulk export of several quotes.
