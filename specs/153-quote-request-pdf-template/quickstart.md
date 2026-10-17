# Quickstart: Quote request PDF export and the Line items table

Manual acceptance walk for `specs/153-quote-request-pdf-template/`. Run after the automated suites are
green. Every step names the requirement it proves.

## 0. Setup

```bash
source ~/.nvm/nvm.sh && nvm use 22
pnpm run build:packages
pnpm run dev:infra && pnpm run setup        # db:fresh then module:install --all
pnpm run dev
```

Sign in to the admin as a platform administrator (has `rfqs:handle`, `document_templates:read/write`).
Have two sales channels (A, B) with default languages `pl-PL` (A) and `en-US` (B), and a product
attribute *Brand* and a *Lead time* attribute, both *visible on product page*.

Create three quote requests:
- **QA-1** on channel A, 3 lines, all priced, one line priced **below** its list price, one line with a
  note, one line in a packaging unit;
- **QA-2** on channel A, 2 lines priced at list price (no discount);
- **QB-1** on channel B, 120 lines (use *Create quote request* with a product picker, or the seed helper
  in the contract test's fixtures), mixed brands.

## 1. Export with the built-in layout (US1, FR-001–FR-006, FR-024)

1. Open QA-1 → *Export PDF*. Dialog: only *Built-in layout*, language `Polski` preselected (FR-003).
2. *Download PDF*. File `<QA-1 number>.pdf`. It shows header, buyer and contact, notes, the table with
   **list price and discount % columns** (one line discounted), the note under its line, totals with
   *Rabaty* (FR-024, FR-027).
3. QA-2 → export: **no** list-price or discount columns; no *Rabaty* total (FR-033).

## 2. Design a template (US2, US3, FR-020–FR-023, FR-030–FR-037)

1. ⌘K → type "szablon oferty" → *Document templates* (FR-072) → *Quote request* → *New template* from the
   built-in layout, scope *All channels*, name "Without discounts".
2. Palette: quote blocks, *Line items table*, general-purpose blocks; no invoice or comparison block.
3. Line items table → Columns: remove *List price* and *Discount %*; add *Brand* (group *Product
   attributes*) → it shows no Internal badge; add *List price* again → **Internal** badge (FR-026); remove
   it. Move *SKU* up with the keyboard (focus *Move up*, Enter) — the move is announced (FR-032).
4. Set *Gross* header label to "Wartość brutto", format 2 decimals, currency display *code* → canvas shows
   `PLN` codes (FR-036).
5. Switch the editor language to English → *Start from Polski* → change labels to English; save.
6. *Preview PDF* → a sample PDF in English; nothing saved (152 FR-015).
7. Duplicate the template as "With discounts", add *List price*, *Discount %* (rule *Only if any line has
   a value*), totals *Discounts* (rule *Only if it has a value*). Set "With discounts" as **default**.

## 3. Choose per quote and remember (US1, FR-002, FR-005–FR-007)

1. QA-1 → *Export PDF*: "With discounts" preselected (*Default* badge). Select "Without discounts",
   download → no discount columns.
2. Reopen the dialog: "Without discounts" is preselected — *Your choice is remembered for this quote.*
   Check *Audit log*: one entry `quote_request.set_document_template` with before/after (FR-005, FR-071).
3. Export again without changing → no new audit entry.
4. Delete "Without discounts" in *Document templates*. Reopen QA-1's dialog: warning *The template chosen
   for this quote no longer exists*; "With discounts" preselected; downloading uses it (FR-007).
5. Open QA-2's dialog and download with the preselected default: reopen — still nothing remembered
   (the default is not pinned, `admin-ui.md` §1).

## 4. Detail row, totals, grouping, long tables (US4, FR-034, FR-040–FR-042)

1. In "With discounts": detail row on, entries *Line note* and *Lead time*; grouping by *Brand* with
   subtotal *Line net*. Save.
2. Export QB-1 (channel B): header row repeated on every page; no line row split across pages; a line and
   its detail row stay together (R-8, SHOULD); groups in order of first appearance with correct
   subtotals; totals equal the quote screen's (SC-008); ≤ 5 s (SC-003).

## 5. Channels and languages (US5, US6)

1. Create a channel-B template "Brand B", set as default for channel B. QB-1 dialog: "Brand B"
   preselected; QA-1 dialog never lists it (FR-002, SC-005).
2. Export QB-1: language preselected *English*; switch to *Polski* → Polish labels, numbers `1 234,50 zł`
   style (FR-003, US5).

## 6. Permissions and visibility (FR-009, FR-011, FR-070)

1. As a sales representative with `rfqs:handle` only, assigned to QA-1's organisation: export works;
   *Manage PDF templates* link absent.
2. Request `GET /api/v1/admin/quote-requests/<QB-1 id>/pdf` for an organisation they are not assigned to
   → 404, as opening the quote.

## 7. Off-states (FR-060, FR-061, SC-006)

1. *Platform → Modules*: switch *Document templates* off → QA-1 has no *Export PDF*; the API answers 503
   `MODULE_DISABLED`. Switch on → QA-1's remembered template is back.
2. Switch *Quote requests* off → *Document templates* lists no *Quote request* type; switch on → its
   templates are unchanged.

## 8. Reserved placeholder (FR-045)

Add a *Text* block with `{{item.sku}}` → the PDF prints `{{item.sku}}` literally.

## 9. Send PDF to customer (US8, FR-090–FR-099, owner answer Q4)

1. QA-1 → *Send PDF to customer*: template and language preselected as for the export; the requester's
   e-mail is the only recipient. Add `buyer2@example.com` and a short message → *Send*. Both addresses
   receive one e-mail each (dev: the console mail driver logs them; with SMTP: the inbox) with
   `<QA-1 number>.pdf` attached and the message in the body (FR-093).
2. QA-1 → *History*: one *PDF sent* entry naming both addresses, the template and the language;
   *Audit log*: one `quote_request.send_document` entry without the PDF (FR-096).
3. Try `not-an-address` and a sixth recipient: the dialog refuses before sending (FR-092).
4. *E-mail templates* → *Quote request PDF*: edit the Polish subject; send again in Polish → the new
   subject is used (FR-094). Switch the e-mail off → *Send* answers that the e-mail is switched off;
   nothing new on the History (FR-097).
5. Switch *Document templates* off → neither *Export PDF* nor *Send PDF to customer* is shown (FR-099).
