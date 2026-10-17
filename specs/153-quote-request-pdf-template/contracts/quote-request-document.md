# Contract: the *Quote request* document type, the quote PDF routes and the remembered template

**Normative for**: `quote_requests`. Consumes `contracts/document-collections.md` and 152's
`contracts/document-type-registry.md`. Shapes: `data-model.md` §1, §4.

## 1. Registration — `quote_requests.quote_request`

Pushed into `documentTypeRegistry` from a **contribution-only** boot hook (no presence probe; 152 §3,
`specs/conventions/module-activation.md` boot-hook rule), built by
`createQuoteRequestDocumentType(deps)` in `QR/src/backend/document/quote-request-document-type.ts`.

| Member | Value |
| --- | --- |
| `code`, `moduleId` | `quote_requests.quote_request`, `quote_requests` |
| `labelKey` / `descriptionKey` | `documentTypes.quoteRequest.label` / `.description` |
| `selection` | `per_document` (owner D1) |
| `coreBlocks` | `'all'` |
| `languages` | absent — every active content language |
| `blocks()` | `QuoteHeader`, `QuoteParties`, `QuoteNotes`, `QuoteDetails` (§2) |
| `collections` | `[lines]` (§3) |
| `variables` / `resolveVariables` | §4 |
| `defaultContent()` | built-in layout, `en-US` + `pl-PL` (§5) |
| `pageDefaults` | A4, `orientation: 'portrait'`, margins 40/32/40/32, `baseFontSize: 9`, `showPageNumbers: true` |
| `prepareRender` | none |
| `sampleData(language)` | fictitious, fully priced quote: 5 lines (two discounted, one in a packaging unit, one with a note), an organisation with an address, a customer, a representative, 2 details, validity date set |

## 2. Quote blocks (declared in `QR/src/manifest.ts`, `contexts: ['document']`, category `quote`)

| Block | Props (defaults; per-language texts in the built-in layout) | Prints |
| --- | --- | --- |
| `quote_requests.QuoteHeader` | `title`, `titleSize` (18), `align`, `showNumber`, `numberLabel`, `showIssueDate`, `issueDateLabel`, `showValidUntil`, `validUntilLabel`, `showRevision`, `revisionLabel`, `marginBottom` | title, quote number, export date, validity date (when set), revision number |
| `quote_requests.QuoteParties` | `buyerHeading`, `showLegalName`, `showTaxId`, `taxIdLabel`, `showAddress`, `showCustomer`, `customerHeading`, `showSalesRep`, `salesRepHeading`, `layout` (`columns`/`stacked`) | organisation block; requesting customer; assigned representative — each section left out when empty |
| `quote_requests.QuoteNotes` | `label`, `showWhenEmpty` (false), `italics` | the header note |
| `quote_requests.QuoteDetails` | `heading`, `layout` (`table`/`list`) | customer-audience custom fields with a value, `label: value` |

Every block reads only `QuoteRequestDocumentData`; props through the module's tolerant readers. Canvas
renderers: `QR/src/admin/document-blocks/*.tsx`, contributed with `context: 'document'`, drawing over the
served sample (152 `useDocumentSample`).

## 3. Collection `lines`

`fields(language)`: the static catalogue of `data-model.md` §4.2 with labels from
`document/texts.ts`, plus one `attributes.<code>` per attribute of
`catalogAttributeReadPort.listByFlag('isVisibleOnProductPage')`, label from the attribute's per-locale
name (152 language chain), `sampleValue: { kind: 'text', value: <"Example" in language> }`.
`items(data)`: research R-11 over `data.lines`, `data.quote.taxRate`. `summaryFields` / `summary`:
`listTotal`, `discountTotal`, `netTotal`, `vatRate`, `vatTotal`, `grossTotal` (R-11).

## 4. Merge fields

`quoteNumber`, `validUntil` (date, PDF language), `revisionNumber`, `status` (translated label),
`currency`, `organizationName`, `organizationTaxId`, `customerName`, `customerEmail`, `salesRepName`,
`salesRepEmail`, `channelName`, `netTotal`, `grossTotal` (formatted money or empty). A value that does
not exist prints empty (152 §5).

## 5. Built-in layout (per language)

`QuoteHeader` → `QuoteParties` → `QuoteNotes` → `document_templates.ItemsTable` (`collection: 'lines'`;
columns `row.number` (24 pt), `productName` (fill), `sku` (auto, `any_has_value`), `quantity`,
`packagingUnit` (`any_has_value`), `listUnitPrice` (`any_has_value`), `discountPercent`
(`any_has_value`), `unitPrice`, `vatRate`, `lineNet`, `lineGross`; detail row `lineNote`; totals
`discountTotal`, `netTotal`, `vatTotal`, `grossTotal` (emphasised), all `has_value`) → `QuoteDetails` →
core `Text` with "Prices are net unless stated otherwise." / "Ceny netto, o ile nie zaznaczono inaczej.".
Root: footer `{{quoteNumber}} · {{date}}`, page numbers on.

Note: the built-in layout prints internal columns (list price, discount %) **only when a line has a
discount** — the owner's example; the owner confirmed internal fields may print (Q7).

## 6. Admin routes (`QR/src/backend/routes.admin.ts`, `ctx.routes`)

All behind `requireAdmin('rfqs:handle')` as `preHandler`, quote visibility through
`RfqAdminService`'s rule (unknown or invisible → 404 `NOT_FOUND`), `Cache-Control: private, no-store`.
Each resolves `documentRenderPort` through `lazyPort` **without** a presence probe — the gate answers
503 `MODULE_DISABLED` while document templates are off (`refuses-without`, §8).

| # | Route | Body / query | Answer |
| --- | --- | --- | --- |
| Q1 | `GET /api/v1/admin/quote-requests/:id/document-templates` | — | `{ data: QuoteRequestDocumentChoices }` |
| Q2 | `PUT /api/v1/admin/quote-requests/:id/document-template` | `{ documentTemplateId: uuid \| null }` | `{ data: { documentTemplateId } }`; runs §7 |
| Q3 | `GET /api/v1/admin/quote-requests/:id/pdf` | `templateId?: uuid`, `language?: lang` | `application/pdf`, headers below |
| Q4 | `POST /api/v1/admin/quote-requests/:id/pdf/send` | `QuoteRequestPdfSendRequest` (`data-model.md` §4.5) | `{ data: QuoteRequestPdfSendResult }`; runs §7b — owner answer Q4 |

```ts
// CT/quote-requests.ts
QuoteRequestDocumentChoices = {
  templates: { id; name; salesChannelId: uuid | null; languages: string[]; isDefault: boolean }[];
  rememberedTemplateId: uuid | null;
  rememberedTemplateMissing: boolean;        // remembered id not among templates
  effectiveDefaultId: uuid | null;           // null = built-in layout
  builtInLanguages: string[];
  suggestedLanguage: string;                 // channel default language (system default channel when none)
  requesterEmail: string | null;             // the requesting customer's e-mail — Q4's preselected recipient
}
```

Q3:
1. Load the quote (visibility); `templateId` given and ≠ remembered → run §7 first (refusal → 422
   `DOCUMENT_TEMPLATE_NOT_SELECTABLE`, nothing rendered).
2. Build `QuoteRequestDocumentData` for `language` ?? `suggestedLanguage` (research R-12).
3. `render({ documentType, salesChannelId: quote.salesChannelId ?? null, language, data,
   templateId: templateId ?? remembered ?? undefined })`.
4. Reply: `Content-Disposition: attachment; filename="<sanitised businessId>.pdf"`,
   `X-Document-Template-Id`, `X-Document-Template-Version`, `X-Document-Template-Source`,
   `X-Document-Template-Missing: true|false`. Render failure → the facility's 503
   `DOCUMENT_RENDER_FAILED` envelope, logged with `{ quoteRequestId, templateId, blockName }`.

Q4 (owner answer Q4, research R-27): body validated (`QuoteRequestPdfSendRequest`; 400 before
anything is read); per-admin rate limit 10 / minute (429); steps 1–3 of Q3; a PDF over
`QUOTE_REQUEST_PDF_MAX_ATTACHMENT_BYTES` → 422 `QUOTE_REQUEST_PDF_TOO_LARGE` (`details.maxBytes`),
nothing sent; then §7b. Answer `{ data: { sent, failed, templateId, templateSource,
requestedTemplateMissing } }`.

## 7. Command `quote_request.set_document_template`

`QR/src/backend/commands/document-template-commands.ts`, the 146 idiom
(`negotiation-policy-commands.ts`): authority step inside `run` (visibility, 404), validation through
`listChoices` (422), find → assign → flush in the unit of work, `skipAudit` when unchanged, audit
`before/after { documentTemplateId }`. `version` untouched (FR-010).

## 7b. Command `quote_request.send_document` (owner answer Q4)

Same file. Authority step inside `run` (visibility, 404). For each recipient, in order:
`transactionalEmailSenderAccessor()?.send({ code: 'quote_request_pdf', salesChannelId, language, to,
variables, messageId: 'quote-request-pdf:<sendId>:<n>', attachments: [{ filename, content,
contentType: 'application/pdf' }], document: { type: 'quote_request', id } })`. No sender, or an
outcome `deactivated` / `no_transport` / `no_definition` → 409 `QUOTE_REQUEST_PDF_EMAIL_UNAVAILABLE`
with `details.code` the outcome (the sender answers the same for every recipient, so the loop stops).
A throw is that recipient's failure; the loop continues. `sent` and `logged` are delivered. None
delivered → 502 `QUOTE_REQUEST_PDF_SEND_FAILED`. Otherwise one `pdf-sent` event (`data-model.md`
§1a) and the audit `after`. The quote row, `version` and revisions are untouched.

**E-mail** `quote_request_pdf` (`transactionalEmails` in the manifest; defaults pushed from the
contribution-only boot hook through `emailDefaultsPort`): variables `quote.number`, `quote.validUntil`
(formatted in the language, empty when unset), `customer.name`, `salesRep.name`, `salesRep.email`,
`channel.name`, `message` (empty when none). Default subject `Quote {{var quote.number}}` /
`Oferta {{var quote.number}}`; body: greeting, the message, "the quote is attached", the
representative's name and e-mail.

## 8. Manifest (`QR/src/manifest.ts`) — additions

- `nonBindingDependencies` += `{ moduleId: 'document_templates', name: 'documentTypeRegistry', kind:
  'contributes-to', reason }` and `{ moduleId: 'document_templates', name: 'documentRenderPort', kind:
  'refuses-without', whenAbsent: 'quote requests cannot be exported to PDF and no PDF template can be
  chosen', reason }`.
- `blocks` (4, §2) + `blockCategories: [{ key: 'quote', titleKey: 'blocks.category.quote', contexts:
  ['document'], weight: 20 }]`.
- `dependencies` += `transactional_emails` (non-deactivatable; the sender accessor and
  `emailDefaultsPort`, research R-27).
- `transactionalEmails` += `quote_request_pdf` (§7b).
- `errorCodes` += `QUOTE_REQUEST_PDF_TOO_LARGE`, `QUOTE_REQUEST_PDF_EMAIL_UNAVAILABLE` (tokens
  `deactivated`, `no_transport`, `no_definition`), `QUOTE_REQUEST_PDF_SEND_FAILED` — en + pl sentences.
- No new permission, setting or palette action (research R-17).

## 9. Off-states

| Off | Behaviour |
| --- | --- |
| `document_templates` | Q1–Q4 → 503 `MODULE_DISABLED`; *Export PDF* and *Send PDF to customer* hidden; `document_template_id` values kept |
| the `quote_request_pdf` e-mail (operator switch) | Q4 → 409 `QUOTE_REQUEST_PDF_EMAIL_UNAVAILABLE` (`deactivated`), nothing recorded; export unaffected |
| `quote_requests` | its routes 503 (module gate); type, blocks and templates invisible in the facility; rows kept; the contribution hook still pushes (no probe) and the registry filters by presence |
| both on again | remembered choices and templates work unchanged |

## 10. Tests owed

- Unit (`QR/src/backend/document/*.test.ts`): R-11 derivations (discount only below list, same
  currency; `null` totals when a line is unpriced; mixed currencies; rounding; VAT from net total);
  catalogue labels in `pl-PL`/`en-US`; attribute fields from a stubbed attribute port; blocks with default
  and hostile props; registration validates (built-in layout passes `itemsTablePropsSchema`).
- Data builder: visibility refusal; customer-audience custom fields only; deleted product → `sku`
  `null`, attributes `{}`; channel `null` → system default language.
- Command: authority before read-for-write; refusal of another channel's / another type's template;
  `skipAudit` on no change; `version` unchanged; audit row content.
- Contract (`backend/test/contract/quote_requests/pdf-export.test.ts`): Q1–Q3 permission (401/403 before
  validation), visibility 404, remembered → explicit → default → built-in resolution (SC-004), stale
  remembered id fallback with header, headers and file name, cross-organisation (sales rep) and
  cross-channel refusals (SC-005), off-state of both modules (SC-006).
- Send (`backend/test/contract/quote_requests/pdf-send.test.ts`): 401/403 before validation; 400 on
  malformed / too many / no recipients and an over-long message; visibility 404; delivered to every
  recipient with the PDF attached and the language's subject (captured transport); remembered template
  updated on a differing choice; history `pdf_sent` entry and one audit row; e-mail switched off → 409
  and nothing recorded; transport failure for one recipient → partial result; for all → 502; PDF over
  the limit → 422; rate limit → 429; document templates off → 503; `version` unchanged.
- Command unit test: authority before sending; outcome mapping; event and audit content; no PDF bytes
  in the audit.
- Replaced fixture (research R-24): `second-type.test.ts` and `admin-api.test.ts` off-state cases on
  `quote_requests.quote_request`.
