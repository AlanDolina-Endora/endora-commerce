---
'@endora-commerce/contracts': minor
---

Document templates — the shapes of `specs/152-compare-pdf-template/`.

**New in `@endora-commerce/contracts`** (`document-templates.ts`):

- The template content envelope and its limits: `documentTemplateContentSchema`
  (`{ schemaVersion: 1, languages: { <lang>: <tree> } }`), `documentTemplateTreeSchema`,
  `documentRootPropsSchema`, `DOCUMENT_TEMPLATE_LIMITS`, `GENERIC_DOCUMENT_PAGE_DEFAULTS`,
  `documentContentByteSize`, `CORE_BLOCK_NAMES`, `documentTypeCodeSchema`, `mergeFieldKeyRe`.
- The host seams: `DocumentTypeRegistration<TData, TPrepared>` (blocks, `coreBlocks`, `selection`,
  `languages`, `variables`/`resolveVariables`, `defaultContent`, `renderBuiltIn`, `pageDefaults`,
  `suggestOrientation`, `prepareRender`, `sampleData`), `DocumentBlockRenderer`,
  `DocumentTypeRegistryPort` (container name `documentTypeRegistry`), `DocumentRenderPort`
  (`documentRenderPort`) with `DocumentRenderInput` / `DocumentRenderResult`.
- The admin API DTOs of `/api/v1/admin/document-templates`, and six error codes in `ERROR_CODES`:
  `DOCUMENT_TEMPLATE_NOT_FOUND`, `DOCUMENT_TYPE_NOT_AVAILABLE`, `DOCUMENT_TEMPLATE_INVALID`,
  `DOCUMENT_TEMPLATE_IS_DEFAULT`, `DOCUMENT_TEMPLATE_NOT_SELECTABLE`, `DOCUMENT_RENDER_FAILED`.
- `comparisonDocumentDataSchema` / `ComparisonDocumentData` and `invoiceDocumentDataSchema` /
  `InvoiceDocumentData` — what `comparisons` and `invoices` hand the render port.

**Widened enums** (additive): `pageBuilderContextSchema` gains `'document'`, and
`AdminBlockContributionSchema.context` gains `'document'` — a module contributes the canvas
renderer of its document blocks with `context: 'document'`.
