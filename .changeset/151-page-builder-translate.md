---
'@endora-commerce/contracts': minor
'@endora-commerce/mod-cms': minor
'@endora-commerce/mod-catalog': minor
'@endora-commerce/mod-blog': minor
'@endora-commerce/page-builder-admin': minor
---

Page Builder translation. A **Translate** action in the Page Builder toolbar translates the canvas of the language tab being edited — or only the selected component or text — with the LLM configured in Settings → Page Builder (`cms.page_builder.translation.enabled`, `…llm_credentials`, `…max_source_characters`; off by default), behind the new permission `cms.translate`, through `GET /api/v1/admin/cms/page-builder/translation` and `POST /api/v1/admin/cms/page-builder/translate`. The result is an unsaved change with *Restore previous content*; every request that sent text is audited as `cms.page_builder.translate`.

For block authors: `BlockDefinition` gains an optional `translatable: [{ path, format? }]` (`format` `plain` | `tiptap` | `html`, paths like `items[].title`) naming the props that are prose; it is served on the Page Builder descriptor. A block without it is never sent to a model. Every CMS-context block of `cms` and `catalog` declares it. `PageBuilderHeaderActions` gains an optional `extraActions` slot, and the blog post and category editors pass the editor what the action needs.
