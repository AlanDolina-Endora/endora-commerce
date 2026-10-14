# Contract: price-list bulk add

**Owner**: `price_lists` · **Zod source of truth**: `packages/contracts/src/price-lists.ts`
(written first — Constitution II) · **FRs**: FR-041, FR-042, FR-043, FR-044, FR-045 ·
**Decisions**: research.md R-8

## Route

```text
POST /api/v1/admin/price-lists-engine/:id/products/bulk-add
preHandler: writeGate  = requireAdmin(PRICE_LIST_PERMISSIONS.WRITE)   // 'price_lists:write'
schema:     { params: priceListIdParamsSchema, body: bulkAddPriceListProductsRequestSchema }
```

Registered in `registerPricingRoutes` (`packages/modules/price_lists/src/backend/routes.ts`),
beside the existing `GET|PUT|POST …/:id/products`. No other route changes; the single
`POST …/products` and the delta-replace `PUT …/products` keep their current behaviour.

## Schemas (to add to `packages/contracts/src/price-lists.ts`)

```ts
import { ADMIN_PRODUCT_SELECTION_MAX } from './catalog.js';

export const bulkAddPriceListProductsRequestSchema = z.object({
  productIds: z.array(uuidSchema).min(1).max(ADMIN_PRODUCT_SELECTION_MAX),
});
export type BulkAddPriceListProductsRequest = z.infer<typeof bulkAddPriceListProductsRequestSchema>;

export const bulkAddPriceListProductFailureReasonSchema = z.enum(['product_not_found']);

export const bulkAddPriceListProductsResultSchema = z.object({
  added: z.array(uuidSchema),
  unchanged: z.array(uuidSchema),
  failed: z.array(
    z.object({ productId: uuidSchema, reason: bulkAddPriceListProductFailureReasonSchema }),
  ),
});
export type BulkAddPriceListProductsResult = z.infer<typeof bulkAddPriceListProductsResultSchema>;

export const bulkAddPriceListProductsResponseSchema = z.object({
  data: bulkAddPriceListProductsResultSchema,
});
```

`ADMIN_PRODUCT_SELECTION_MAX = 200` is exported from `packages/contracts/src/catalog.ts`
(the picker's FR-008 cap; one home for the number). `priceListIdParamsSchema = z.object({ id:
uuidSchema })` is added beside it if no equivalent exists in the file.

## Responses

| Case | Status | Body | Writes | Audit |
| --- | --- | --- | --- | --- |
| Accepted (any mix of outcomes) | `200` | `{ data: { added, unchanged, failed } }` | one `price_list_products` row per `added` id; `modifiedAt` bumped iff `added ≥ 1` | one entry iff `added ≥ 1` |
| Caller lacks `price_lists:write` | `403 FORBIDDEN` (from the gate, before validation) | error envelope | none | none |
| Body not an object / `productIds` missing, empty, > 200, or a non-uuid member; `:id` not a uuid | `400 VALIDATION_FAILED` | error envelope with `details[]` | none | none |
| Price list unknown or deleted | `404 NOT_FOUND` | error envelope (`Price list <id> not found.`, from `getById`) | none | none |
| Price list is the system Default | `403 FORBIDDEN` | error envelope, sentence in the style of the existing Default guards, e.g. *"The Default price list's products cannot be added to; it is seeded from each product's default price."* | none | none |

Errors use `HttpError` with an `ERROR_CODES` member (FR-045). No new error code.

## Semantics of an accepted request

1. Ids are de-duplicated, first occurrence kept; outcomes are reported for the unique ids.
2. An id already on the roster → `unchanged` (checked first; idempotent; its brackets untouched).
3. Otherwise, an id `CatalogProductReadPort.findByIds(ids, { liveOnly: true })` does not return
   (unknown or soft-deleted) → `failed: { reason: 'product_not_found' }`.
4. Otherwise → `added`. Any status and type may be added (FR-012, price lists).
5. All of it runs as **one** `CommandBus.run` — action `price_list.products_add`, objectType
   `price_list`, objectId the list id; the audit after-state is `{ name, added, unchanged,
   failed }` as **counts**. A refusal anywhere in the command rolls the whole request back.
6. A committed write calls the service's existing `invalidatePricingCache()`.

## Idempotency and retry

Re-sending the same body after a lost response reports the previously added ids as `unchanged`
and writes no audit entry (spec Assumptions: Retry is safe). Two concurrent requests adding the
same new id can collide on the composite primary key at flush: one adds it; the other **may
answer 409 `VERSION_CONFLICT`** (the platform envelope's existing mapping of a unique-constraint
violation) and write nothing — or, had it read the roster after the first committed, report the id
`unchanged`. Which of the two depends on timing and is not deterministic; retrying reports the
product `unchanged` (research.md R-8, plan.md § Risks).

## Tests that pin this contract

- `packages/contracts/src/price-lists.test.ts` — schema bounds 0 / 1 / 200 / 201 / non-uuid.
- `packages/modules/price_lists/src/backend/services/bulk-add-partition.test.ts` — the pure
  partition (de-dup, precedence, ordering).
- `backend/test/contract/price_lists/price-list-products-bulk-add.test.ts` (**Postgres**) —
  every row of the table above; audit-entry counts (0 or 1); brackets of pre-existing roster
  products byte-for-byte unchanged (SC-006); 200 ids → 1 request, 1 entry (SC-007).
- `backend/test/contract/kernel/openapi-baseline.test.ts` (**Postgres**) — re-recorded.
- `backend/test/contract/admin_users/permission-inventory.test.ts` (**Postgres**) — still green
  (the gate resolves to `price_lists:write`).
