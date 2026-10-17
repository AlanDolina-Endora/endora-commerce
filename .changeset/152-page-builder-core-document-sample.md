---
'@endora-commerce/page-builder-core': minor
---

Document-template editor support (`specs/152-compare-pdf-template/`).

- `@endora-commerce/page-builder-core/contributions`: `DocumentSampleProvider` and
  `useDocumentSample<T>()` — the sample document an editor hands its block renderers (`null`
  outside a provider) — and the `DocumentBlockEditorConfig` type, the default export of an admin
  block contribution for the `document` context.
- `PageBuilderContext` / `PAGE_BUILDER_CONTEXTS` gain `'document'`; `contextAdmits` admits nothing
  into or out of it.
- `@endora-commerce/page-builder-core/editor` re-exports `Puck`, so an editor in a module package
  mounts the same `@puckeditor/core` copy the outline and overlay helpers read their context from.
