# Data Model: Document templates — comparison PDF template, invoice templates moved

**Feature**: `specs/152-compare-pdf-template/` | **Date**: 2026-10-17 (revised after the owner's answers)

Two new tables, both owned by the new module `document_templates`, created by one migration scaffolded
with `pnpm --filter backend run migration:new -- --module document_templates --name init` (no number
is chosen by hand — `specs/conventions/module-migrations.md`). No column is added to any existing
table. `invoice_templates` (owned by `invoices`) is **not altered and not dropped**; after the import it
is read-only (research R-24). No migration writes another module's table.

## 1. `document_templates` (entity `DocumentTemplate`, `@GlobalEntity()`)

Platform-global configuration (Principle XI: *platform-global*).

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `randomUUID()` (app) | PK. Imported invoice templates keep their legacy id |
| `document_type` | `varchar(120)` | no | — | `<moduleId>.<snake_name>` — `comparisons.comparison`, `invoices.invoice`. `check (document_type ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$')`. Opaque: only matched against registrations |
| `name` | `varchar(200)` | no | — | Trimmed, 1–200 chars |
| `sales_channel_id` | `uuid` | yes | `null` | `null` = all channels. FK → `sales_channels(id)` **on delete cascade** (kernel-owned table, no manifest edge). **Immutable** |
| `content` | `jsonb` | no | — | `{ "schemaVersion": 1, "languages": { "<lang>": <tree> } }` — §3 |
| `is_default` | `boolean` | no | `false` | At most one `true` per `(document_type, scope)` |
| `version` | `integer` | no | `1` | Optimistic concurrency; +1 on every Command changing the row; imported rows keep theirs |
| `created_at` | `timestamptz` | no | `now()` | Imported rows keep theirs |
| `updated_at` | `timestamptz` | no | `now()` | `onUpdate` |

```sql
create index "document_templates_type_scope_idx"
  on "document_templates" ("document_type", "sales_channel_id");

-- One default per document type and scope; the global scope is the all-zero key.
create unique index "document_templates_one_default_per_scope_uq"
  on "document_templates" ("document_type",
     coalesce("sales_channel_id", '00000000-0000-0000-0000-000000000000'::uuid))
  where "is_default";
```

No `languages`, `code` or `is_system` column: languages are `content.languages`' keys; the built-in
layout is virtual (research R-8).

### Write rules — every row change is a Command run by `CommandBus.run`

| Command (`action`) | Effect | Concurrency |
| --- | --- | --- |
| `document_template.create` | Insert, `is_default=false` unless `setDefault=true` (then as `.set_default`, same tx). `content` from `defaultContent()` or a source template of the **same** type | — |
| `document_template.rename` | `name` | `expectedVersion` |
| `document_template.save_content` | Replace one language's tree (adds the language); refuses blocks a present module declares that the type does not offer (FR-019) and languages outside the registration's `languages` | `expectedVersion` |
| `document_template.set_default` | Clear `is_default` of the scope's current default (if another), set it here — one transaction | `expectedVersion` |
| `document_template.clear_default` | `is_default=false` | `expectedVersion` |
| `document_template.delete` | Delete; a default row requires `confirmDefault=true` (FR-007) | `expectedVersion` |

Every Command first asserts the type is **available** (registered by a present module) and answers
`DOCUMENT_TYPE_NOT_AVAILABLE` otherwise — so templates of a switched-off host are neither listed nor
writable, and never deleted by this module.

**Audit state** (R-13): `{ documentType, name, salesChannelId, isDefault, version, languages,
contentDigest: { <lang>: sha256(canonical JSON) } }`; `save_content` adds `{ language }`.

## 2. ~~`document_template_imports`~~ — withdrawn (owner answer P2)

No invoice template data is imported, so there is no import marker. `invoice_templates` (owned by
`invoices`) is dropped by an `invoices` migration.

## 3. `content` — the per-language Page Builder envelope

Validated by `documentTemplateContentSchema` (`packages/contracts/src/document-templates.ts`).

```jsonc
{
  "schemaVersion": 1,
  "languages": {
    "pl-PL": {
      "root": { "props": { "pageSize": "A4", "orientation": "auto", "footerText": "{{channelName}} · {{date}}", "showPageNumbers": true } },
      "content": [
        { "type": "document_templates.Image", "props": { "id": "…", "assetId": "<uuid>", "width": 120 } },
        { "type": "comparisons.ComparisonHeader", "props": { "id": "…", "title": "Porównanie produktów" } },
        { "type": "comparisons.ComparisonTable", "props": { "id": "…", "showSku": true } }
      ]
    }
  }
}
```

| Rule (`DOCUMENT_TEMPLATE_INVALID`, 422, with path) | Limit |
| --- | --- |
| `schemaVersion` | literal `1` |
| language keys | `^[a-z]{2,3}(-[A-Z]{2})?$`, 1–10, and within the registration's `languages` when it sets one |
| nodes per language | ≤ 200; Puck `zones`/slots not accepted |
| node `type` | `blockNameRe`; a name declared by a present module but **not offered by this type** → refused (FR-019); unknown names (absent owner) accepted and kept |
| node `props` | object; strings ≤ 5 000 chars |
| `document_templates.Image` nodes | ≤ 20 per language |
| serialized `content` | ≤ 512 KiB |
| root props | §3.1 |

### 3.1 Root props — `documentRootPropsSchema`; defaults come from the type's `pageDefaults`

| Prop | Type | Generic default | `invoices.invoice` default (parity) |
| --- | --- | --- | --- |
| `pageSize` | `'A4' \| 'LETTER'` | `'A4'` | `'A4'` |
| `orientation` | `'auto' \| 'portrait' \| 'landscape'` | `'auto'` | `'portrait'` |
| `marginTop/Right/Bottom/Left` (pt, 0–144) | number | 40 / 32 / 40 / 32 | 40 / 40 / 48 / 40 |
| `baseFontSize` (6–18) | number | 10 | 10 |
| `headerText`, `footerText` (≤ 500, merge fields) | string | `''` | `''` |
| `showPageNumbers` | boolean | `false` | `false` |
| `pageNumberFormat` (≤ 50) | string | `'{{page}} / {{pages}}'` | same |

Plus non-editable `pageDefaults.styles` (invoices: `{ docTitle: { fontSize: 14, bold: true } }`). Stored
legacy invoice trees carry `root.props: {}`, so they render with the invoice defaults — parity.

## 4. Blocks per document type (declared; props live in `content`)

### 4.1 Core blocks — owner `document_templates`, `contexts: ['document']`, category `layout`

Offered only to types that opt in (`coreBlocks`). Props:
`Heading` (`text`, `level` 1–3, `color`, `align`, `marginTop`, `marginBottom`); `Text` (`text` with merge
fields, `fontSize`, `color`, `bold`, `italics`, `align`, margins); `Image` (`assetId`, `width`,
`maxHeight`, `align`, `marginBottom`); `Spacer` (`height`); `Divider` (`thickness`, `color`, `style`,
`widthPercent`, `marginY`); `PageBreak`.

### 4.2 `comparisons.comparison` — `coreBlocks: 'all'`, `selection: 'default_only'`, languages: all active

| Block (`contexts: ['document']`, category `comparison`) | Props (English defaults; per-language texts in the built-in layout) |
| --- | --- |
| `comparisons.ComparisonHeader` | `title`, `titleSize` (16), `titleColor`, `align`, `showDate`, `dateLabel`, `showDisplayMode`, `modeLabelAll`, `modeLabelCommon`, `modeLabelDifferences`, `showPricedFor`, `pricedForOrganizationText`, `pricedForChannelText`, `marginBottom` |
| `comparisons.ComparisonTable` | `showImages`, `imageSize` (40–200), `showName`, `showSku`, `showPrice`, `showAvailability`, `availableText`, `unavailableText`, `attributeColumnLabel`, `emptyValue` ('—'), `highlightRows`, `commonColor`, `differentColor`, `headerBackground`, `borderColor`, `fontSize`, `productsPerTable` (1–8, 4), `showHiddenNote`, `hiddenNoteText` (`{{hiddenCount}}`) |
| `comparisons.ComparisonShareLink` | `label`, `showUrl`, `showQr`, `qrSize` (40–200), `align` |

Merge fields: `date`, `productCount`, `channelName`, `customerName`, `organizationName`, `shareUrl`;
`page`, `pages` (header/footer); `hiddenCount` (inside `hiddenNoteText`).

### 4.3 `invoices.invoice` — `coreBlocks: 'none'`, `selection: 'default_only'`, `languages: ['pl-PL']`

| Blocks | Notes |
| --- | --- |
| `invoices.InvoiceHeader`, `InvoiceParties`, `InvoiceLineItems`, `InvoiceVatSummary`, `InvoiceTotals`, `InvoiceNotes`, `InvoiceSpacer`, `InvoiceDivider`, `InvoiceLogo`, `InvoiceFooter` | Unchanged names, props and section builders; manifest declarations keep `contexts: ['invoice']` and gain their real `fields`/`defaultProps` (moved from `pdf-components/descriptor.ts`) |
| every present `invoicePdfBlockRegistry` contribution (e.g. `ksef.InvoiceSection`) | Described by its own `describe()`; presence-filtered per call; contributor unchanged |

No merge fields. Built-in: `defaultContent()` = the generic seed tree
(`seeds/generic-invoice-template.ts`), `renderBuiltIn()` = today's `builtinLayout()`.

## 5. Non-persisted shapes (contracts)

| Shape | File | Purpose |
| --- | --- | --- |
| `DocumentTypeRegistration<TData>`, `DocumentBlockRenderer`, `DocumentRenderContext`, `LegacyTemplateRecord` | `packages/contracts/src/document-templates.ts` | `contracts/document-type-registry.md` |
| `DocumentRenderPort`, `DocumentRenderResult` | same | render with optional `templateId` |
| `ComparisonDocumentData` | `packages/contracts/src/comparisons.ts` | `{ view, channelName, customerName, organizationName, shareUrl, hideEmptyRows, generatedAt }` |
| `InvoiceDocumentData` | `packages/contracts/src/invoices.ts` | `{ invoice: InvoiceDetail, amountLocale: 'pl' \| 'en' }` |
| Admin DTOs | `packages/contracts/src/document-templates.ts` | `contracts/document-templates-api.md` |

## 6. State and lifecycle

```text
            create (is_default=false, or setDefault)          set_default
 [none] ──────────────────────────────────────▶ [template] ─────────────▶ [default of its scope]
                                                  ▲   │   ◀── clear_default / another set_default
                                       rename,    │   │
                                    save_content ─┘   ▼ delete (confirmDefault if default)
                                                   [gone] → documents fall back per FR-031 / FR-039
```

Host or facility switched off: rows untouched and invisible; on again: same state. Channel deleted: its templates cascade.
