# Quickstart: Editable PDF template for the storefront product comparison

A manual walk that exercises every user story end to end. Run it before merge (T062) and tick each
section in the merge-request description.

## 0. Prerequisites

```bash
source ~/.nvm/nvm.sh && nvm use 22
pnpm run build:packages
pnpm run dev:infra
pnpm run setup          # db:fresh THEN module:install --all
pnpm run dev
```

- An admin with a role holding `document_templates:read` and `document_templates:write`, and a
  second admin with `document_templates:read` only.
- Two sales channels (A, B), the storefront running against channel A, `sales_channels.storefront_url`
  set for A. A logo PNG uploaded to the assets library.
- A buyer account in an organisation with its own price list; three products with images and
  comparable attributes, one restricted to another organisation.

## 1. Baseline (no template)

1. Storefront (Polish): add three products to the comparison, open `/compare`, click `PDF`.
2. Expect: landscape PDF, Polish title and caption, Polish product names, Polish date and money
   format, the restricted product absent and a note saying one product is hidden — the **built-in
   layout** (FR-031, FR-022, FR-021).

## 2. Create and edit (US1)

1. Admin: ⌘K → type `pdf` → *Document templates* (FR-062). Also: *Comparisons* → *PDF template*
   opens the same screen with *Product comparison* expanded (FR-063).
2. *Product comparison* → *Built-in layout* → *Create from this*; name "Brand A", scope *All
   channels*; leave *Activate now* unchecked. Expect an inactive template (FR-003).
3. Editor: drag *Image* to the top and pick the logo; change the header title; in *Comparison table*
   switch on *SKU* and *Availability*, set *Products per table* to 2; set the footer to
   `{{channelName}} · {{date}}` and switch on page numbers (FR-011–FR-013, FR-017).
4. *Preview PDF*: the sample comparison in the new layout, nothing saved (FR-015). The canvas shows
   the same sample products as the preview (FR-016).
5. *Save*.

## 3. Activate and export (US1)

1. Before activating, export from the storefront: still the built-in layout (FR-003).
2. *Activate*. Export again: logo, new title, SKU/availability, two products per table, footer with
   page numbers, the buyer's own prices (FR-030, FR-020).
3. Toggle *Show only differences* and *Hide empty rows* on the storefront, export: same rows as the
   screen (FR-020).

## 4. Per-language layouts (US2)

1. Editor: switch language to `en-US` (absent) → *Start from pl-PL*; change the English title; *Save*.
2. Storefront in English → export: English layout and title, English names. Storefront in Polish:
   Polish layout (FR-032).

## 5. Channel override (US3)

1. Duplicate "Brand A" into scope *Channel B* as "Brand B", change the logo, *Activate*.
2. Export from channel B: Brand B. From channel A: Brand A — never Brand B (FR-031).

## 6. Safe management (US4)

1. Open "Brand A" in two browser tabs; save in the first, then in the second: *the template changed*
   dialog, nothing overwritten (FR-006).
2. Duplicate "Brand A" → activate the copy: the original becomes inactive in the same step (FR-005).
3. Delete the active copy: the confirmation names the fallback; channel-A exports now use the
   built-in layout, since "Brand A" was deactivated in step 2 (FR-007, FR-031).
4. Sign in as the read-only admin: list and editor open, preview works, no save/activate/delete
   controls (FR-060).
5. *Audit log*: one entry per create, rename, save, activate, deactivate, delete; none for the refused
   save (FR-061).

## 7. Switching modules off and on (FR-050–FR-052)

1. `/platform/modules` → switch **Document templates** off. Admin: sidebar entry, palette row and the
   *PDF template* link gone; `/api/v1/admin/document-templates/types` answers 503. Storefront export
   still works — today's fixed English layout.
2. Switch it on: every template, with its active flag, is back unchanged.
3. Switch **Compare Products** off: *Product comparison* disappears from *Document templates*.
   Switch it on: it returns with its templates.

## 8. Limits and failure

1. Paste a tree with more than 200 blocks (dev tools → PUT): 422 `DOCUMENT_TEMPLATE_INVALID` naming the
   limit (FR-008).
2. Delete the logo asset in the assets library; export: PDF without the logo, no error.
3. Time a 16-product export (SC-003) and record it in the MR.
