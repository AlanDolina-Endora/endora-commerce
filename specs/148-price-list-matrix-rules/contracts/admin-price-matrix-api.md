# Contract — Admin price matrix API (148)

All routes are registered in `packages/modules/price_lists/src/backend/routes.ts` through the
module's existing `ctx.routes` composition (gated on the module's effective state). Gates are the
route's `preHandler` (`specs/conventions/module-admin-surfaces.md` item 3) and reuse the module's
existing codes: **`price_lists:read`** (`readGate`) and **`price_lists:write`** (`writeGate`). No new
permission code. Bodies are validated by the Zod schemas of `packages/contracts/src/price-lists.ts`
(data-model.md §3). Responses use the platform envelope `{ data }` / `{ error: { code, message, details? } }`.

Implementation note: the three writes are `PriceListService.createMatrixEntry`,
`patchMatrixEntry` and `removeMatrixEntry`, inside that service's audited runner;
`PriceMatrixService` holds the reads and prepares each write on the run's `EntityManager`.

Every route under `/price-lists-engine/:id/matrix` first loads the parent list and applies the
existing list visibility rule (`ruleVisibleForScope(extractRuleOrgTargets(list.applicationRule))`);
an invisible or missing list answers 404 `PRICE_LIST_NOT_FOUND`, exactly as
`GET /api/v1/admin/price-lists-engine/:id` does today.

## 1. List entries

`GET /api/v1/admin/price-lists-engine/:id/matrix` — `readGate`

Query (`priceMatrixListQuerySchema`):

| Param | Type | Default | Meaning |
| --- | --- | --- | --- |
| `page` | int ≥ 0 | 0 | |
| `pageSize` | int 1–200 | 50 | |
| `selectionKind` | `product \| category_attribute \| attribute \| category \| all` | — | filter |
| `organizationId` | uuid \| `none` | — | `none` = not organization-specific only |
| `productId` / `categoryId` | uuid | — | filter |
| `lang` | `en`, `pl`, `pl-PL`, … | — | the admin's language; only picks display labels |

200:

```json
{ "data": {
    "items": [ /* priceMatrixEntrySchema */ ],
    "total": 132, "page": 0, "pageSize": 50,
    "limit": 5000
} }
```

Scope: rows whose `organizationId` is out of the ambient scope are excluded *in the query* (not
post-filtered), so `total` never discloses them (SC-005).

Order: `organizationId` nulls first, then selection specificity desc (product → all), then
`minQuantity` asc, then `id`.

## 2. Get one entry

`GET /api/v1/admin/price-lists-engine/:id/matrix/:entryId` — `readGate`

200 `{ data: priceMatrixEntry }`. 404 `PRICE_MATRIX_ENTRY_NOT_FOUND` when missing, on another list,
or naming an out-of-scope organization — the three are byte-identical responses.

## 3. Create

`POST /api/v1/admin/price-lists-engine/:id/matrix` — `writeGate`

Body: `priceMatrixEntryInputSchema`. Example — 12% off category for one organization from 500 units:

```json
{ "categoryId": "…", "organizationId": "…", "minQuantity": 500,
  "price": { "type": "discount_percent", "percent": "12" } }
```

201 `{ data: priceMatrixEntry }`. Runs `CommandBus.run({ action: 'price_list.matrix_entry_create',
objectType: 'price_list', objectId: <list id> })`, `before: null`, `after: <entry DTO>`; touches the
list's `modifiedAt`? **No** — `modifiedAt` drives the *list* tie-break (011 FR-027); an entry edit
must not reorder lists. (Bracket writes do not touch it either.)

Errors:

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_FAILED` | schema/shape refinement; unknown product, category, organization (or out-of-scope organization — same message); currency not offered |
| 400 | `PRICE_MATRIX_ATTRIBUTE_NOT_ELIGIBLE` | `details.reason ∈ not_found, not_flagged, language_scoped, channel_scoped, value_type, unknown_value` |
| 404 | `PRICE_LIST_NOT_FOUND` | parent list missing or invisible |
| 409 | `PRICE_MATRIX_ENTRY_OVERLAP` | `details.conflictingEntryId` (only when that entry is visible to the caller; otherwise the field is omitted and the message is generic) |
| 409 | `PRICE_MATRIX_ENTRY_LIMIT` | `details.limit = 5000` |
| 403 | `FORBIDDEN` | no `price_lists:write` (answered before validation) |

The system Default list accepts entries; its "no application rule" invariant is unaffected.

## 4. Update

`PATCH /api/v1/admin/price-lists-engine/:id/matrix/:entryId` — `writeGate`

Body: `priceMatrixEntryPatchSchema` — every field of the input optional, at least one present
(`patch_body_empty`). The service merges onto the stored entry and re-runs the create
validations on the merged result (an entry can be moved between selection kinds): the shape,
overlap and limit always; the existence of a product, category or organization, the currency and
the attribute's eligibility when that coordinate changed — so an entry naming a soft-deleted target
can still have its window or price corrected, which is what the *deleted item* marker invites. Action
`price_list.matrix_entry_update`, `before`/`after` DTOs. A patch that changes nothing commits with
`skipAudit: true` and returns 200 with the unchanged entry.

Errors: as create, plus 404 `PRICE_MATRIX_ENTRY_NOT_FOUND`.

## 5. Delete

`DELETE /api/v1/admin/price-lists-engine/:id/matrix/:entryId` — `writeGate`

204. Action `price_list.matrix_entry_delete`, `before: <DTO>`, `after: null`. 404
`PRICE_MATRIX_ENTRY_NOT_FOUND` as in §2.

## 6. Attribute picker

`GET /api/v1/admin/pricing/rule-targets/attributes` — `readGate`

Sibling of the existing `…/rule-targets/{sales-channels,customer-groups,organizations,categories,currencies}`.
Reads `catalogAttributeReadPort.listByFlag('isPriceRule')` and returns only eligible attributes
(research R6), ordered by label:

```json
{ "data": { "items": [
  { "key": "material", "label": "Material", "valueType": "select",
    "options": [ { "value": "stainless", "label": "Stainless steel" } ] },
  { "key": "atex", "label": "ATEX certified", "valueType": "boolean",
    "options": [ { "value": "true", "label": "Yes" }, { "value": "false", "label": "No" } ] }
] } }
```

Labels resolve in the language the admin passes as `?lang=` (exact tag, then the same language
with another region), with the attribute's `labelDefault` fallback. Boolean options carry their
value (`true` / `false`) as the label; the admin renders this module's
`priceMatrix.attribute.boolean.true/false` instead, so no backend string is translated.

## 7. Duplicate (existing route, behaviour extended)

`POST /api/v1/admin/price-lists-engine/:id/duplicate` copies matrix entries (new ids, same
coordinates and prices) inside the same Command Bus run as the existing roster/bracket copy. The
`price_list.duplicate` audit `after` gains `matrixEntryCount`.

## 8. Resolved-price probe (existing route, response extended)

The admin resolved-price probe (`admin-resolved-price` — served by `BuyerLinePriceService`) adds
`matrixEntryId: string | null` to its `resolvedPrice` object. Additive; existing clients ignore it.

## 9. What is deliberately absent

- No storefront route — buyers see matrix prices through every existing price surface.
- No bulk import endpoint — entries are few per list by design (one per contract term); import can
  be added later on the same service method.
- No published port — no other module needs to read or write the matrix.
