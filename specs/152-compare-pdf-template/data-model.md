# Data Model: Editable PDF template for the storefront product comparison

**Feature**: `specs/152-compare-pdf-template/` | **Date**: 2026-10-17

One new table, owned by the new module `document_templates`. No column is added to any existing
table; `comparisons` gains no table. The migration is scaffolded with
`pnpm --filter backend run migration:new -- --module document_templates --name init` (no number is
chosen by hand — `specs/conventions/module-migrations.md`); its position follows from the manifest
`dependencies` of `document_templates`.

## 1. `document_templates` (entity `DocumentTemplate`, `@GlobalEntity()`)

Platform-global configuration (Principle XI classification: *platform-global*), like
`invoice_templates`. It holds no organisation's or customer's data.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `randomUUID()` (app) | PK |
| `document_type` | `varchar(120)` | no | — | `<moduleId>.<snake_name>`, e.g. `comparisons.comparison`. `check (document_type ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$')`. Opaque to this module: never interpreted, only matched against registrations |
| `name` | `varchar(200)` | no | — | Operator label; trimmed, 1–200 chars |
| `sales_channel_id` | `uuid` | yes | `null` | `null` = all channels. FK → `sales_channels(id)` **on delete cascade** (kernel-owned table, so no manifest edge). **Immutable** after insert (R-8) |
| `content` | `jsonb` | no | — | `{ "schemaVersion": 1, "languages": { "<lang>": <tree> } }` — see §2 |
| `active` | `boolean` | no | `false` | At most one `true` per `(document_type, scope)` |
| `version` | `integer` | no | `1` | Optimistic-concurrency counter; +1 on every Command that changes the row |
| `created_at` | `timestamptz` | no | `now()` | |
| `updated_at` | `timestamptz` | no | `now()` | `onUpdate` |

**Indexes and constraints**

```sql
create index "document_templates_type_scope_idx"
  on "document_templates" ("document_type", "sales_channel_id");

-- One active template per document type and scope; the global scope is the all-zero key.
create unique index "document_templates_one_active_per_scope_uq"
  on "document_templates" ("document_type",
     coalesce("sales_channel_id", '00000000-0000-0000-0000-000000000000'::uuid))
  where "active";
```

No `languages` column (unlike `invoice_templates`): the languages are the keys of
`content.languages`, derived on read, so the two can never disagree. No `is_system` / `code` columns:
the built-in layout is virtual (R-8).

**Write rules** (each enforced by the Command named; all run through `CommandBus.run`)

| Command (`action`) | Effect | Version check |
| --- | --- | --- |
| `document_template.create` | Insert, `active=false` unless `activate=true` (then as `.activate` in the same tx). `content` copied from the registration's `defaultContent()` or from a source template of the **same** `document_type` | — |
| `document_template.rename` | `name` | `expectedVersion` |
| `document_template.save_content` | Replace one language's tree (add the language if new) | `expectedVersion` |
| `document_template.activate` | `active=false` on the currently active row of the same type+scope (if any, other than this), then `active=true` here — one transaction | `expectedVersion` |
| `document_template.deactivate` | `active=false` | `expectedVersion` |
| `document_template.delete` | Delete the row (an active row requires `confirmActive=true`, FR-007) | `expectedVersion` |

Every Command first asserts that `document_type` is **available** — registered by a present module —
and answers `DOCUMENT_TYPE_NOT_AVAILABLE` (404) otherwise, so templates of a switched-off host are
neither listed nor writable (FR-051), and are never deleted by this module.

**Audit state** (R-13): `before`/`after` = `{ documentType, name, salesChannelId, active, version,
languages, contentDigest }` where `contentDigest` is `{ <lang>: sha256(canonical JSON of tree) }`.
`save_content` adds `{ language }`.

## 2. `content` — the per-language Page Builder envelope

Validated on every write by `documentTemplateContentSchema` (`packages/contracts/src/
document-templates.ts`); stored props are otherwise opaque to the database.

```jsonc
{
  "schemaVersion": 1,
  "languages": {
    "pl-PL": {
      "root": { "props": {                       // documentRootProps — §2.1
        "pageSize": "A4", "orientation": "auto",
        "marginTop": 40, "marginRight": 32, "marginBottom": 40, "marginLeft": 32,
        "baseFontSize": 10,
        "headerText": "", "footerText": "{{channelName}} · {{date}}",
        "showPageNumbers": true, "pageNumberFormat": "{{page}} / {{pages}}"
      } },
      "content": [                                // top-level blocks, rendered in order
        { "type": "document_templates.Image", "props": { "id": "…", "assetId": "<uuid>", "width": 120, "align": "left" } },
        { "type": "comparisons.ComparisonHeader", "props": { "id": "…", "title": "Porównanie produktów", "showDate": true } },
        { "type": "comparisons.ComparisonTable", "props": { "id": "…", "showImages": true, "showSku": true } }
      ]
    },
    "en-US": { "root": { "props": { } }, "content": [ ] }
  }
}
```

**Validation rules** (`DOCUMENT_TEMPLATE_INVALID`, 422, with the failing path)

| Rule | Limit |
| --- | --- |
| `schemaVersion` | literal `1` |
| language keys | `^[a-z]{2,3}(-[A-Z]{2})?$`, ≤ 10 per template, ≥ 1 |
| `content` per language | array, ≤ 200 nodes; Puck `zones` / slots are not accepted in v1 |
| node `type` | matches `blockNameRe` (`packages/contracts/src/cms.ts`); **unknown names are accepted and stored** (feature 096 skip policy) |
| node `props` | object; string values ≤ 5 000 chars |
| `document_templates.Image` nodes | ≤ 20 per language; `assetId` a uuid or empty |
| serialized `content` | ≤ 512 KiB |
| root props | §2.1; unknown root props are dropped on write |

### 2.1 Root (document) props — `documentRootPropsSchema`

| Prop | Type | Default | Range |
| --- | --- | --- | --- |
| `pageSize` | `'A4' \| 'LETTER'` | `'A4'` | |
| `orientation` | `'auto' \| 'portrait' \| 'landscape'` | `'auto'` | `auto` asks the registration's `suggestOrientation(data)` |
| `marginTop`, `marginRight`, `marginBottom`, `marginLeft` | number (pt) | 40 / 32 / 40 / 32 | 0–144 |
| `baseFontSize` | number (pt) | 10 | 6–18 |
| `headerText`, `footerText` | string, merge fields | `''` | ≤ 500 |
| `showPageNumbers` | boolean | `false` | |
| `pageNumberFormat` | string with `{{page}}`, `{{pages}}` | `'{{page}} / {{pages}}'` | ≤ 50 |

## 3. Blocks (declared, not stored separately)

Declared in manifests with `contexts: ['document']`; their props live inside `content`.

### 3.1 Core blocks — owner `document_templates`, category `layout`

| Name | Props (defaults) |
| --- | --- |
| `document_templates.Heading` | `text` (''), `level` (1–3, 1), `color` ('#111111'), `align` (left), `marginTop` (0), `marginBottom` (8) |
| `document_templates.Text` | `text` ('', merge fields), `fontSize` (inherit), `color`, `bold` (false), `italics` (false), `align` (left), `marginTop`, `marginBottom` |
| `document_templates.Image` | `assetId` (''), `width` (120), `maxHeight` (80), `align` (left), `marginBottom` (8) |
| `document_templates.Spacer` | `height` (16) |
| `document_templates.Divider` | `thickness` (1), `color` ('#CCCCCC'), `style` (solid\|dashed), `widthPercent` (100), `marginY` (8) |
| `document_templates.PageBreak` | — |

### 3.2 Comparison blocks — owner `comparisons`, category `comparison`

| Name | Props (defaults; text defaults differ per language in the built-in layout) |
| --- | --- |
| `comparisons.ComparisonHeader` | `title` ('Product comparison'), `titleSize` (16), `titleColor`, `align` (left), `showDate` (true), `dateLabel` ('Date'), `showDisplayMode` (true), `modeLabelAll` ('All attributes'), `modeLabelCommon` ('Common attributes only'), `modeLabelDifferences` ('Differences only'), `showPricedFor` (true), `pricedForOrganizationText` ('Prices for your organisation'), `pricedForChannelText` ('Public prices'), `marginBottom` (12) |
| `comparisons.ComparisonTable` | `showImages` (true), `imageSize` (120, 40–200), `showName` (true), `showSku` (false), `showPrice` (true), `showAvailability` (false), `availableText` ('Available'), `unavailableText` ('Unavailable'), `attributeColumnLabel` (''), `emptyValue` ('—'), `highlightRows` (true), `commonColor` ('#155724'), `differentColor` ('#721C24'), `headerBackground` ('#F5F5F5'), `borderColor` ('#CCCCCC'), `fontSize` (10), `productsPerTable` (4, 1–8), `showHiddenNote` (true), `hiddenNoteText` ('{{hiddenCount}} product(s) in this comparison are not available to you.') |
| `comparisons.ComparisonShareLink` | `label` ('View this comparison online'), `showUrl` (true), `showQr` (true), `qrSize` (80, 40–200), `align` (left) |

### 3.3 Comparison merge fields (registration `variables`)

`date` (core), `productCount`, `channelName`, `customerName`, `organizationName`, `shareUrl`;
`page`, `pages` (core, header/footer only); `hiddenCount` (inside `hiddenNoteText` only).

## 4. Non-persisted shapes (contracts)

| Shape | Owner / file | Purpose |
| --- | --- | --- |
| `DocumentTypeRegistration<TData>` | `packages/contracts/src/document-templates.ts` | What a host registers (`contracts/document-type-registry.md` §2) |
| `DocumentRenderPort` | same | `render({ documentType, salesChannelId, language, data })` (§4 of that contract) |
| `ComparisonDocumentData` (`comparisonDocumentDataSchema`) | `packages/contracts/src/comparisons.ts` | The data `comparisons` passes and its sample: `{ view: ComparisonOwnerView, channelName, customerName \| null, organizationName \| null, shareUrl \| null, hideEmptyRows, generatedAt }` |
| Admin DTOs | `packages/contracts/src/document-templates.ts` | `contracts/document-templates-api.md` |

## 5. State and lifecycle

```text
          create (active=false)                 activate
 [none] ─────────────────────────▶ [inactive] ─────────────▶ [active]
                                    ▲    │  ◀───────────────   │
                                    │    │    deactivate /     │
                                    │    │    another template │
                                    │    │    activated in     │
                                    │    │    the same scope   │
                                    │    ▼                     ▼
                                    │  delete              delete (confirmActive)
                                    │    ▼                     ▼
                                    │  [gone]               [gone] → exports fall back (FR-031)
                                    └── rename / save_content keep the state
```

Module switched off (either `document_templates` or the type's host): rows untouched, invisible;
on again: visible, same state. Channel deleted: its templates are deleted by the FK cascade.
