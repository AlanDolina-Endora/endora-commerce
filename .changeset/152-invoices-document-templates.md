---
'@endora-commerce/mod-invoices': minor
---

**Breaking:** invoice templates moved into *Document templates* (`specs/152-compare-pdf-template/`).
This is a breaking change released as `minor` because the package is in `0.x` (D-225).

- **Withdrawn API.** `GET/POST /api/v1/admin/invoice-templates`, `GET /api/v1/admin/invoice-templates/:id`,
  `PUT /api/v1/admin/invoice-templates/:id/content/:language`,
  `GET /api/v1/admin/invoice-templates/page-builder/config` and the two
  `/api/v1/admin/invoice-templates/:id/preview` routes are removed. Use
  `/api/v1/admin/document-templates` with `documentType: 'invoices.invoice'`:
  `POST /api/v1/admin/document-templates` (create), `PUT …/:id/content/pl-PL` (save, with
  `{ tree, expectedVersion }`), `POST …/:id/set-default`, `POST …/preview`,
  `GET …/types/invoices.invoice/builder-config`.
- **No data is carried over.** The `invoice_templates` table is dropped by a migration; the
  invoice document type's built-in layout (the former generic template) is used until an operator
  sets an invoice template as default.
- **E-mailed invoice PDFs now follow the configured template**: the attachment of the invoice
  e-mail is rendered exactly like the download. **PDF layouts can change** with this release.
- The module now depends on `document_templates` (which cannot be switched off while invoicing is
  on) and `admin_roles`. A one-time, audited boot step gives every role holding `invoices:read`
  the `document_templates:read` permission and every role holding `invoices:write` also
  `document_templates:write`; it records itself in the hidden setting
  `invoices.document_templates_grant_done` and never runs again.
- Removed: the `invoicePdfRenderer` container registration (invoice PDFs are produced by
  `document_templates`' `documentRenderPort`), the `invoice-templates` palette action, and the
  invoice template admin pages; `/invoices/templates` and `/invoices/templates/:id` redirect to
  *Document templates*. `invoicePdfBlockRegistry` and its contributor contract are unchanged.
- `invoices:write` is relabelled *Issue/correct invoices and configure invoicing*.
