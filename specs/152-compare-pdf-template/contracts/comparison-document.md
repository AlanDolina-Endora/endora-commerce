# Contract: the *Product comparison* document type and the storefront export

**Owner**: `comparisons`. Implements `contracts/document-type-registry.md` for one type.

## 1. Registration

| Field | Value |
| --- | --- |
| `code` | `comparisons.comparison` |
| `moduleId` | `comparisons` |
| `labelKey` / `descriptionKey` | `documentTypes.comparison.label` / `.description` (comparisons' bundles) |
| `blocks()` | `comparisons.ComparisonHeader`, `comparisons.ComparisonTable`, `comparisons.ComparisonShareLink` (all `moduleId: 'comparisons'`) |
| `coreBlocks` | `'all'` — the palette is these three plus the six core blocks, nothing else (owner Q1) |
| `selection` | `'default_only'` — the buyer never chooses; a `templateId` is never passed (owner Q2) |
| `languages` | absent — every active content language |
| `pageDefaults` | generic defaults (`data-model.md` §3.1) |
| `renderBuiltIn` / `prepareRender` / `legacyImport` | absent |
| `variables` | `productCount`, `channelName`, `customerName`, `organizationName`, `shareUrl` (labels `documentTypes.comparison.variables.<key>`) |
| `suggestOrientation` | `pickOrientation(view.products.length)` — landscape from 3 products (unchanged rule) |
| `defaultContent()` | `en-US` and `pl-PL` trees reproducing today's layout: `ComparisonHeader` (title, mode caption, priced-for note) + `ComparisonTable` (images, name, price) — the literals live in one per-language map in `src/backend/document/built-in-layout.ts` |
| `sampleData(language)` | three fictitious products (one unavailable, one with a missing value), mixed `common`/`different` rows, `hiddenProductCount: 1`, `pricedFor: 'organization'`, a placeholder share URL; names in `en-US` and `pl-PL` |

Pushed from a **contribution-only** `ctx.onBoot` in `packages/modules/comparisons/src/backend/index.ts`
(no presence probe), `lazyPort<DocumentTypeRegistryPort>(ctx, 'documentTypeRegistry').register(…)`.

## 2. Data — `ComparisonDocumentData` (`packages/contracts/src/comparisons.ts`)

```ts
export const comparisonDocumentDataSchema = z.object({
  view: comparisonOwnerViewSchema,          // exactly what GET /me returns to this viewer
  channelName: z.string(),
  customerName: z.string().nullable(),      // signed-in account's display name; null for anonymous
  organizationName: z.string().nullable(),  // the viewer's organisation; null for anonymous
  shareUrl: z.string().url().nullable(),    // `${sales_channels.storefront_url}/compare/share/${token}`; null if unset
  hideEmptyRows: z.boolean(),               // the storefront switch (FR-020)
  generatedAt: z.string().datetime(),
});
```

Built only in the export route, under the buyer's request context, from data the route already reads
(`buildOwnerView`), plus `customerAccountReadPort` / `organizationDetailsPort` (already in
`comparisons`' dependencies) and `settingsReadPort` for `sales_channels.storefront_url` at the
resolved channel. Nothing else enters a render (FR-033).

## 3. Block semantics (pdfmake output; props in `data-model.md` §4.2)

- **Rows** (`ComparisonTable`): `filterRowsByMode(view.comparableAttributes, view.displayMode)`, then,
  when `hideEmptyRows`, drop rows whose every value is `null` — the screen's rule.
- **Columns**: `view.products` in order, chunked by `productsPerTable`; each chunk is one table with
  the attribute column repeated; a chunk never splits a product across tables.
- **Names**: `pick(name, language)` = exact → same primary subtag → `en-US` → `en` → first (replaces
  `localised()`'s English-only pick; the fixed renderer keeps its own behaviour — R-11).
- **Price**: `Intl.NumberFormat(language, { style: 'currency', currency })`; `null` → `emptyValue`.
- **Availability**: `available` → `availableText` / `unavailableText`.
- **Images**: `AssetByteFetcher` per render (fallback bytes on failure, never throws), as today.
- **Hidden note**: printed when `showHiddenNote && view.hiddenProductCount > 0`, with `{{hiddenCount}}`.
- **Header**: date = `generatedAt` in `Intl.DateTimeFormat(language, { dateStyle: 'long' })`; mode
  caption = the matching `modeLabel*`; priced-for = `pricedFor === 'organization'` ? org text : channel text.
- **Share link**: omitted entirely when `shareUrl` is null; QR via pdfmake's native `qr` node.

## 4. `GET /api/v1/comparisons/me/pdf` — changed behaviour

Request (additions only): header `Accept-Language` (the storefront sends its locale); query
`hideEmptyRows=true|false` (optional, default `false`, Zod-validated).

```text
owner  = readOwner(request)                         -- unchanged; 404 COMPARISON_NOT_FOUND
view   = buildOwnerView(…)                          -- unchanged
if view.products empty → 409 COMPARISON_EMPTY       -- unchanged
language = first Accept-Language tag that names an active content language
           ?? channel.defaultLanguage ?? 'en-US'
if effectiveState.isPresent('document_templates'):
    data   = buildComparisonDocumentData(view, …)
    result = documentRenderPort.render({ documentType: 'comparisons.comparison',
                                         salesChannelId: channel.id, language, data })
    bytes  = result.bytes;  contentLanguage = result.language
else:
    bytes  = fixedRenderer.render(view)             -- today's renderer, unchanged
on render error (not ModuleDisabledError) → 503 PDF_GENERATION_FAILED   -- unchanged code
```

Response: unchanged (`application/pdf`, `attachment; filename="comparison-<8>.pdf"`, `no-store`),
plus `content-language` when the template path ran. The error mapping wraps only the render call and
re-throws `ModuleDisabledError` first (`check:port-catches`).

## 5. Manifest additions (`packages/modules/comparisons/src/manifest.ts`)

- `blocks`: the three names, `category: 'comparison'`, `contexts: ['document']`, `fields` per
  `data-model.md` §4.2 (labels as plain English strings — the admin contribution overrides them with
  translated, richer fields), `defaultProps` = the English defaults, weights 10/20/30.
- `blockCategories`: `{ key: 'comparison', titleKey: 'blocks.category.comparison', contexts:
  ['document'], weight: 20 }`.
- `nonBindingDependencies`: `documentTypeRegistry` (`contributes-to`) and `documentRenderPort`
  (`degrades-without`, `whenAbsent: 'comparison PDFs are produced with the fixed built-in layout and
  cannot be customised'`).
- `actions`: unchanged (the palette entry for templates belongs to `document_templates`).

## 6. Admin contributions (`packages/modules/comparisons/src/admin/index.ts`)

`blocks: [{ name, context: 'document', component: () => import('./document-blocks/<Name>.js') }]`
for the three blocks; each default-exports a `DocumentBlockEditorConfig` (render over the served
sample via `useDocumentSample<ComparisonDocumentData>()`, plus field overrides: colour pickers,
number ranges, translated labels). `ComparisonsListPage` adds the *PDF template* link (FR-063).

## 7. Storefront (`storefront/`)

- `lib/api/comparisons.ts`: `exportComparisonPdf({ locale, hideEmptyRows })` — sets
  `Accept-Language: locale`, appends `?hideEmptyRows=`.
- `components/ComparisonTable.tsx`: accepts `locale`; `ExportPdfButton` passes `locale` and the
  current *hide empty* state; its two strings come from `lib/i18n/messages.ts` (`compare.pdf.busy`,
  `compare.pdf.failed`, en + pl).
- `app/compare/page.tsx`: passes `locale` from `getServerContext()`.

## 8. Tests owed

Unit (co-located): each block's document definition for props × data edge cases (no images, 16
products → 4 chunks, hidden note, null price, unavailable, share URL null → nothing, Polish names and
formats); built-in layout validates and renders for both languages; `buildComparisonDocumentData`.
Contract: `/me/pdf` with templates on / off / channel default template / non-default templates ignored /
Polish header / hideEmptyRows;
cross-organisation (A never gets B's prices or restricted products through the template path);
cross-channel (channel-B template never used for A). Storefront unit: header + query sent.
