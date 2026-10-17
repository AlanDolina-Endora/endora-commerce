---
'@endora-commerce/contracts': minor
---

Line collections, the Line items table and the quote request PDF (`specs/153-quote-request-pdf-template/`).

**New** (`document-templates.ts`, `document-values.ts`, re-exported from the package root):

- Typed document values and the functions shared by the PDF renderer and the editor canvas:
  `DocumentValue`, `documentValueSchema`, `documentValueHasValue`, `formatDocumentValue`,
  `evaluateDocumentCondition` (`DocumentCondition`: `always`, `never`, `has_value`,
  `any_has_value`, over a scope of items, one item or the totals), `sumDocumentValues`,
  `resolveDocumentAlign`, `documentFieldPathRe`, `isReservedFieldPath`, `DOCUMENT_POSITION_FIELD`.
- `DocumentCollectionDeclaration`, `DocumentFieldDefinition`, `DocumentItem`; the optional
  `collections` member of `DocumentTypeRegistration`; `COLLECTION_BLOCK_NAMES`,
  `ITEMS_TABLE_BLOCK_NAME`, `ITEMS_TABLE_LIMITS` and `itemsTablePropsSchema` (the stored settings of
  `document_templates.ItemsTable`).
- `documentTypeDetailSchema` gains `collections` (defaults to `[]`).
- **`DocumentRenderPort` gains a required `listChoices({ documentType, salesChannelId })`**
  answering `DocumentTemplateChoices` (`documentTemplateChoicesSchema`). An implementation of the
  port outside `document_templates` must add it; callers are unaffected.
- Quote requests: `QUOTE_REQUEST_DOCUMENT_TYPE`, `QUOTE_REQUEST_PDF_LIMITS`,
  `quoteRequestDocumentDataSchema`, `quoteRequestDocumentChoicesSchema`,
  `setQuoteRequestDocumentTemplateSchema`, `quoteRequestPdfQuerySchema`,
  `quoteRequestPdfSendRequestSchema`, `quoteRequestPdfSendResultSchema`; `quoteRequestSchema` gains
  the optional admin-only `documentTemplateId`; `rfqEventTypeSchema` gains `'pdf-sent'` and the
  history entry kind `'pdf_sent'` with an optional `delivery`.
- Error codes `QUOTE_REQUEST_PDF_TOO_LARGE`, `QUOTE_REQUEST_PDF_EMAIL_UNAVAILABLE`,
  `QUOTE_REQUEST_PDF_SEND_FAILED`.
