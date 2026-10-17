---
'@endora-commerce/mod-document-templates': minor
---

New module `document_templates` (`specs/152-compare-pdf-template/`): operator-designed Page
Builder layouts for the PDF documents the platform produces.

- Table `document_templates` (one migration): templates per document type and scope (all sales
  channels or one), at most one default per scope, one layout per language, optimistic versions.
- `documentTypeRegistry` — a contribution registry a module pushes its document type into from a
  contribution-only boot hook; a type and each contributed block are answered only while their
  module is present.
- `documentRenderPort` — the gated Page Builder → pdfmake engine:
  `render({ documentType, salesChannelId, language, data, templateId? })` resolves the channel
  default, the global default, then the built-in layout; `templateId` is honoured only for
  `selection: 'per_document'` types. Images come from the assets library only; pdfmake's URL
  access is denied.
- Six general-purpose blocks (`document_templates.Heading`, `Text`, `Image`, `Spacer`, `Divider`,
  `PageBreak`), offered to types that opt in.
- Admin API `/api/v1/admin/document-templates` (12 routes; `document_templates:read` /
  `document_templates:write`), every write a Command with one audit row.
- Admin: *Document templates* list and editor (palette = the template's document type), sidebar
  entry and the `open-document-templates` palette action.
- Activation `document_templates.enabled` (default on). It cannot be switched off while
  `invoices` is on.
