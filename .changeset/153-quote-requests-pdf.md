---
'@endora-commerce/mod-quote-requests': minor
---

Quote request PDF: export and send to the customer (`specs/153-quote-request-pdf-template/`).

- The module registers the *Quote request* document type (`quote_requests.quote_request`,
  per-document selection) with four blocks (`QuoteHeader`, `QuoteParties`, `QuoteNotes`,
  `QuoteDetails`), every general-purpose block, the line collection `lines` (list price, discounts,
  net, VAT, gross, product attributes …) and a built-in layout in English and Polish.
- The quote request screen offers **Export PDF** and **Send PDF to customer** in every state while
  document templates are switched on. The template chosen for a quote is remembered on it and
  audited (`quote_request.set_document_template`); the language is chosen in the dialog.
- **Send PDF to customer** e-mails the PDF to up to five addresses (the requester preselected)
  through the new transactional e-mail `quote_request_pdf`, editable and switchable like every
  other, with an optional personal message; each send is audited
  (`quote_request.send_document`) and shown on the quote's History.
- New admin routes under `/api/v1/admin/quote-requests/:id/`: `document-templates`,
  `document-template`, `pdf`, `pdf/send`; new error codes `QUOTE_REQUEST_PDF_TOO_LARGE`,
  `QUOTE_REQUEST_PDF_EMAIL_UNAVAILABLE`, `QUOTE_REQUEST_PDF_SEND_FAILED`.
- Schema: `quote_requests.document_template_id` (nullable, no foreign key) and the `pdf-sent`
  event type. The module now depends on `transactional_emails`.
