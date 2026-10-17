# Contract: the *Invoice* document type, the template import, and parity

**Owner**: `invoices`. Implements `contracts/document-type-registry.md` for `invoices.invoice`.
Normative for research R-4, R-24 to R-31. Parity (FR-083, SC-008) is the overriding requirement: where
this contract and "cleaner" disagree, this contract wins.

## 1. Registration

| Field | Value |
| --- | --- |
| `code` / `moduleId` | `invoices.invoice` / `invoices` |
| `labelKey` | `documentTypes.invoice.label` (+ `.description`) in `invoices`' bundles |
| `blocks()` | the ten own renderers (`invoices.Invoice{Header,Parties,LineItems,VatSummary,Totals,Notes,Spacer,Divider,Logo,Footer}`) wrapping today's `sections.ts` builders unchanged, **then** `invoicePdfBlockRegistry.present()` adapted 1:1 (`name`, `moduleId`, `describe`, `render` with `resolved` taken from `prepared`) |
| `coreBlocks` | `'none'` |
| `selection` | `'default_only'` |
| `languages` | `['pl-PL']` (N5 default) |
| `variables` | none |
| `defaultContent()` | `{ schemaVersion: 1, languages: GENERIC_INVOICE_TEMPLATE_CONTENT.languages }` (`seeds/generic-invoice-template.ts`) |
| `renderBuiltIn(data, prepared)` | today's `builtinLayout(invoice, locale, contributed, suppressKsefNumber)` |
| `pageDefaults` | `pageSize 'A4'`, `orientation 'portrait'`, margins top 40 / right 40 / bottom 48 / left 40, `baseFontSize 10`, `styles: { docTitle: { fontSize: 14, bold: true } }` |
| `prepareRender(data, { placedBlocks, preview })` | (1) inline logo images exactly as `embedInvoiceLogoImages` does today (asset or URL, 3 s timeout, PNG/JPEG only); (2) for present contributors **placed** in the tree (or all present ones when the built-in layout will be used) call `resolve(invoice.id)`, a rejection → `null`; (3) `suppressKsefNumber` = some present contributor with `printsKsefReferenceNumber` is placed (built-in: is present) |
| `sampleData()` | `{ invoice: sampleInvoiceDetail(), amountLocale: 'en' }` |
| `legacyImport` | `{ source: 'invoice_templates', read, afterImport }` — §3 |

Pushed from a **contribution-only** `ctx.onBoot` in `packages/modules/invoices/src/backend/index.ts`.

## 2. Render paths after the move

| Path | Today | After |
| --- | --- | --- |
| `GET /api/v1/admin/invoices/:id/pdf` | `resolveTree(channel,'pl-PL')` + `render(detail,'pl',tree)` | `documentRenderPort.render({ documentType: 'invoices.invoice', salesChannelId: detail.salesChannelId, language: 'pl-PL', data: { invoice: detail, amountLocale: 'pl' } })` |
| `POST /api/v1/admin/invoices/:id/regenerate-pdf` | same, result discarded | same call, result discarded |
| `GET /api/v1/orders/:id/invoices/:invoiceId/pdf` (customer) | same | same call |
| E-mail attachment (`invoice-email-dispatch.ts`) | `render(detail)` — built-in layout, no template | **unchanged**: invoices' local `renderBuiltIn` path, no port (N1 default; R-26) |
| Preview | `/api/v1/admin/invoice-templates/:id/preview` with `'en'` | the facility's route 12 with the type's sample (`amountLocale: 'en'`) |
| Bulk printout, legacy stub download | stub PDFs | unchanged |

`InvoicePdfRenderer` shrinks to the local built-in path used by the e-mail; `InvoiceTemplateService`,
`descriptor.ts`, the template routes and `ensureGenericSeed` are deleted. `invoices` declares
`document_templates` and `admin_roles` in `dependencies` (R-27, R-28 defaults).

## 3. Import (`legacyImport`)

- `read()` — `em.find(InvoiceTemplate, {})` in `invoices`' own code, mapped per `data-model.md` §2's
  legacy table (`active` → `isDefault`, `content.languages` → `languages`).
- `afterImport()` — via `lazyPort<AdminRolePort>(ctx, 'adminRolePort')`: `list()`; for each role holding
  `invoices:read` and lacking `document_templates:read`, `upsertByCode` adding it; for each holding
  `invoices:write`, add `document_templates:read` and `:write`. Idempotent. Logs the changed role codes.
  A throw rolls back the import (retried on next trigger).
- `InvoiceTemplate` entity stays registered (the table stays; read-only by convention, enforced by the
  absence of any write path and by `check:command-coverage` seeing none).

## 4. Admin surfaces

- Admin contributions: `/invoices/templates` → `<Navigate replace to="/document-templates?type=invoices.invoice">`,
  `/invoices/templates/:id` → `<Navigate replace to="/document-templates/:id">` (ids preserved);
  both `requiredPermission: 'invoices:read'`.
- `InvoiceSectionTabs` *Templates* tab → `/document-templates?type=invoices.invoice`.
- Manifest: action `invoice-templates` removed (FR-090 met by `open-document-templates`' keywords);
  block declarations gain the real `fields` / `defaultProps` from `descriptor.ts` (`contexts` stay
  `['invoice']`); `invoices:write` label drops "edit templates".
- Admin block contributions (context `document`) for the ten blocks: the canvas renderers of
  `invoice-puck-config.tsx`, reading `useDocumentSample<InvoiceDocumentData>()` instead of the frontend
  `sampleInvoice` copy, with the colour/asset/URL field overrides they have today.
- Deleted: `pages/InvoiceTemplatesPage.tsx`, `pages/InvoiceTemplateEditor.tsx`,
  `templates/described-blocks.tsx`, `templates/invoice-builder-plugin.tsx`; `_i18n`'s
  `invoiceTemplates.*` and `appShell.nav.invoiceTemplates` keys removed from both bundles; field labels
  move into `invoices`' bundles.
- Withdrawn API: the five `/api/v1/admin/invoice-templates*` routes (N4 default) — major changeset for
  the invoices package; `backend/test/fixtures/openapi-baseline.json` updated.

## 5. Parity test (SC-008) — golden document definitions

Before any invoice code changes (task order enforces it), capture with today's
`InvoicePdfRenderer.content()` + its `buildDoc` the pdfmake document definition for this matrix and
commit them under `packages/modules/invoices/src/backend/document/__golden__/`:

1. generic seed tree, regular invoice; 2. same, correction invoice; 3. operator-edited tree (every
block, non-default props); 4. channel override tree for an invoice of that channel and the global tree
for another channel; 5. tree placing a fake contributor with `printsKsefReferenceNumber` (present →
number once; absent → header prints it); 6. contributor `resolve` rejecting → block rendered with
`null`; 7. tree with no renderable node → `builtinLayout`; 8. logo by asset id and by URL (stubbed
loader); 9. preview: sample with `'en'`; 10. e-mail attachment (built-in, no tree).

After the move, the same inputs through `documentRenderPort` (1–9) and the local path (10) MUST produce
deep-equal definitions. Image data URIs compare by value. A byte-level smoke test asserts each renders.

## 6. Import tests

`backend/test/integration/invoices/template-import.test.ts`, on a database seeded through the legacy
table (fixture SQL in the test, not a migration): global active + inactive, channel active, edited
generic `is_system` row, row with a deleted channel, oversize row. Assert: ids/names/scopes/versions/
trees preserved, `is_default` = legacy `active`, deleted-channel row skipped and reported, one marker
row and one `document_template.import` audit row (system actor); second trigger is a no-op; a template
deleted after import does not return; `invoices` off at boot → no import, on → first read imports;
two concurrent triggers → one import; `afterImport` throwing → nothing imported, retried; role grants
applied once.
