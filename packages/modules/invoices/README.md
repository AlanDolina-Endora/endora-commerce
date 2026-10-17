# Invoices module (feature 047)

Generates, numbers, renders, corrects, and emails invoices for orders.

## What works today

- **Issuance** — manual (`POST /api/v1/admin/orders/:orderId/invoices`) and
  automatic when an order reaches the configured trigger status
  (`invoices.auto_issue.trigger_status`, per channel). Idempotent per
  `(order, kind)`; blocked with 422 when seller settings are missing.
- **Numbering** — gap-free, row-locked counter per `(sales_channel, kind, year)`
  with a configurable pattern (`invoices.numbering.<kind>.pattern`) supporting
  `{seq}`, `{seq:N}`, `{YYYY}`, `{YY}`, `{MM}`. Resets yearly.
- **PDF** — pdfmake renderer with a built-in generic layout modelled on the
  reference invoice (seller w/ NIP + bank, buyer, line table, per-rate VAT
  summary, totals, amount-in-words, KSeF area). Rendered on demand. KSeF is
  **layout-ready only** — no live integration.
- **Corrections** — the returns `CorrectiveInvoicePort` draws correction-sequence
  numbers (when an original invoice exists), references the original, snapshots
  corrected lines, and caps the credited total at the original gross.
- **Email** — `invoice_issued` transactional-email definition (admin-editable via
  the `transactional_emails` module); sent on issue (per channel) or on demand,
  with the PDF attached (`attachment` mode) or a storefront download link
  (`link` mode). Idempotent, best-effort.
- **Customer access** — `GET /api/v1/orders/:id/invoices` and `.../:invoiceId/pdf`
  (ownership-guarded); surfaced on the storefront order page.
- **PDF layouts** — designed in *Document templates* (`document_templates`):
  this module registers the `invoices.invoice` document type — its ten blocks
  over the pdfmake section builders, the blocks other modules contribute through
  `invoicePdfBlockRegistry`, and the generic layout as its built-in layout — and
  produces every invoice PDF (downloads, regenerate, e-mail attachment) through
  `documentRenderPort`. The former `/api/v1/admin/invoice-templates` API and the
  `invoice_templates` table are gone (`specs/152-compare-pdf-template/`).
- **Settings** — seller VAT/NIP + company data (JSON), numbering patterns,
  auto-issue trigger, email toggle + delivery mode, storefront base URL — all
  global + per-channel.

## Settings

`invoices.seller.tax_id`, `invoices.seller.company_data`,
`invoices.auto_issue.trigger_status`, `invoices.email.send_on_issue`,
`invoices.email.delivery_mode`, `invoices.numbering.{invoice,proforma,correction}.pattern`,
`invoices.storefront_base_url`.

## Permissions

`invoices:read`, `invoices:write`.

## Deferred / follow-ups

- The invoice Puck config lives in the **admin module** (not
  `packages/cms-components`) — invoice authoring is admin-only and the real
  layout is server-side pdfmake; this avoids coupling invoice components into the
  shared CMS/email component package.
- Audit-log entries are written on issue (`invoice.issued`) and correction
  (`invoice.corrected`).
- PDF is rendered on demand; caching into `assets_library` (`pdf_asset_id`) is a
  future optimization.
- A dedicated admin invoice detail page (management actions live on the list).
