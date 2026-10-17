# Contract: Document templates admin API

**Owner**: `document_templates`. **Schemas**: `packages/contracts/src/document-templates.ts`.
All routes are registered through `ctx.routes` (module-gated: 503 `MODULE_DISABLED` while the module is
off), gated by `requireAdmin('<code>')` as the route's `preHandler`, and answer the standard envelope
`{ data }` / `{ error: { code, message, details?, requestId } }`. JSON is camelCase.

| # | Method & path | Permission | Purpose |
| --- | --- | --- | --- |
| 1 | `GET /api/v1/admin/document-templates/types` | `document_templates:read` | Available document types |
| 2 | `GET /api/v1/admin/document-templates/types/:code` | `document_templates:read` | One type: labels, merge fields, sample data, built-in layout |
| 3 | `GET /api/v1/admin/document-templates/types/:code/builder-config` | `document_templates:read` | Page Builder descriptor for the type |
| 4 | `GET /api/v1/admin/document-templates?type=&salesChannelId=` | `document_templates:read` | Template summaries |
| 5 | `GET /api/v1/admin/document-templates/:id` | `document_templates:read` | Template with content |
| 6 | `POST /api/v1/admin/document-templates` | `document_templates:write` | Create / duplicate |
| 7 | `PATCH /api/v1/admin/document-templates/:id` | `document_templates:write` | Rename |
| 8 | `PUT /api/v1/admin/document-templates/:id/content/:language` | `document_templates:write` | Save one language's tree |
| 9 | `POST /api/v1/admin/document-templates/:id/activate` | `document_templates:write` | Activate (deactivates the previous in scope) |
| 10 | `POST /api/v1/admin/document-templates/:id/deactivate` | `document_templates:write` | Deactivate |
| 11 | `DELETE /api/v1/admin/document-templates/:id` | `document_templates:write` | Delete |
| 12 | `POST /api/v1/admin/document-templates/preview` | `document_templates:read` | Render a tree with sample data → PDF |

Route 3 and the static segment `types` are registered before `/:id`; `:id` is a uuid (Zod), so
`types` never matches it.

## Shapes

```ts
// 1
documentTypeSummarySchema = z.object({
  code: documentTypeCodeSchema, moduleId: z.string(),
  labelKey: z.string(), descriptionKey: z.string().optional(),
  templateCount: z.number().int().nonnegative(),
});
// 2
documentTypeDetailSchema = documentTypeSummarySchema.extend({
  variables: z.array(z.object({ key: z.string(), labelKey: z.string(), ownerModule: z.string(),
                                scope: z.enum(['body', 'headerFooter']) })),
  sample: z.unknown(),                         // registration.sampleData(language) — ?language=
  builtInContent: documentTemplateContentSchema,
});
// 3 — the CMS descriptor shape, reused (packages/contracts/src/cms.ts)
documentBuilderConfigSchema = cmsPageBuilderDescriptorSchema.extend({
  rootFields: z.record(z.string(), cmsFieldDescriptorSchema),   // §2.1 of data-model.md
});
// 4, 5
documentTemplateSummarySchema = z.object({
  id: uuidSchema, documentType: documentTypeCodeSchema, name: z.string(),
  salesChannelId: uuidSchema.nullable(), salesChannelName: z.string().nullable(),
  languages: z.array(z.string()), active: z.boolean(), version: z.number().int().positive(),
  updatedAt: z.string().datetime(),
});
documentTemplateDetailSchema = documentTemplateSummarySchema.extend({
  content: documentTemplateContentSchema,
});
// 6
createDocumentTemplateBodySchema = z.object({
  documentType: documentTypeCodeSchema,
  name: z.string().trim().min(1).max(200),
  salesChannelId: uuidSchema.nullable(),
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('built_in') }),
    z.object({ kind: z.literal('template'), templateId: uuidSchema }),
  ]),
  activate: z.boolean().default(false),
});
// 7
renameDocumentTemplateBodySchema = z.object({ name: z.string().trim().min(1).max(200), expectedVersion: z.number().int() });
// 8
saveDocumentTemplateContentBodySchema = z.object({ tree: documentTemplateTreeSchema, expectedVersion: z.number().int() });
// 9, 10
versionedBodySchema = z.object({ expectedVersion: z.number().int() });
// 11
deleteDocumentTemplateBodySchema = versionedBodySchema.extend({ confirmActive: z.boolean().default(false) });
// 12
previewDocumentBodySchema = z.object({
  documentType: documentTypeCodeSchema,
  language: z.string(),
  tree: documentTemplateTreeSchema,            // the canvas, saved or not
});
```

Routes 6–11 answer `{ data: DocumentTemplateSummary }` (201 for 6, 200 otherwise; 11 answers 204).
Route 12 answers `application/pdf`, `content-disposition: inline; filename="preview.pdf"`,
`cache-control: no-store`, and runs with `salesChannelId: null`, `preview: true`.

## Errors

| Code | Status | When | Owner |
| --- | --- | --- | --- |
| `DOCUMENT_TEMPLATE_NOT_FOUND` | 404 | No row with `:id`, **or** its type is not available (indistinguishable, FR-051) | `document_templates` |
| `DOCUMENT_TYPE_NOT_AVAILABLE` | 404 | `:code` / `documentType` not registered by a present module | `document_templates` |
| `DOCUMENT_TEMPLATE_INVALID` | 422 | Content limits or shape (`details.path`, `details.limit`); source template of another type; unknown `salesChannelId` | `document_templates` |
| `DOCUMENT_TEMPLATE_ACTIVE` | 409 | Delete of an active template without `confirmActive` | `document_templates` |
| `VERSION_CONFLICT` | 409 | `expectedVersion` ≠ current | platform (existing) |
| `DOCUMENT_RENDER_FAILED` | 503 | Preview rendering failed | `document_templates` |
| `VALIDATION_FAILED` | 400 | Body/params schema | platform (existing) |

Declared in `document_templates`' manifest `errorCodes`, with `errors.<CODE>` sentences in its
`i18n/en.json` and `i18n/pl.json`.

## Behavioural guarantees (each has a contract test in `backend/test/contract/document_templates/`)

- 401/403 before validation for missing session / permission, on every route (permission inventory).
- Create with `source.kind = 'template'` copies content of a template of the **same** type; another
  type → 422.
- Activate is atomic: two concurrent activations of different templates in one scope end with exactly
  one active (unique index + tx), the loser answers `VERSION_CONFLICT` or succeeds second.
- A host module switched off: route 1 omits its type; routes 2–3 and 6 answer
  `DOCUMENT_TYPE_NOT_AVAILABLE`; routes 4–5 omit/404 its templates; nothing is deleted.
- Every successful write produces exactly one `audit_log_entries` row with `objectType
  'document_template'`; a refused write produces none.
- Preview never writes (no row, no audit entry).
