---
'@endora-commerce/mod-comparisons': minor
---

The comparison PDF can be designed in *Document templates* (`specs/152-compare-pdf-template/`).

- The module registers the `comparisons.comparison` document type with three blocks
  (`comparisons.ComparisonHeader`, `ComparisonTable`, `ComparisonShareLink`), every
  general-purpose block, and a built-in layout in English and Polish.
- `GET /api/v1/comparisons/me/pdf` produces the PDF through `documentRenderPort` while
  `document_templates` is present: the language is the first `Accept-Language` tag the channel
  offers, else the channel's default; the new optional query `hideEmptyRows=true|false` drops rows
  with no value, as the storefront switch does. The response adds `content-language`. With
  `document_templates` off the fixed layout is printed, unchanged. File name, owner-only access and
  `409 COMPARISON_EMPTY` are unchanged.
- **PDF layouts can change**: a buyer browsing in Polish now gets a Polish PDF with Polish product
  names, dates and prices.
- Admin: a *PDF template* button on the comparisons list (with `document_templates:read`), and the
  canvas renderers of the three blocks as `document` block contributions.
