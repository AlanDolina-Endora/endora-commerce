# Contract: saved list views HTTP API (`specs/147-saved-views/`)

Normative for the three lists' saved-view endpoints. The Zod schemas are the source of truth
(Principle II) and are written **first**, in `packages/contracts/src/saved-list-views.ts`
(shared) and `packages/contracts/src/orders.ts` (orders' existing exports, rebuilt on the shared
ones). Research: R-1, R-5 – R-11.

## §1 Shared schemas — `packages/contracts/src/saved-list-views.ts`

```ts
export const SAVED_LIST_VIEW_NAME_MAX = 160;
export const SAVED_LIST_VIEW_FILTERS_MAX_BYTES = 8192;   // UTF-8 bytes of JSON.stringify(filters) — S-05
export const SAVED_LIST_VIEW_COLUMNS_MAX = 64;            // entries — S-05
export const SAVED_LIST_VIEW_TOKEN_MAX = 64;              // chars per column id and per sort.field — S-05

/** Control (Cc) and format (Cf) characters — NUL, bidi overrides, zero-width — S-06. */
export function hasForbiddenNameCharacters(name: string): boolean; // /[\p{Cc}\p{Cf}]/u

/** Trimmed, 1–160 characters (FR-003), no Cc/Cf characters (S-06). Used by every create and update schema. */
export const savedListViewNameSchema = z.string().trim().min(1).max(SAVED_LIST_VIEW_NAME_MAX)
  .refine((n) => !hasForbiddenNameCharacters(n));

export const savedListViewSortSchema = z.object({
  field: z.string().min(1).max(SAVED_LIST_VIEW_TOKEN_MAX),
  dir: z.enum(['asc', 'desc']),
});

/** Opaque, but bounded (S-05). */
export const savedListViewFiltersSchema = z.record(z.string(), z.unknown())
  .refine((f) => Buffer.byteLength(JSON.stringify(f), 'utf8') <= SAVED_LIST_VIEW_FILTERS_MAX_BYTES);
// (use TextEncoder rather than Buffer if the package must stay browser-safe)

export const savedListViewColumnsSchema = z.array(z.string().min(1).max(SAVED_LIST_VIEW_TOKEN_MAX))
  .max(SAVED_LIST_VIEW_COLUMNS_MAX);

/** One list item, as every list's GET returns it. */
export const savedListViewSchema = z.object({
  id: uuidSchema,
  name: z.string(),                     // as stored — legacy orders rows may exceed the write rule
  shared: z.boolean(),
  ownerAdminUserId: uuidSchema,
  ownedByCaller: z.boolean(),           // R-8
  canModify: z.boolean(),               // R-8: ownedByCaller || (shared && caller is platform admin)
  filters: z.record(z.string(), z.unknown()),
  sort: savedListViewSortSchema.nullable().optional(),
  visibleColumns: z.array(z.string()).nullable().optional(),
});
export type SavedListView = z.infer<typeof savedListViewSchema>;

export const savedListViewListResponseSchema = z.object({ data: z.array(savedListViewSchema) });
export const savedListViewResponseSchema = z.object({ data: savedListViewSchema });
export const savedListViewDeleteResponseSchema = z.object({ data: z.object({ deleted: uuidSchema }) });

/** The name key FR-022 compares — the client-side twin of SQL `lower(btrim(name))`. */
export function savedListViewNameKey(name: string): string;
```

`savedListViewNameKey` is pure (trim, then `toLocaleLowerCase()`); the server never uses it to
decide — it compares in SQL (R-5) — and the kit uses it for the inline check.

### Per-list request schemas

| List | Create body | Update body |
| --- | --- | --- |
| Orders (`orders.ts`, names kept) | `createOrderSavedViewRequestSchema` = `{ name: savedListViewNameSchema, shared: boolean, filters: savedListViewFiltersSchema, sort: savedListViewSortSchema, visibleColumns?: savedListViewColumnsSchema \| null }` | `updateOrderSavedViewRequestSchema` = create `.partial()` |
| Products (`saved-list-views.ts`) | `createProductSavedViewRequestSchema` = `{ name, shared: boolean, filters: savedListViewFiltersSchema }` — other keys stripped | `updateProductSavedViewRequestSchema` = create `.partial()` |
| Quote requests (`saved-list-views.ts`) | `createQuoteRequestSavedViewRequestSchema` = `{ name, shared: boolean, filters: savedListViewFiltersSchema, sort?: sort \| null, visibleColumns?: savedListViewColumnsSchema \| null }` | `updateQuoteRequestSavedViewRequestSchema` = create `.partial()` |

Out-of-bound payloads and forbidden characters are refused with 400 `VALIDATION_FAILED`. There is
**no** per-owner or per-list view-count cap — the spec's *Assumptions* keep "no limit".

`orderSavedViewSchema` (response) becomes `savedListViewSchema` with `sort` required and
non-null, preserving its current type for existing consumers; it gains `ownedByCaller` and
`canModify`. Additive for readers; the create/update name rule tightens (trimming, no
whitespace-only names) — stated in the orders changeset.

## §2 Endpoints

Same four operations on each list. `{base}` is:

| List | `{base}` | Gate (FR-015) | Owner |
| --- | --- | --- | --- |
| Orders | `/api/v1/admin/orders/list-views` | `orders:read` | `orders` |
| Products | `/api/v1/admin/catalog/products/list-views` | `catalog:read` | `catalog` |
| Quote requests | `/api/v1/admin/quote-requests/list-views` | `rfqs:handle` | `quote_requests` |

| Method & path | Body | 2xx | Refusals |
| --- | --- | --- | --- |
| `GET {base}` | — | 200 `savedListViewListResponseSchema`: caller's own views ∪ every shared view, ordered by `name` asc | 401 no admin actor (on all four routes — never an empty owner id, S-03); 403 missing gate code |
| `POST {base}` | create schema | 201 `savedListViewResponseSchema` | 400 `VALIDATION_FAILED` (empty / whitespace-only / > 160 / malformed); 409 `<LIST>_SAVED_VIEW_NAME_TAKEN` |
| `PATCH {base}/:id` | update schema | 200 `savedListViewResponseSchema` | 400; 404 `NOT_FOUND` (absent, or another admin's private view); 403 `FORBIDDEN` (shared, caller neither owner nor platform admin); 409 on a name whose key changes to one the **view's owner** already uses on this list |
| `DELETE {base}/:id` | — | 200 `savedListViewDeleteResponseSchema` | 404; 403 — as `PATCH` |

Every refusal uses the standard error envelope; `error.message` is resolved in the request's
language by the backend (`specs/conventions/module-i18n.md`, boundary case 1).

**Conflict ownership on `PATCH` by a platform admin.** The uniqueness rule binds the **view's
owner**, not the caller: a platform admin renaming a colleague's shared view is refused when the
colleague already uses that key.

**Route precedence.** `GET`/`PATCH`/`DELETE` on `{base}` and `{base}/:id` must not be captured by
the list's `…/:id` routes (`catalog/src/backend/routes.admin.ts:253`, `:268`, `:554`;
`quote_requests/src/backend/routes.admin.ts:66`, `:90`). Fastify ranks the static segment
first; a contract test pins it per list.

**Off-state (FR-018).** The quote-request routes are registered inside
`registerQuoteRequestsAdminRoutes`, which `quote_requests` registers through `ctx.routes`; while
the module is not effectively present all four answer exactly as `GET /api/v1/admin/quote-requests`
does (the module route gate). Rows are not touched by the off-state.

## §3 Error codes

| Code | Owner module | Status | `en` | `pl` |
| --- | --- | --- | --- | --- |
| `ORDER_SAVED_VIEW_NAME_TAKEN` | `orders` | 409 | You already have a saved view with this name on the order list. Choose a different name. | Masz już zapisany widok o tej nazwie na liście zamówień. Wybierz inną nazwę. |
| `PRODUCT_SAVED_VIEW_NAME_TAKEN` | `catalog` | 409 | You already have a saved view with this name on the product list. Choose a different name. | Masz już zapisany widok o tej nazwie na liście produktów. Wybierz inną nazwę. |
| `RFQ_SAVED_VIEW_NAME_TAKEN` | `quote_requests` | 409 | You already have a saved view with this name on the quote request list. Choose a different name. | Masz już zapisany widok o tej nazwie na liście zapytań ofertowych. Wybierz inną nazwę. |

Each code: a member of `ERROR_CODES`; `{ code }` in the owner manifest's `errorCodes`; an entry in
`MINTED_ERROR_CODES` (`backend/test/fixtures/error-code-routing/reference-ledgers.ts`) with
`to: '<owner>'` and a reason naming the one raise site; `errors.<CODE>` in the owner's
`i18n/en.json` and `i18n/pl.json`.

## §4 Server-side rules the routes depend on

1. Every route takes the actor `{ adminUserId, isPlatformAdmin }` from its module's
   `src/backend/saved-view-actor.ts` (`packages/modules/{orders,catalog,quote_requests}`), which
   reads the ambient tenant context: `adminUserId` is `getTenantContext().actor.id` where
   `kind === 'admin'`. **No actor → 401 `UNAUTHORIZED`**; the `?? ''` fallbacks the order
   list's saved-view routes used to carry are removed (S-03).
2. `isPlatformAdmin` is `getTenantContext().mode === 'all'` on all three lists (R-7) — orders
   included; the order list's `allowAll` organisation scope is not consulted. An admin whose
   reach cannot be resolved is in `allowed-set` mode, so is not a platform admin. The list
   `GET` needs it too, for `canModify`; every service method takes the whole actor.
3. Writes of `create`, name-changing `update`: R-5's lock-and-probe inside `em.transactional`,
   keyed on the **view owner's** id (on `update` by a platform admin, the stored row's owner, not
   the caller — S-04); lock, probe and write all on the transaction.
4. `remove`/`update` authorisation: absent or private-and-not-owned → 404; shared and neither
   owner nor platform admin → 403.
5. No Command Bus, no audit (R-14). When the actor is not the owner on `update`/`remove`, one
   structured `info` log record (R-18, S-11):
   `{ event: 'saved_view.updated' | 'saved_view.deleted', list: '<table>', viewId, ownerAdminUserId, actorAdminUserId }`.
