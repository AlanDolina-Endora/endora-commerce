# Data Model: Quote request PDF export, per-quote template, configurable line-items table

**Feature**: `specs/153-quote-request-pdf-template/` | **Date**: 2026-10-17

Two schema changes, both owned by `quote_requests`. No new table. `document_templates` stores the new
block's settings inside its existing `content` jsonb (152 `data-model.md` §3) — no migration there.

## 1. `quote_requests.document_template_id` (owner `quote_requests`) — owner answer Q2

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `document_template_id` | `uuid` | yes | `null` | The template remembered for this quote (research R-13). **No foreign key**: the target is `document_templates`' table; a stale id falls back to the default at render (152 FR-039) and is never cleared automatically |

- Scaffolded with `pnpm --filter backend run migration:new -- --module quote_requests --name
  quote_request_document_template` — never numbered by hand (`specs/conventions/module-migrations.md`).
  Additive, nullable, no backfill, no index (read only by primary key).
- Entity: `QuoteRequest.documentTemplateId?: string | null` (`[OptionalProps]` gains it). The entity is
  `@OrgScoped()`, so the column is tenant-filtered with its row.
- Written **only** by the Command `quote_request.set_document_template` (§4.3), through the unit of
  work (never `nativeUpdate`, which bypasses the org write guard — the 146 rule). The write does not
  touch `version`, creates no revision and no `quote_request_events` row. `updated_at` still moves
  (`onUpdate`); that is accepted — a representative's deliberate action on the quote — and stated in
  the docs.
- Admin reply (`quoteRequestSchema`) gains `documentTemplateId: uuidSchema.nullable().optional()` —
  admin replies only, absent from the customer reply (`customer-projection.ts` allow-list unchanged).

## 1a. `quote_request_events.event_type` gains `pdf-sent` (owner `quote_requests`) — owner answer Q4

- Scaffolded with `pnpm --filter backend run migration:new -- --module quote_requests --name
  quote_request_event_pdf_sent`: drops and re-creates `qre_event_type_check` with the eleven existing
  values plus `pdf-sent`. `down()` restores the eleven (and fails if a `pdf-sent` row exists — the
  constraint would; accepted, as for every check widening).
- `QuoteRequestEventType` gains `'pdf-sent'`. Payload (validated by the Command before the write):

  ```jsonc
  {
    "recipients": ["buyer@example.com"],   // delivered addresses only, 1–5
    "templateId": "…" ,                   // uuid, or null for the built-in layout
    "templateName": "With discounts",     // as rendered; null for the built-in layout
    "language": "pl-PL",
    "message": "…"                        // the personal message, or null
  }
  ```
- Written only by the Command `quote_request.send_document` (§4.4), actor = the sending
  administrator, `revisionId` = null. Read only by the admin History (`kind: 'pdf_sent'`,
  `delivery: { recipients, templateName, language, message }`); the customer's quote reply leaves
  `pdf-sent` events out entirely (`customer-projection.ts` `customerEventsOf`).

## 2. Line items table settings — stored inside a template's tree

A placed node `{ "type": "document_templates.ItemsTable", "props": { … } }` in one language's tree.
Validated at save by `itemsTablePropsSchema` (`CT/document-templates.ts`), refusing with
`DOCUMENT_TEMPLATE_INVALID` (422, `details.path` = `content.<i>.props.<path>`); read at render through
tolerant readers (unreadable values fall back to defaults).

```jsonc
{
  "id": "…",                                // Puck node id
  "collection": "lines",                    // a collection key the type declares; default = first
  "columns": [                              // 1–16
    {
      "id": "c1",                           // stable within the block, [A-Za-z0-9_-]{1,40}
      "field": "row.number",                // field path, documentFieldPathRe
      "label": "Lp.",                       // ≤ 200; '' = catalogue name in this tree's language
      "width": 24,                          // 'auto' | 'fill' | 10–400 (pt)
      "align": "auto",                      // 'auto' | 'left' | 'center' | 'right'
      "format": {},                         // { decimals?: 0–4, currencyDisplay?: 'symbol'|'code'|'none', dateStyle?: 'short'|'medium'|'long' }
      "emptyText": "",                      // ≤ 50
      "visibleWhen": { "op": "always" }     // always | never | any_has_value
    },
    { "id": "c6", "field": "discountPercent", "label": "Rabat", "width": "auto", "align": "auto",
      "format": { "decimals": 1 }, "emptyText": "", "visibleWhen": { "op": "any_has_value" } }
  ],
  "detailRow": {
    "enabled": true,
    "entries": [                            // ≤ 8
      { "field": "lineNote", "label": "Uwagi", "visibleWhen": { "op": "has_value" } },
      { "field": "attributes.lead_time", "label": "Termin realizacji", "visibleWhen": { "op": "has_value" } }
    ],
    "separator": " · ",                     // ≤ 10
    "italics": true,
    "fontSize": 8                           // 6–14
  },
  "totals": [                               // ≤ 10
    { "field": "netTotal", "label": "Razem netto", "visibleWhen": { "op": "has_value" }, "emphasis": false },
    { "field": "discountTotal", "label": "Rabaty", "visibleWhen": { "op": "has_value" }, "emphasis": false },
    { "field": "vatTotal", "label": "VAT", "visibleWhen": { "op": "has_value" }, "emphasis": false },
    { "field": "grossTotal", "label": "Razem brutto", "visibleWhen": { "op": "has_value" }, "emphasis": true }
  ],
  "grouping": {                             // or null
    "field": "attributes.brand",
    "emptyLabel": "Pozostałe",              // ≤ 100
    "subtotalField": "lineNet",             // numeric or money item field, or null
    "subtotalLabel": "Suma grupy"           // ≤ 200
  },
  "emptyText": "Brak pozycji",              // ≤ 200; printed when no item or no visible column
  "headerBackground": "#f1f5f9",
  "borderColor": "#cbd5e1",
  "fontSize": 9,                            // 6–14
  "stripedRows": false,
  "stripeColor": "#f8fafc",
  "marginBottom": 12                        // 0–144
}
```

Save-time rules beyond shape: a `columns[].id` unique within the block; `field`, `entries[].field`,
`grouping.field`, `grouping.subtotalField` and `totals[].field` match `documentFieldPathRe`; a rule
op is one of those allowed **where it is used** (columns: `always|never|any_has_value`; entries and
totals: `always|never|has_value`). A field path the catalogue does not offer is **accepted** (the
catalogue is data and changes; FR-037), flagged in the editor, and prints `emptyText`.

## 3. Declared, non-persisted shapes (`CT/document-templates.ts`)

```ts
export const documentFieldPathRe = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9_-]{1,100})?$/;
export const RESERVED_FIELD_FAMILIES = ['row', 'item'] as const;   // `row.number` is the facility's

export type DocumentValueKind = 'text' | 'number' | 'money' | 'percent' | 'date';
export type DocumentValue =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'money'; readonly amount: number; readonly currency: string }
  | { readonly kind: 'percent'; readonly value: number }
  | { readonly kind: 'date'; readonly value: string }
  | null;

export interface DocumentValueFormat {
  readonly decimals?: number;                                  // 0–4
  readonly currencyDisplay?: 'symbol' | 'code' | 'none';
  readonly dateStyle?: 'short' | 'medium' | 'long';
}

export interface DocumentFieldDefinition {
  readonly path: string;                                       // documentFieldPathRe
  readonly label: string;                                      // in the requested language
  readonly valueKind: DocumentValueKind;
  readonly group: string;                                      // 'line' | 'pricing' | 'product' | host key
  readonly audience: 'customer' | 'internal';
  readonly defaultFormat?: DocumentValueFormat;
  readonly defaultAlign?: 'left' | 'center' | 'right';
  readonly description?: string;
  readonly sampleValue?: DocumentValue;                        // preview only (research R-4)
}

export interface DocumentItem {
  readonly values: Readonly<Record<string, DocumentValue>>;    // by field path
}

export interface DocumentCollectionDeclaration<TData = unknown> {
  readonly key: string;                                        // ^[a-z][A-Za-z0-9]*$, unique per type
  readonly labelKey: string;                                   // module-relative i18n key
  fields(language: string): Promise<readonly DocumentFieldDefinition[]>;
  items(data: TData): readonly DocumentItem[];
  summaryFields?(language: string): Promise<readonly DocumentFieldDefinition[]>;
  summary?(data: TData): Readonly<Record<string, DocumentValue>>;
}

export type DocumentCondition =
  | { readonly op: 'always' }
  | { readonly op: 'never' }
  | { readonly op: 'has_value'; readonly field?: string }
  | { readonly op: 'any_has_value'; readonly field?: string };

// DocumentTypeRegistration gains:
//   readonly collections?: readonly DocumentCollectionDeclaration<TData>[];
// DocumentTypeDetail (admin route 2) gains:
//   collections: { key, labelKey, ownerModule, fields, summaryFields, sampleItems, sampleSummary }[]
// DocumentRenderPort gains:
//   listChoices(input): Promise<DocumentTemplateChoices>
```

Pure functions (same file): `documentValueHasValue`, `formatDocumentValue`, `evaluateDocumentCondition`,
`sumDocumentValues`, `resolveDocumentAlign`.

## 4. `quote_requests` shapes

### 4.1 `QuoteRequestDocumentData` (`CT/quote-requests.ts`) — JSON-serialisable

```ts
{
  generatedAt: string;                         // ISO
  quote: { id; businessId; status; revisionNumber; createdAt; submittedAt; approvedAt; expiresAt;
           headerNote: string | null; taxRate: number; currency: string };
  channel: { id: string; name: string } | null;
  buyer: { organizationName; legalName: string | null; taxId; address: { line1; line2; postalCode; city; country } | null;
           customerName: string | null; customerEmail: string | null };
  salesRep: { name: string; email: string } | null;
  details: { label: string; value: string }[];          // customer-audience custom fields with a value
  lines: {
    id; productId; productName; variantLabel: string | null; sku: string | null;
    quantity: number; packagingUnitName: string | null; packagingUnitBaseQuantity: number | null;
    agreedUnitPrice: number | null; proposedUnitPrice: number | null;
    referenceUnitPrice: number | null; referenceCurrency: string | null;
    lineCurrency: string; lineNote: string | null;
    attributes: Record<string, string>;                // attribute code → display text in the export language
  }[];
}
```

### 4.2 Line field catalogue of `quote_requests.quote_request`, collection `lines`

| Path | Kind | Group | Audience | Default format / align |
| --- | --- | --- | --- | --- |
| `row.number` (facility) | number | line | customer | 0 dec, right |
| `productName` | text | line | customer | left |
| `variant` | text | line | customer | left |
| `sku` | text | line | customer | left |
| `quantity` | number | line | customer | 0 dec |
| `packagingUnit` | text | line | customer | left |
| `packagingQuantity` | number | line | customer | 0–2 dec |
| `listUnitPrice` | money | pricing | **internal** | 2 dec, symbol |
| `proposedUnitPrice` | money | pricing | customer | 2 dec |
| `unitPrice` | money | pricing | customer | 2 dec |
| `unitGrossPrice` | money | pricing | customer | 2 dec |
| `discountPercent` | percent | pricing | **internal** | 1 dec |
| `unitDiscount` | money | pricing | **internal** | 2 dec |
| `lineDiscount` | money | pricing | **internal** | 2 dec |
| `lineListValue` | money | pricing | **internal** | 2 dec |
| `lineNet` | money | pricing | customer | 2 dec |
| `vatRate` | percent | pricing | customer | 0 dec |
| `lineVat` | money | pricing | customer | 2 dec |
| `lineGross` | money | pricing | customer | 2 dec |
| `lineNote` | text | line | customer | left |
| `attributes.<code>` (one per product-page attribute) | text | product | customer | left |

Summary fields: `listTotal` (internal), `discountTotal` (internal), `netTotal`, `vatRate`, `vatTotal`,
`grossTotal`. Derivations: research R-11.

### 4.3 Command `quote_request.set_document_template`

| | |
| --- | --- |
| Input | `{ quoteRequestId, documentTemplateId: uuid \| null }` |
| Authority (inside the Command) | quote visible to the actor (`findVisibleForAdmin` rule) — else 404 as for an unknown id |
| Validation | non-null id ∈ `documentRenderPort.listChoices({ documentType: 'quote_requests.quote_request', salesChannelId: quote.salesChannelId }).templates` — else 422 `DOCUMENT_TEMPLATE_NOT_SELECTABLE` |
| Effect | `quote.documentTemplateId = id`; `version` untouched |
| Audit | `before: { documentTemplateId }`, `after: { documentTemplateId }`; `skipAudit: true` when equal |

### 4.4 Command `quote_request.send_document` (owner answer Q4)

| | |
| --- | --- |
| Input | `{ quoteRequestId, pdf: { bytes, fileName, templateId, templateName }, language, recipients: string[1..5], message: string \| null, variables }` — the PDF is rendered by the route before the Command runs |
| Authority (inside the Command) | quote visible to the actor — else 404 |
| Effect | one `TransactionalEmailSender.send` per recipient (code `quote_request_pdf`, attachment, `document`); then, if at least one was delivered, one `pdf-sent` event |
| Refusals | 409 `QUOTE_REQUEST_PDF_EMAIL_UNAVAILABLE` (`details.code`: `deactivated` \| `no_transport` \| `no_definition`); 502 `QUOTE_REQUEST_PDF_SEND_FAILED` when none delivered; nothing recorded in both |
| Audit | `after: { templateId, language, recipients, failedRecipients }` (no `before`); never the PDF bytes or the message |
| Answer | `{ sent: string[], failed: string[] }` |

### 4.5 `QuoteRequestPdfSendRequest` / `QuoteRequestPdfSendResult` (`CT/quote-requests.ts`)

```ts
QuoteRequestPdfSendRequest = {
  templateId?: uuid;            // same meaning as Q3's query parameter
  language?: string;            // 2–12
  recipients: string[];         // 1–5 e-mails (≤ 254 each), trimmed, case-insensitively de-duplicated
  message?: string;             // ≤ 2000
}
QuoteRequestPdfSendResult = {
  sent: string[]; failed: string[];
  templateId: uuid | null; templateSource: 'requested' | 'remembered' | 'default' | 'built_in' …;
  requestedTemplateMissing: boolean;
}
// QuoteRequestDocumentChoices += requesterEmail: string | null
// QUOTE_REQUEST_PDF_MAX_RECIPIENTS = 5; QUOTE_REQUEST_PDF_MESSAGE_MAX = 2000;
// QUOTE_REQUEST_PDF_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
```

## 5. State

```text
 quote.documentTemplateId:  null ──set──▶ T1 ──set──▶ T2 ──set(null)──▶ null
                                        │
            T1 deleted in document templates (no cascade) ─▶ id kept; render falls back to the
            default with requestedTemplateMissing = true; the dialog says so and preselects the default
```

Facility or quote requests switched off: nothing changes in either table; on again, the same state.
A refused send writes nothing; a delivered send appends one `pdf-sent` event and never changes the
quote row.
