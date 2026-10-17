# Contract: Document templates admin API

**Owner**: `document_templates`. **Schemas**: `packages/contracts/src/document-templates.ts`.
All routes are registered through `ctx.routes` (module-gated: 503 `MODULE_DISABLED` while off), gated
by `requireAdmin('<code>')` as the route's `preHandler`, and answer `{ data }` /
`{ error: { code, message, details?, requestId } }`. JSON is camelCase. Every route touching a type
first runs `ensureImported(type)` (`document-type-registry.md` §6).

| # | Method & path | Permission | Purpose |
| --- | --- | --- | --- |
| 1 | `GET /api/v1/admin/document-templates/types` | `document_templates:read` | Available document types |
| 2 | `GET /api/v1/admin/document-templates/types/:code?language=` | `document_templates:read` | Type detail: labels, selection rule, languages, merge fields, sample, built-in layout |
| 3 | `GET /api/v1/admin/document-templates/types/:code/builder-config` | `document_templates:read` | Page Builder descriptor **for this type only** |
| 4 | `GET /api/v1/admin/document-templates?type=&salesChannelId=&applicableToChannel=` | `document_templates:read` | Template summaries |
| 5 | `GET /api/v1/admin/document-templates/:id` | `document_templates:read` | Template with content |
| 6 | `POST /api/v1/admin/document-templates` | `document_templates:write` | Create / duplicate |
| 7 | `PATCH /api/v1/admin/document-templates/:id` | `document_templates:write` | Rename |
| 8 | `PUT /api/v1/admin/document-templates/:id/content/:language` | `document_templates:write` | Save one language's tree |
| 9 | `POST /api/v1/admin/document-templates/:id/set-default` | `document_templates:write` | Make default of its scope |
| 10 | `POST /api/v1/admin/document-templates/:id/clear-default` | `document_templates:write` | Stop being default |
| 11 | `DELETE /api/v1/admin/document-templates/:id` | `document_templates:write` | Delete |
| 12 | `POST /api/v1/admin/document-templates/preview` | `document_templates:read` | Render a tree with the type's sample → PDF |

`types` is a static segment registered before `/:id`, and `:id` is a uuid (Zod).

## Shapes

```ts
documentTypeSummarySchema = z.object({
  code: documentTypeCodeSchema, moduleId: z.string(),
  labelKey: z.string(), descriptionKey: z.string().optional(),
  selection: z.enum(['default_only', 'per_document']),
  templateCount: z.number().int().nonnegative(),
});                                                                    // 1
documentTypeDetailSchema = documentTypeSummarySchema.extend({
  languages: z.array(z.string()).nullable(),                           // null = every active content language
  variables: z.array(z.object({ key: z.string(), labelKey: z.string(), ownerModule: z.string(),
                                scope: z.enum(['body', 'headerFooter']) })),
  sample: z.unknown(),
  builtInContent: documentTemplateContentSchema,
  pageDefaults: documentRootPropsSchema,
});                                                                    // 2
documentBuilderConfigSchema = cmsPageBuilderDescriptorSchema.extend({
  rootFields: z.record(z.string(), cmsFieldDescriptorSchema),
});                                                                    // 3 — components = the type's palette (registry §1)
documentTemplateSummarySchema = z.object({
  id: uuidSchema, documentType: documentTypeCodeSchema, name: z.string(),
  salesChannelId: uuidSchema.nullable(), salesChannelName: z.string().nullable(),
  languages: z.array(z.string()), isDefault: z.boolean(),
  version: z.number().int().positive(), updatedAt: z.string().datetime(),
});                                                                    // 4
documentTemplateDetailSchema = documentTemplateSummarySchema.extend({ content: documentTemplateContentSchema }); // 5
createDocumentTemplateBodySchema = z.object({
  documentType: documentTypeCodeSchema,
  name: z.string().trim().min(1).max(200),
  salesChannelId: uuidSchema.nullable(),
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('built_in') }),
    z.object({ kind: z.literal('template'), templateId: uuidSchema }),
  ]),
  setDefault: z.boolean().default(false),
});                                                                    // 6
renameDocumentTemplateBodySchema = z.object({ name: z.string().trim().min(1).max(200), expectedVersion: z.number().int() }); // 7
saveDocumentTemplateContentBodySchema = z.object({ tree: documentTemplateTreeSchema, expectedVersion: z.number().int() });  // 8
versionedBodySchema = z.object({ expectedVersion: z.number().int() });                                                      // 9, 10
deleteDocumentTemplateBodySchema = versionedBodySchema.extend({ confirmDefault: z.boolean().default(false) });              // 11
previewDocumentBodySchema = z.object({ documentType: documentTypeCodeSchema, language: z.string(), tree: documentTemplateTreeSchema }); // 12
```

Route 4: `type` required; `salesChannelId=<uuid|global>` filters one scope;
`applicableToChannel=<uuid>` returns global ∪ that channel (the future per-document picker, research
R-22/R-23). Routes 6–10 answer `{ data: DocumentTemplateSummary }` (201 for 6); 11 answers 204. Route
12 answers `application/pdf`, inline, `no-store`, and renders with `salesChannelId: null`, `preview:
true`, the type's sample, and — for invoices — the sample's `amountLocale: 'en'` (parity with today's
preview).

## Errors

| Code | Status | When | Owner |
| --- | --- | --- | --- |
| `DOCUMENT_TEMPLATE_NOT_FOUND` | 404 | No row, **or** its type is not available (indistinguishable, FR-051) | `document_templates` |
| `DOCUMENT_TYPE_NOT_AVAILABLE` | 404 | Type not registered by a present module | `document_templates` |
| `DOCUMENT_TEMPLATE_INVALID` | 422 | Limits/shape (`details.path`, `details.limit`); a block not offered by the type (`details.blockName`, FR-019); a language outside the type's `languages`; source template of another type; unknown `salesChannelId` | `document_templates` |
| `DOCUMENT_TEMPLATE_IS_DEFAULT` | 409 | Delete of a default without `confirmDefault` | `document_templates` |
| `DOCUMENT_TEMPLATE_NOT_SELECTABLE` | 422 | Render port only: explicit template where the type forbids it, or of another type/channel | `document_templates` |
| `DOCUMENT_RENDER_FAILED` | 503 | Rendering failed | `document_templates` |
| `VERSION_CONFLICT` | 409 | `expectedVersion` ≠ current | platform (existing) |
| `VALIDATION_FAILED` | 400 | Body/params schema | platform (existing) |

Declared in `document_templates`' manifest `errorCodes`, `errors.<CODE>` in both bundles.

## Behavioural guarantees (contract tests in `backend/test/contract/document_templates/`)

- 401/403 before validation on every route (permission inventory).
- Route 3 for `invoices.invoice` lists exactly the ten invoice blocks + present contributed blocks;
  for `comparisons.comparison` exactly its three + the six core blocks.
- Route 8 refuses a comparison block in an invoice template and vice versa (FR-019); accepts a block of
  an absent owner and returns it unchanged on route 5.
- `set-default` is atomic: concurrent calls in one scope end with exactly one default.
- A host switched off: route 1 omits its type; 2, 3, 6 → `DOCUMENT_TYPE_NOT_AVAILABLE`; 4–5 omit/404
  its templates; nothing deleted.
- Exactly one audit row per successful write; none for a refusal; preview writes nothing.
- The withdrawn `/api/v1/admin/invoice-templates*` routes answer 404 (route absent) — research R-29.
