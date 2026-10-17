# Data Model: Page Builder "Translate" action

**Feature**: `specs/151-page-builder-translate/` | **Date**: 2026-10-17

**No table, column or migration is added** (research R18). What this feature introduces is two
setting rows, one manifest declaration, two wire shapes, one internal model and one audit entry
shape.

## 1. Settings (owned by `cms`, group `cms_page_builder`)

| Code | Value type | Default | Scope | Meaning |
| --- | --- | --- | --- | --- |
| `cms.page_builder.translation.enabled` | `boolean` | `false` | platform-wide | The function's on/off switch (FR-001). **Not** the module's activation control — that stays `cms.enabled`. |
| `cms.page_builder.translation.llm_credentials` | `credential_ref`, `configurationType: 'llm'` | `''` | platform-wide | Code of one `llm` credential configuration; the only source of provider, model, API key (FR-002). |

Both declared in `packages/modules/cms/src/manifest.ts` and exported in
`CMS_PAGE_BUILDER_SETTING_CODES` as `TRANSLATION_ENABLED` and `TRANSLATION_LLM_CREDENTIALS`.
Rows are created by the manifest reconciler at boot. Names and descriptions are English in the
manifest; the Polish text ships in `cms`' bundle under the settings-label keys the Settings screen
resolves from the owner module's bundle (introduced by `specs/144-seo-search-engine-robots/`).

### Capability state (derived per request, never stored)

```text
                 enabled = false ───────────────────────────────► disabled
enabled = true ─┬─ credentials module absent ─────────────────────► unavailable
                ├─ reference '' / unresolvable / status ≠ ok ────► not_configured
                ├─ provider ∉ {anthropic, google, openai} ───────► not_configured   (see owner decision 4)
                ├─ model or apiKey blank ────────────────────────► not_configured
                └─ otherwise ────────────────────────────────────► ready (provider, model)
```

Evaluation order is exactly the order above; `disabled` wins over everything so that a switched-off
function never touches `credentials`.

## 2. Translatable text declaration (owned by each block's module)

Added to `BlockDefinitionSchema` in `packages/contracts/src/cms.ts` and carried, optional and
additive, on each component of `cmsPageBuilderDescriptorSchema`:

```ts
translatable?: Array<{
  path: string;                    // translatablePathRe — research R5
  format?: 'plain' | 'tiptap';     // absent = 'plain'
}>;
```

Rules:

- `path` matches `^[a-zA-Z][a-zA-Z0-9_]*(\[\])?(\.[a-zA-Z][a-zA-Z0-9_]*(\[\])?)*$`.
- Paths in one declaration are unique.
- An empty array is a declaration ("this block carries no prose"). An absent property is "unknown":
  the block is reported as not translatable.
- Every first-party block whose `contexts` include `cms` declares the property (unit test over the
  composed manifests, task T021).

### Planned inventory for `cms` (confirmed by T021's fixture test against `component-types.ts`)

| Block | `translatable` |
| --- | --- |
| `cms.Row`, `cms.Column`, `cms.Slide`, `cms.Spacer`, `cms.ContentSlider`, `cms.InsertBlock`, `cms.InsertTemplate`, `cms.Video`†, `cms.Map`, `cms.Icons`, `cms.RawHtml`, `cms.RawJs` | `[]` (layout, embeds, code) |
| `cms.Heading` | `text` |
| `cms.Text` | `text`, `tiptapContent` (tiptap) |
| `cms.RichContent` | `content` (tiptap) |
| `cms.Button` | `label` |
| `cms.Image` | `alt` |
| `cms.Social` | `items[].label` |
| `cms.FeatureList` | `items[].title`, `items[].description` |
| `cms.Hero` | `heading`, `subtitle`, `buttonLabel` |
| `cms.LogoStrip` | `items[].alt` |
| `cms.Testimonial` | `quote`, `author`, `role` |
| `cms.Stats` | `items[].value`‡, `items[].label` |
| `cms.AnnouncementBar` | `text` |
| `cms.SimpleTable` | `headers[].label`, `rows[]…` — exact shape fixed by T021/T022 (`headers`/`rows` are `string | object[]`) |
| `cms.ImageSlider` | `items[].title` |
| `cms.Tabs` | `items[].label`, `items[].content` |
| `cms.Accordion` | `items[].title`, `items[].content` |
| `cms.NewsletterSignup` | `heading`, `description`, plus its button/placeholder labels as found by T021/T022 |

† `cms.Video.title` is an accessibility title of the embed; included if T022 shows it is rendered as
visible or `title=` text, otherwise `[]`.
‡ `Stats.value` is free text ("24/7", "10k+"); translated so units and words follow the language.

Never declared on any block: `editorName` (editor-only), `href`, `url`, `*Href`, `*Slug`, `src`,
`*AssetId`, `code`, colours, icon names, `html` derived from TipTap.

`catalog` declares its CMS-context blocks (`catalog.ProductCard`, `ProductGrid`, `ProductSlider`,
`CategoryList`, `CategoryGrid`) — `[]` or their heading/label props, inventoried in T022.

## 3. Wire shapes (`packages/contracts/src/cms.ts`)

Full schemas in [contracts/page-builder-translation-api.md](./contracts/page-builder-translation-api.md).

### `CmsPageBuilderTranslationCapability`

| Field | Type | Notes |
| --- | --- | --- |
| `status` | `'ready' \| 'disabled' \| 'not_configured' \| 'unavailable'` | §1 |
| `provider` | `'anthropic' \| 'google' \| 'openai'` | only when `ready` |
| `model` | `string` | only when `ready`; non-secret, shown in the confirmation (FR-013) |
| `maxCharacters` | `number` | always; `MAX_SOURCE_CHARACTERS` |

### `CmsPageBuilderTranslateRequest`

| Field | Type | Validation |
| --- | --- | --- |
| `targetLanguage` | `string` | `min(2) max(35)`, BCP-47-like; the active tab (FR-011) |
| `sourceLanguage` | `string \| null` | `null` = detect (FR-012); else `min(2) max(35)`, ≠ `targetLanguage` |
| `context` | `'cms'` | only the CMS palette context is accepted in this version |
| `data` | Puck `Data` | `{ root: { props?: object }, content: object[], zones?: Record<string, object[]> }`, passthrough |
| `resource` | `{ type: string; id: string \| null } \| undefined` | `type` matches `^[a-z][a-z0-9_]*$`, max 64; `id` uuid; audit only (R13) |

Body size limit on the route: 2 MiB (a 40 000-character canvas with styling is far below it).

### `CmsPageBuilderTranslateResponse`

| Field | Type | Notes |
| --- | --- | --- |
| `data` | Puck `Data` | the input with translated string leaves replaced; everything else byte-equal after `JSON` round-trip |
| `report.translatedSegments` | `number` | |
| `report.untranslatedSegments` | `number` | segments whose answer failed validation (FR-020) |
| `report.untranslatableBlocks` | `Array<{ name: string; count: number }>` | blocks with no declaration (FR-025) |
| `report.characters` | `number` | source characters sent |
| `report.provider`, `report.model` | `string` | what was used |
| `report.sourceLanguage` | `string \| null` | echo of the request |

## 4. Internal model (`packages/modules/cms/src/backend/services/translation/`)

Not on the wire; listed because the tests are written against it.

```text
Segment       { id: 's<n>', source: string, kind: 'plain' | 'inline', tags?: TagTable, placeholders: string[] }
Location      { segmentId, nodePath: (string|number)[], propPath: (string|number)[], tiptapNodePath?: number[] }
Extraction    { segments: Segment[] (deduplicated), locations: Location[], untranslatableBlocks: Map<name, count>, characters: number }
Chunk         { segments: Segment[] }                                  // ≤ MAX_CHUNK_CHARACTERS, ≤ MAX_CHUNK_SEGMENTS
ChunkResult   { translations: Map<segmentId, string>, rejected: Set<segmentId> }
```

Flow: `extract(data, declarations)` → `chunk(segments)` → per chunk `translateChunk` (LLM, forced
tool, Zod parse, per-segment validation of tags and placeholders) → `inject(data, locations,
translations)` returns a deep copy. `extract` and `inject` are pure and are the round-trip property
under test: `inject(data, extract(data).locations, identity) ≡ data`.

## 5. Audit entry (existing audit table, written by the Command Bus)

| Field | Value |
| --- | --- |
| `action` | `cms.page_builder.translate` |
| `objectType` | `resource.type` or `page_builder_canvas` |
| `objectId` | `resource.id` or `null` |
| `actorAdminUserId` | from TenantContext (never the body) |
| `stateBefore` | `null` |
| `stateAfter` | `{ targetLanguage, sourceLanguage, provider, model, segments, characters, translatedSegments, untranslatedSegments, outcome: 'completed' \| 'partial' \| 'failed', failure?: token }` |

No text, no prompt, no credential code, no key.

## 6. Permission

| Code | Label (en) | Owner |
| --- | --- | --- |
| `cms.translate` | Translate Page Builder content with AI | `cms` |

Polish label: "Tłumaczenie treści Page Buildera przez AI" (`adminRoles.permission.cms.translate` in
`packages/modules/cms/i18n/pl.json`).
