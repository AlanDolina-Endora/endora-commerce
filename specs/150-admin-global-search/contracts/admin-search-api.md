# Contract: Admin global search HTTP API

**Owner**: `admin_search` | **Schemas**: `packages/contracts/src/admin-search.ts` (written first,
Principle II) | **Gating**: every route is registered through `ctx.routes`, so a switched-off or
platform-unavailable `admin_search` answers 503 `MODULE_DISABLED` on all of them (Principle XVII).

All responses use the platform envelope `{ data, meta? }` / `{ error: { code, message, details?,
requestId } }`. All routes send `Cache-Control: private, no-store`.

## 1. `GET /api/v1/admin/global-search/capability`

What the palette needs to know once per open. **Gate**: `requireAdmin()` (any signed-in admin).

```ts
export const AdminSearchCapabilitySchema = z.object({
  minimumQueryLength: z.number().int().min(2).max(10),
  resultsPerEntity: z.number().int().min(1).max(10),
  /** The entity types this caller would get results for right now (present ∧ permitted ∧ enabled). */
  entityTypes: z.array(z.object({
    entityType: AdminSearchEntityTypeSchema,
    label: z.string(),            // resolved in `language`
    icon: KnownIconNameSchema,
  })),
});
// Query: { language: SupportedAdminLanguageSchema }
// 200 { data: AdminSearchCapability }
```

An empty `entityTypes` tells the shell to show no records group for this open (the caller may read
none of the types, or every type is disabled in configuration).

## 2. `GET /api/v1/admin/global-search`

The federated search. **Gate**: `requireAdmin()`; per-type permission is applied inside (research
R-4).

```ts
export const AdminSearchQuerySchema = z.object({
  q: z.string().max(100),                         // trimmed server-side; > 100 → 400 VALIDATION_FAILED
  entityTypes: z                                  // comma-separated in the query string
    .string().optional()
    .transform((s) => (s ? s.split(',').filter(Boolean) : undefined))
    .pipe(z.array(AdminSearchEntityTypeSchema).max(16).optional()),
  limit: z.coerce.number().int().min(1).max(25).optional(), // default: resultsPerEntity setting
  language: SupportedAdminLanguageSchema,
});

export const AdminSearchHitSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  status: z.object({ code: z.string(), label: z.string() }).nullable(),
  /** Admin path, optionally with a query string (category focus). Never an absolute URL. */
  targetRoute: z.string().regex(/^\/[A-Za-z0-9\-._~/:%]*(\?[A-Za-z0-9\-._~=&%]*)?$/),
});

export const AdminSearchGroupSchema = z.object({
  entityType: AdminSearchEntityTypeSchema,
  label: z.string(),
  icon: KnownIconNameSchema,
  status: z.enum(['ok', 'timed_out', 'failed']),
  hits: z.array(AdminSearchHitSchema),   // empty unless status === 'ok'
  hasMore: z.boolean(),
});

export const AdminSearchResponseSchema = z.object({
  data: z.object({
    query: z.string(),                   // the trimmed text actually searched
    groups: z.array(AdminSearchGroupSchema),
  }),
  meta: z.object({
    belowMinimumLength: z.boolean(),
    minimumQueryLength: z.number().int(),
    limit: z.number().int(),
    tookMs: z.number().int().nonnegative(),
  }),
});
```

Behaviour:

| Case | Answer |
| --- | --- |
| trimmed `q` shorter than `minimumQueryLength` | 200, `groups: []`, `belowMinimumLength: true`; no provider runs |
| `entityTypes` names a type that is absent, not permitted or disabled | silently not searched (no disclosure of what exists) |
| a provider has no hits | its group is **omitted** |
| a provider exceeds `PROVIDER_DEADLINE_MS` (1 500) | group with `status: 'timed_out'`, `hits: []` |
| a provider throws (other than `ModuleDisabledError`) | group with `status: 'failed'`, `hits: []`; error logged with request id |
| groups order | provider `weight` ascending, then `entityType` |

No search text is persisted (FR-017). The route logs no query-string at `info` beyond the platform's
standard request log.

## 3. `GET /api/v1/admin/global-search/configuration`

**Gate**: `requireAdmin('admin_search:configure')`.

```ts
export const AdminSearchConfigurationViewSchema = z.object({
  version: z.string(),                  // Settings' optimistic-lock token, '' before the first write
  minimumQueryLength: z.number().int(),
  resultsPerEntity: z.number().int(),
  entities: z.array(z.object({
    entityType: AdminSearchEntityTypeSchema,
    label: z.string(),
    icon: KnownIconNameSchema,
    enabled: z.boolean(),
    customized: z.boolean(),            // false ⇔ no stored entry (defaults apply)
    fields: z.array(z.object({
      code: AdminSearchFieldCodeSchema,
      label: z.string(),
      selected: z.boolean(),
      defaultSelected: z.boolean(),
    })),
  })),
});
// Query: { language }   200 { data: AdminSearchConfigurationView }
```

Lists **present** providers only (FR-018, FR-013), in weight order, regardless of the caller's
per-type read permissions (configuring is a platform decision; the label set discloses no record).

## 4. `PUT /api/v1/admin/global-search/configuration`

**Gate**: `requireAdmin('admin_search:configure')` declared as `preHandler` (runs before body
validation, `module-admin-surfaces.md` item 3).

```ts
export const UpdateAdminSearchConfigurationRequestSchema = z.object({
  expectedVersion: z.string().nullable(),         // null only for the first write
  entities: z.array(z.object({
    entityType: AdminSearchEntityTypeSchema,
    /** Omit both to restore defaults (the stored entry is removed). */
    enabled: z.boolean().optional(),
    fields: z.array(AdminSearchFieldCodeSchema).max(20).optional(),
  })).max(64),
});
// 200 { data: AdminSearchConfigurationView }  (re-read after the write)
```

Processing:

1. Load the stored value; for each submitted entry whose provider is present, validate (unknown
   type → 422; field not offered → 422; duplicate → 422; `enabled: true` with `fields: []` → 422). All
   failures are reported together: `VALIDATION_FAILED` with `details: [{ path:
   'entities.<i>.fields.<j>', issue }]`.
2. Merge: a submitted entry with `enabled`+`fields` replaces the stored one; an entry with neither
   removes it (restore defaults); stored entries of absent providers and entries not submitted are
   kept.
3. `settingsAdminService.setValueForAllChannels('admin_search.entity_fields', merged,
   expectedVersion, { actorAdminUserId, requestId })` — audited, cache dropped, version checked
   (409 `VERSION_CONFLICT` from Settings on mismatch — the UI shows "configuration changed, reload").
4. Answer the configuration view re-read after the write.

## 5. Generic Settings API

`admin_search.minimum_query_length` and `admin_search.results_per_entity` are edited through the
existing Settings screen and API; `admin_search`'s `SettingWriteValidator` refuses out-of-range
values (422). `admin_search.entity_fields` is `hidden`, and a write to it through the generic API is
held to the same rules as §4 step 1 by the same validator.

## 6. Error codes

None minted (research R-14). Codes answered: `VALIDATION_FAILED` (400/422), `UNAUTHORIZED` (401),
`FORBIDDEN` (403), `MODULE_DISABLED` (503), and Settings' `VERSION_CONFLICT` (409) passed through.

## 7. OpenAPI

Four new admin routes: regenerate `backend/test/fixtures/openapi-baseline.json` with
`UPDATE_OPENAPI_BASELINE=1` (the step `specs/143-crm-sales-opportunities/research.md` N-11 records as
owed by any route-adding change).
