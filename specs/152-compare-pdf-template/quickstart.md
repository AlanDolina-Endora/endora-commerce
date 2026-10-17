# Quickstart: Document templates — comparison PDF template, invoice templates moved

A manual walk exercising every user story. Run it before merge (T076) on a database **upgraded from
`origin/master`** that already holds invoice templates, and tick each section in the MR description.

## 0. Prerequisites

```bash
source ~/.nvm/nvm.sh && nvm use 22
# On origin/master first: build, run setup, then in the admin create invoice templates:
#  - edit the generic template (change a label), create "Global B" (becomes active),
#  - create "Channel B" for channel B, save a tree placing ksef.InvoiceSection if available.
# Issue two invoices (channel A and B) and one correction; download their PDFs and keep them.
git switch feat/152-compare-pdf-template
pnpm install && pnpm run build:packages
pnpm --filter backend run db:migrate      # or the instance's upgrade path — not db:fresh
pnpm run dev
```

- An admin whose role holds `invoices:write` (and nothing about document templates), an admin with
  `document_templates:read` only, and a platform administrator.
- Two sales channels (A, B), `sales_channels.storefront_url` set for A, a logo PNG in the assets
  library, a buyer in an organisation with its own price list, three products with images, one
  restricted to another organisation.

## 1. Invoice templates moved (US5) — do this first

1. Admin → *Invoices* → *Templates* tab, and the old URL `/invoices/templates/<old id>`: both land in
   *Document templates* (FR-088).
2. *Document templates → Invoice*: the edited generic template, "Global B" (default for all channels)
   and "Channel B" (default for channel B), names and layouts as before (FR-081).
3. Download the three invoice PDFs again: each carries seller/buyer data, lines, VAT summary, totals,
   amount in words and its scope's layout (FR-083; the layout may differ from before — owner answer P1).
   Regenerate one: no error.
4. Resend the channel-B invoice by e-mail with the attachment mode on (dev mail catcher): the attached
   PDF now matches the download — the "Channel B" layout, not the built-in one it used to carry
   (FR-093, owner's answer to N1).
5. Open an invoice template: palette shows only the ten invoice blocks (+ KSeF if installed), no
   general-purpose block, no language switcher (FR-080, FR-085).
6. Sign in as the `invoices:write` admin: invoice templates are editable without any manual grant
   (FR-089). Audit log: one import entry by the system (FR-061).
7. Delete "Channel B", restart the backend: it does not come back (FR-082).
8. ⌘K → "szablon faktury" finds *Document templates* (FR-090).

## 2. Comparison baseline (no template)

Storefront in Polish: three products in the comparison, `/compare`, `PDF`. Expect the built-in layout
in Polish: landscape, Polish title, names, date and money, restricted product absent, "1 hidden" note
(FR-031, FR-022, FR-021).

## 3. Create and edit (US1)

1. ⌘K → `pdf` → *Document templates*; also *Comparisons* → *PDF template* opens the comparison card.
2. *Product comparison → Built-in layout → Create from this*, "Brand A", all channels, *Set as
   default* unticked (FR-003).
3. Palette: comparison blocks + general-purpose blocks, no invoice block (FR-011).
4. Add the logo *Image*, change the header title, table: SKU and availability on, 2 products per
   table; footer `{{channelName}} · {{date}}`, page numbers on.
5. *Preview PDF*: sample comparison in the new layout; canvas shows the same sample (FR-015, FR-016).
   *Save*.

## 4. Set as default and export (US1)

1. Export before: built-in. *Set as default*; export again: logo, title, SKU/availability, two per table,
   footer with page numbers, the buyer's prices (FR-030, FR-020).
2. Toggle *differences only* and *hide empty rows*, export: same rows as the screen.

## 5. Languages (US2)

Editor → language `en-US` → *Start from pl-PL*; change the English title; *Save*. Storefront in English:
English layout; in Polish: Polish layout (FR-032).

## 6. Channel override (US3)

Duplicate "Brand A" into channel B as "Brand B" with another logo; *Set as default*. Channel B export →
Brand B; channel A → Brand A, never Brand B.

## 7. Safe management (US4)

1. Two tabs, save in both: second gets *template changed*, nothing overwritten (FR-006).
2. Duplicate "Brand A", set the copy as default: the original is no longer default (FR-005).
3. Delete the default copy: confirmation names the fallback; channel A now gets the built-in layout
   (FR-007, FR-031).
4. Read-only admin: preview works, no save/default/delete controls (FR-060).
5. Audit log: one entry per change; none for the refused save (FR-061).

## 8. Switching modules (FR-050–FR-052, N2)

1. `/platform/modules` → switch **Document templates** off while **Invoices** is on: refused, naming
   Invoices.
2. Switch **Invoices** off, then **Document templates** off: sidebar entry, palette row, comparison
   button gone; the API answers 503; the comparison PDF still works (fixed English layout).
3. Switch both on: every template and default flag back unchanged.
4. Switch **Compare Products** off: its card disappears; on: back with its templates.

## 9. Limits and failures

1. A tree of > 200 blocks (dev tools → PUT): 422 naming the limit (FR-008).
2. Paste a `comparisons.ComparisonTable` node into an invoice template and save: 422 naming the block
   (FR-019).
3. Delete the logo asset; export: no logo, no error.

## 10. Timing

Time a 16-product comparison export and an invoice download; record both against SC-003 in the MR.
