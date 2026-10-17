# Contract: Page Builder translation API

**Owner**: `cms` | **Schemas**: `packages/contracts/src/cms.ts` (written first, Constitution II)
**Base**: `/api/v1/admin/cms/page-builder/` — registered through `ctx.routes`, so a switched-off
`cms` answers `503 MODULE_DISABLED` like every other `cms` route (FR-040).

Both routes declare `requireAdmin('cms.translate')` as their `preHandler` (gate before validation,
`specs/conventions/module-admin-surfaces.md` item 3).

## 1. `GET /api/v1/admin/cms/page-builder/translation` — capability

**200**

```ts
export const cmsPageBuilderTranslationStatusSchema = z.enum([
  'ready', 'disabled', 'not_configured', 'unavailable',
]);

export const cmsPageBuilderTranslationCapabilitySchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ready'),
    provider: LlmProviderSchema, // 'anthropic' | 'google' | 'openai' | 'deepseek' | 'openai_compatible'
    model: z.string().min(1),
    maxCharacters: z.number().int().positive(),
  }),
  z.object({
    status: z.enum(['disabled', 'not_configured', 'unavailable']),
    maxCharacters: z.number().int().positive(),
  }),
]);
```

- Never contains the API key, the credential code or the base URL.
- `unavailable` is the `credentials`-absent answer (research R11) — this endpoint does **not** 503
  when `credentials` is off.
- Not cached by the client beyond one editor mount.

**401** unauthenticated, **403** without `cms.translate`.

## 2. `POST /api/v1/admin/cms/page-builder/translate` — translate a canvas

Body limit: 5 MiB.

**Request**

```ts
const languageCodeSchema = z.string().min(2).max(35);

export const puckDataSchema = z.object({
  root: z.object({ props: z.record(z.string(), z.unknown()).optional() }).passthrough(),
  content: z.array(z.record(z.string(), z.unknown())),
  zones: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))).optional(),
}).passthrough();

export const cmsPageBuilderTranslateRequestSchema = z.object({
  targetLanguage: languageCodeSchema,
  sourceLanguage: languageCodeSchema.nullable(),
  context: z.literal('cms'),
  data: puckDataSchema,
  resource: z.object({
    type: z.string().regex(/^[a-z][a-z0-9_]*$/).max(64),
    id: z.string().uuid().nullable(),
  }).optional(),
  /** Selection scope (research R22); absent = the whole canvas. */
  scope: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('component'), componentId: z.string().min(1).max(256) }),
    z.object({
      kind: z.literal('text'),
      componentId: z.string().min(1).max(256).nullable(),
      selectedText: z.string().trim().min(1).max(200_000),
    }),
  ]).optional(),
}).refine((r) => r.sourceLanguage !== r.targetLanguage, {
  message: 'sourceLanguage must differ from targetLanguage',
  path: ['sourceLanguage'],
});
```

**200**

```ts
export const cmsPageBuilderTranslateResponseSchema = z.object({
  data: puckDataSchema,
  report: z.object({
    translatedSegments: z.number().int().nonnegative(),
    untranslatedSegments: z.number().int().nonnegative(),
    untranslatableBlocks: z.array(z.object({ name: z.string(), count: z.number().int().positive() })),
    characters: z.number().int().nonnegative(),
    provider: LlmProviderSchema,
    model: z.string(),
    sourceLanguage: languageCodeSchema.nullable(),
    /** Echo of the scope actually translated (R22). */
    scope: z.object({
      kind: z.enum(['canvas', 'component', 'text']),
      /** true when a text selection was widened to whole paragraph(s). */
      widened: z.boolean(),
    }),
  }),
});
```

Guarantees (each one a test, see `plan.md` § *Requirement → test*):

- **G1 — structure**: removing every declared translatable string leaf from request `data` and
  response `data` yields deep-equal documents (FR-014, SC-002).
- **G2 — no send when nothing to translate**: a canvas with zero segments answers `200` with
  `translatedSegments: 0`, `characters: 0`, `data` deep-equal to the request, and the provider is not
  called (FR-022). No audit entry.
- **G3 — placeholders and inline tags**: every translated segment carries the same multiset of
  `{{…}}` tokens and the same inline tag set as its source, or it is not applied (FR-016, FR-017,
  FR-020).
- **G4 — rich-text marks**: each TipTap text node in the response carries a mark list that occurs in
  the source node it came from; link `href` attributes are unchanged.
- **G5 — undeclared blocks**: props of a block with no `translatable` declaration are deep-equal in
  request and response, and the block appears in `untranslatableBlocks` (FR-025).
- **G6 — idempotent shape**: `data.root`, `zones` keys and every component `props.id` are preserved.
- **G7 — scope**: with a `scope`, every string leaf outside it is byte-identical in request and
  response; with a text scope, the characters before and after the selected range in its leaf, and
  every mark list of a non-widened run, are unchanged (FR-026–FR-028).

## 3. Errors

Envelope as every other route (`error.code`, `error.message` in the request's language,
`error.details`). Codes declared in `cms`' `manifest.errorCodes`; sentences in
`packages/modules/cms/i18n/{en,pl}.json` under `errors.<CODE>` (and `errors.<CODE>.<token>` for the
tokens).

| Status | `error.code` | `details` | When |
| --- | --- | --- | --- |
| 400 | `VALIDATION_FAILED` (core) | Zod issues | schema refusal |
| 409 | `CMS_TRANSLATION_DISABLED` | — | switch off |
| 409 | `CMS_TRANSLATION_NOT_CONFIGURED` | — | capability `not_configured` |
| 409 | `CMS_TRANSLATION_UNAVAILABLE` | — | `credentials` absent |
| 413 | `CMS_TRANSLATION_TOO_LARGE` | `{ limit, characters }` | above the configured `cms.page_builder.translation.max_source_characters` (for the requested scope) — nothing sent; the message names both numbers |
| 422 | `CMS_TRANSLATION_SELECTION_NOT_FOUND` | — | the scope's block or selected text is not in the submitted canvas — nothing sent (R22) |
| 502 | `CMS_TRANSLATION_PROVIDER_FAILED` | `{ code: 'credentials_rejected' \| 'rate_limited' \| 'unavailable' \| 'timeout' \| 'malformed' }` | a chunk failed at the provider, or every chunk's answer was unusable |

Manifest declaration:

```ts
{ code: 'CMS_TRANSLATION_PROVIDER_FAILED',
  tokens: ['credentials_rejected', 'rate_limited', 'unavailable', 'timeout', 'malformed'] },
```

Mapping from `@endora-commerce/llm-client`'s `LlmProviderError` (one function, table-tested):

| `kind` | `status` | token |
| --- | --- | --- |
| `http` | 401, 403 | `credentials_rejected` |
| `http` | 429 | `rate_limited` |
| `http` | other | `unavailable` |
| `network` | — | `unavailable`, or `timeout` when the cause is the `AbortSignal.timeout` |
| `malformed` | — | the chunk's segments count as untranslated; `malformed` only if **every** chunk is |

## 4. Audit

Exactly one `cms.page_builder.translate` entry per request that sent at least one chunk, via
`CommandBus.run` (research R13; shape in `data-model.md` §5). Requests answered `409`/`413`/`400`/
`403` or with zero segments record nothing.

## 5. Off-state

| Module off | Capability | Translate |
| --- | --- | --- |
| `cms` | 503 `MODULE_DISABLED` | 503 `MODULE_DISABLED` |
| `credentials` | `200 { status: 'unavailable' }` | `409 CMS_TRANSLATION_UNAVAILABLE` |
| `prompt_actions` | unaffected | unaffected |
