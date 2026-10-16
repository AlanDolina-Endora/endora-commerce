# Data model — Price list matrix rules (148)

One new table owned by `price_lists`; no column added to any existing table. The attribute flag
(`product_attributes.is_price_rule`) already exists and is owned by `catalog`; this feature only
reads it.

## 1. `PriceListMatrixEntry` → table `price_list_matrix_entries`

Entity file: `packages/modules/price_lists/src/backend/entities/price-list-matrix-entry.entity.ts`,
appended to the `entities` array in `packages/modules/price_lists/src/backend/index.ts`.
Tenancy classification: **`@RuleScoped()`** (research R12).

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | no | PK, `randomUUID()` |
| `price_list_id` | `uuid` | no | FK `price_lists(id)` **on delete cascade** |
| `product_id` | `uuid` | yes | FK `products(id)` on delete cascade (owner `catalog`, declared dependency) |
| `category_id` | `uuid` | yes | FK `categories(id)` on delete cascade (owner `catalog`) |
| `attribute_key` | `varchar(64)` | yes | the attribute's key (`custom_field_definitions.key` length); no FK — see §4 |
| `attribute_value` | `varchar(255)` | yes | option value code, or `'true'`/`'false'` for boolean |
| `organization_id` | `uuid` | yes | FK `organizations(id)` on delete cascade (owner `organizations`, declared dependency) |
| `min_quantity` | `integer` | no | ≥ 1 |
| `max_quantity` | `integer` | yes | `null` = open-ended; ≥ `min_quantity` |
| `price_type` | `varchar(16)` | no | `'fixed' \| 'discount_percent'` |
| `amount` | `numeric(14,4)` | yes | fixed only; ≥ 0 |
| `currency_code` | `char(3)` | yes | fixed only (required); `null` for percentage |
| `discount_percent` | `numeric(5,2)` | yes | percentage only; `0 < p ≤ 100` |
| `created_at` | `timestamptz` | no | |
| `updated_at` | `timestamptz` | no | |

Derived (not stored): `selectionKind` — `product | category_attribute | attribute | category | all`,
computed from which selection columns are set.

### CHECK constraints (mirrored by Zod refinements in contracts, §3)

```sql
check ("min_quantity" >= 1),
check ("max_quantity" is null or "max_quantity" >= "min_quantity"),
check (("attribute_key" is null) = ("attribute_value" is null)),
-- a product selection stands alone
check ("product_id" is null or ("category_id" is null and "attribute_key" is null)),
-- a product selection names an organization (otherwise it is a bracket)
check ("product_id" is null or "organization_id" is not null),
check ("price_type" in ('fixed', 'discount_percent')),
check (
  ("price_type" = 'fixed'
     and "amount" is not null and "amount" >= 0 and "currency_code" is not null
     and "discount_percent" is null
     -- a fixed price needs some product selection
     and ("product_id" is not null or "category_id" is not null or "attribute_key" is not null))
  or
  ("price_type" = 'discount_percent'
     and "discount_percent" > 0 and "discount_percent" <= 100
     and "amount" is null and "currency_code" is null)
)
```

### Indexes

```sql
create index "price_list_matrix_entries_list_product_idx" on "price_list_matrix_entries" ("price_list_id", "product_id");
create index "price_list_matrix_entries_list_org_idx"     on "price_list_matrix_entries" ("price_list_id", "organization_id");
create index "price_list_matrix_entries_product_idx"      on "price_list_matrix_entries" ("product_id")      where "product_id" is not null;
create index "price_list_matrix_entries_category_idx"     on "price_list_matrix_entries" ("category_id")     where "category_id" is not null;
create index "price_list_matrix_entries_organization_idx" on "price_list_matrix_entries" ("organization_id") where "organization_id" is not null;
```

The first two serve the resolver prefetch (§5); the three partial indexes serve FK cascades and the
admin organization filter.

### Validation rules enforced in the service (not expressible as CHECK)

| Rule | Error |
| --- | --- |
| Product / category / organization exists (through `catalogProductReadPort`, `catalogCategoryReadPort`, `organizationDetailsPort`) | 400 `VALIDATION_FAILED` (`details.field`) |
| Fixed currency is offered by some sales channel (same source as `GET …/rule-targets/currencies`) | 400 `VALIDATION_FAILED` |
| Attribute eligible: exists, `isPriceRule`, value type ∈ {`select`,`enum`,`multiselect`,`boolean`}, not `languageScoped`, not `channelScoped`; `attribute_value` is one of its options (or `true`/`false`) | 400 `PRICE_MATRIX_ATTRIBUTE_NOT_ELIGIBLE` (`details.reason`) |
| No overlap with an entry of the same list having equal `(product_id, category_id, attribute_key, attribute_value, organization_id)` and intersecting currency (`null` intersects all) and intersecting quantity window | 409 `PRICE_MATRIX_ENTRY_OVERLAP` (`details.conflictingEntryId`) |
| `count(*) where price_list_id = ?` < 5 000 on create | 409 `PRICE_MATRIX_ENTRY_LIMIT` (`details.limit`) |
| Scoped admin: `organization_id` in scope (`isOrgInScope`) | 404 `PRICE_MATRIX_ENTRY_NOT_FOUND` on read/update/delete; 400 `VALIDATION_FAILED` (`details.field = 'organizationId'`, same message as an unknown org) on create/move |

Overlap is checked inside the Command Bus transaction after a `select … for update` on the parent
`price_lists` row, so two concurrent creates on the same list serialise.

## 2. Unchanged entities this feature reads

| Entity | Owner | Read through | What for |
| --- | --- | --- | --- |
| `PriceList` | `price_lists` | own EM | list status, type, `isSystem` (Default reference), parent visibility |
| `PriceListPriceBracket` | `price_lists` | own EM | the list's own product candidate; percentage reference (own list, then Default) |
| Attribute view (`isPriceRule`, `valueType`, `languageScoped`, `channelScoped`, `options`) | `catalog` | `catalogAttributeReadPort` (`lazyPort`, new edge — `catalog` already a dependency) | eligibility at write and resolve |
| Product `attributeValues` | `catalog` | `PricedProductRef` (engine input) | attribute match |
| Product category assignments | `catalog` | `catalogCategoryReadPort.listAssignmentsForProducts` (already read) | category match |
| Organization chain | `organizations` | `organizationInheritancePort.priceListOrgChain` (already read) | organization rank |

## 3. Contracts (`packages/contracts/src/price-lists.ts`)

```ts
export const PRICE_MATRIX_MAX_ENTRIES_PER_LIST = 5000;

export const priceMatrixPriceTypeSchema = z.enum(['fixed', 'discount_percent']);
export const priceMatrixSelectionKindSchema =
  z.enum(['product', 'category_attribute', 'attribute', 'category', 'all']);

const PERCENT = z.string().regex(/^\d{1,3}(\.\d{1,2})?$/)          // refined: 0 < p <= 100
const ATTRIBUTE_KEY = z.string().min(1).max(64);
const ATTRIBUTE_VALUE = z.string().min(1).max(255);

// request body (create); PATCH is the same object with every field optional + the same refinements
// applied to the merged result in the service
export const priceMatrixEntryInputSchema = z.object({
  productId: uuidSchema.nullable().default(null),
  categoryId: uuidSchema.nullable().default(null),
  attribute: z.object({ key: ATTRIBUTE_KEY, value: ATTRIBUTE_VALUE }).nullable().default(null),
  organizationId: uuidSchema.nullable().default(null),
  minQuantity: POSITIVE_INT,
  maxQuantity: POSITIVE_INT.nullable().default(null),
  price: z.discriminatedUnion('type', [
    z.object({ type: z.literal('fixed'), amount: DECIMAL_STRING, currencyCode: CURRENCY }),
    z.object({ type: z.literal('discount_percent'), percent: PERCENT }),
  ]),
}).superRefine(/* the CHECK constraints of §1, each with its own issue path */);

export const priceMatrixEntrySchema = z.object({
  id: uuidSchema,
  priceListId: uuidSchema,
  selectionKind: priceMatrixSelectionKindSchema,
  productId: uuidSchema.nullable(),
  categoryId: uuidSchema.nullable(),
  attribute: z.object({ key: ATTRIBUTE_KEY, value: ATTRIBUTE_VALUE }).nullable(),
  organizationId: uuidSchema.nullable(),
  minQuantity: POSITIVE_INT,
  maxQuantity: POSITIVE_INT.nullable(),
  price: /* same union as input */,
  /** false ⇒ attribute no longer eligible (FR-010); always true for non-attribute entries */
  active: z.boolean(),
  inactiveReason: z.enum(['attribute_not_flagged', 'attribute_not_found',
    'attribute_language_scoped', 'attribute_channel_scoped', 'attribute_value_type']).nullable(),
  /** display labels resolved server-side so the table needs no N+1; a label is `null` and
   *  `targetDeleted` true when the product/category/organization no longer resolves as live
   *  (soft-deleted — the FK cascade only fires on a purge) */
  targetDeleted: z.boolean(),
  labels: z.object({
    product: z.object({ sku: z.string(), name: z.string() }).nullable(),
    category: z.string().nullable(),
    attribute: z.object({ label: z.string(), valueLabel: z.string() }).nullable(),
    organization: z.string().nullable(),
  }),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
```

Full HTTP shapes: `contracts/admin-price-matrix-api.md`. Resolution semantics:
`contracts/pricing-resolution-matrix.md`.

**Additive changes to existing internal shapes** (no published port signature changes):

- `PriceBracketRow` (`services/price-bracket-resolver.ts`) gains optional `matrixEntryId?: string`.
  A matrix-produced price travels through the engine as a synthesised row
  `{ priceListId, productId, currencyCode, minQuantity: entry.minQuantity, maxQuantity: entry.maxQuantity, amount, matrixEntryId }`,
  so `lineFromEngine`, `bracketStartQuantity` and the cache value shape keep working unchanged.
- `PricingLineResult` (`pricing-service.interface.ts`) gains optional `matrixEntryId?: string | null`.
  `LinePricePort` / `LinePriceResult` / `BuyerLinePriceAnswer` in contracts are **not** widened
  (D-77 reasoning in `OrgLinePricePort`'s comment: widening breaks structural stubs).
- The admin resolved-price probe response gains `matrixEntryId: string | null` (additive).

## 4. Why `attribute_key` has no foreign key

The attribute's identity is `custom_field_definitions` (owner `custom_fields`) joined to
`product_attributes` (owner `catalog`) — a key, not an id, is what `products.attribute_values` is
keyed by and what the promotions criterion stores. An FK would cross into `custom_fields`, a module
`price_lists` does not depend on, and an attribute deletion is already handled by FR-010 (inactive,
not an error). Entries on a deleted attribute stay visible as inactive so the operator can delete
them deliberately.

## 5. Read paths

| Path | Statement | When |
| --- | --- | --- |
| Resolver prefetch (per wave) | `select … from price_list_matrix_entries where price_list_id = any($lists) and (product_id is null or product_id = any($products)) and (organization_id is null or organization_id = any($chain))` | once per resolution wave (zero rows when the matrix is unused) |
| Reference brackets | `select … from price_list_price_brackets where price_list_id = $default and product_id = any($products) and currency_code = $cur` | only for products whose best percentage candidate has no own-list bracket |
| Eligible attributes | `catalogAttributeReadPort.listByFlag('isPriceRule')` | only when a prefetched entry has `attribute_key` |
| Tier ladder | `listBracketMinQuantities` ∪ `select distinct e.min_quantity from price_list_matrix_entries e join price_lists l on l.id = e.price_list_id where l.status = 'active' and (e.product_id is null or e.product_id = $p) and (e.currency_code is null or e.currency_code = $cur)` | per call, as today |
| Admin list | paginated `where price_list_id = $id [and selection filter] [and organization_id = $org]` + scope filter, `order by organization_id nulls first, selection specificity desc, min_quantity` | admin tab |

## 6. State

Entries have no lifecycle of their own; they are live whenever their list is `active` (or
`scheduled` → `active` by the existing status worker). `active`/`inactiveReason` in the DTO is
derived on read from attribute eligibility, never stored.

## 7. Migration

One migration in `packages/modules/price_lists/src/migrations/`, scaffolded with
`pnpm --filter backend run migration:new -- --module price_lists --name price_matrix_entries`
(the class tail begins with `PriceLists`). It creates the table, constraints and indexes above;
`down()` drops the table. Its FKs into `products`, `categories` and `organizations` are covered by
the existing `catalog` and `organizations` entries in the manifest `dependencies`
(`test/unit/db/fk-dependency-drift.test.ts`). No data backfill; no write to another module's table.
Register with `pnpm --filter backend run composer:generate`.
