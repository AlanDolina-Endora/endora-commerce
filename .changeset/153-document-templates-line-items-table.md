---
'@endora-commerce/mod-document-templates': minor
---

The **Line items table** (`document_templates.ItemsTable`, `specs/153-quote-request-pdf-template/`).

- A document type that declares a line collection is offered the table: columns chosen from the
  collection's field catalogue (1–16, each with header, width, alignment, format, empty text and a
  visibility rule *always* / *only if any line has a value* / *never*), an optional detail row,
  totals and grouping with subtotals. It is printed as a real table that repeats its header row on
  every page and never splits a line's row; its settings are validated when a template is saved
  (`DOCUMENT_TEMPLATE_INVALID` naming the setting).
- The admin editor gains the table's column, detail row, totals and grouping editors, with
  **Internal** badges on fields customers do not otherwise see, and a canvas drawn with the same
  formatting as the PDF.
- `GET /api/v1/admin/document-templates/types/:code` answers the type's `collections` (fields in
  the asked language, sample lines and totals).
- `documentRenderPort.listChoices` answers the templates a person may pick for one document of a
  per-document type.
- The command palette entry is also found by *quote pdf*, *offer template*, *szablon oferty* and
  *zapytanie ofertowe pdf*.
