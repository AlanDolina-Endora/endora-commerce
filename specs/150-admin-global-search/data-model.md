# Data Model: Admin global search

**Feature**: `specs/150-admin-global-search/` | **Date**: 2026-10-16

**No table, no column, no migration.** Configuration is three rows in the existing `settings`
store owned by `admin_search` (plus its activation row); providers are in-memory descriptors built
at boot; results are computed per request from the owners' existing tables (research R-3, R-5).

## 1. Settings owned by `admin_search`

Declared in `packages/modules/admin_search/src/manifest.ts`, group `admin_search` ("Global search").
All platform-wide (no `salesChannelCodes`).

| Code | Value type | Default | Visible on Settings screen | Validated by |
| --- | --- | --- | --- | --- |
| `admin_search.enabled` | `boolean` | `true` | yes (activation control, rendered on `/platform/modules`) | platform |
| `admin_search.minimum_query_length` | `number` | `3` | yes | `admin_search` validator: integer 2–10 |
| `admin_search.results_per_entity` | `number` | `5` | yes | `admin_search` validator: integer 1–10 |
| `admin_search.entity_fields` | `json` | `{"version":1,"entities":{}}` | **no** (`hidden: true`; edited on `/global-search/configuration`) | `admin_search` validator: §2 rules |

### 2. `admin_search.entity_fields` — the stored value

```ts
// packages/contracts/src/admin-search.ts
export const AdminSearchStoredConfigurationSchema = z.object({
  version: z.literal(1),
  entities: z.record(
    AdminSearchEntityTypeSchema,          // '<moduleId>.<snake_name>', e.g. 'orders.order'
    z.object({
      enabled: z.boolean(),
      fields: z.array(AdminSearchFieldCodeSchema).max(20), // camelCase codes
    }),
  ),
});
```

Rules (enforced on write by the route and by the `SettingWriteValidator`, research R-6):

- `fields` has no duplicates.
- For an entity type whose provider is **present**: every code is in the provider's offer; when
  `enabled` is `true`, `fields` is non-empty.
- An entity type whose provider is **absent** (module off or uninstalled) is accepted as stored and
  never validated against an offer it cannot see — it is the operator's configuration, kept for when
  the module returns (FR-027). The route's save **preserves** such entries: it merges the submitted
  present-provider entries over the stored value and never drops an absent one.
- Value size bound: 64 entity types × 20 fields; larger is refused.

### 3. Effective configuration (resolution on read)

For each **present** provider `p`:

```text
stored = value.entities[p.entityType]
if stored is undefined           → enabled = true,  fields = p.defaults
else
  fields' = stored.fields ∩ p.offer (in p.offer order)
  if fields' is empty            → fields = p.defaults           (offer shrank under the value)
  else                           → fields = fields'
  enabled = stored.enabled
```

`p.defaults` = the offer's entries with `defaultSelected: true` (registry guarantees ≥ 1).
"Restore defaults" in the UI removes the type's entry from the submitted value.

## 4. Provider descriptor (in-memory, not persisted)

```ts
// packages/contracts/src/admin-search.ts — full text in contracts/provider-contract.md
interface AdminSearchProvider {
  entityType: string;              // '<moduleId>.<snake_name>', unique
  moduleId: string;                // the contributing module; presence is keyed on it
  labelKey: string;                // group title, relative to the module's i18n namespace
  icon: KnownIconName;
  requiredPermission: PermissionRequirement; // string or any-of array
  weight: number;                  // group order (lower first)
  fields: readonly AdminSearchFieldDescriptor[];
  search(query: AdminSearchProviderQuery): Promise<AdminSearchProviderResult>;
}
interface AdminSearchFieldDescriptor {
  code: string;                    // camelCase, unique within the provider
  labelKey: string;                // relative to the module's namespace
  defaultSelected: boolean;
  identifier: boolean;             // exact/prefix ranking (research R-9)
}
```

Registry invariants, checked at `register()` (a violation throws during the boot hook and names the
module): `entityType` matches `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$` and starts with `moduleId + '.'`;
no duplicate `entityType`; 1–20 fields; unique codes matching `^[a-z][a-zA-Z0-9]*$`; ≥ 1
`defaultSelected`; `labelKey`s match the translation-key grammar of
`packages/contracts/src/admin-contributions.ts`.

## 5. The seven providers

Weights fix the group order of FR-003. "Column / source" is the owner's own data; nothing crosses a
module boundary except through the named port.

| Entity type | Owner | Permission | Weight | Field code → column / source (✓ default, ★ identifier) | Opens | Primary / secondary / status |
| --- | --- | --- | --- | --- | --- | --- |
| `orders.order` | `orders` | `orders:read` | 100 | `number` ✓★ → `orders.business_id`; `organizationName` ✓ → `organizationDetailsPort.searchIdsByName` → `organization_id in`; `customer` ✓ → `customerAccountReadPort.searchIdsByName` → `placed_by_customer_account_id in`; `billingCompanyName` → `billing_address->>'companyName'`; `billingTaxId` ★ → `billing_address->>'taxId'` | `/orders/:id` | business id / organization name · placed date · total currency / status name (localized) |
| `quote_requests.quote_request` | `quote_requests` | `rfqs:handle` | 200 | `number` ✓★ → `quote_requests.business_id`; `organizationName` ✓ → org port; `customer` ✓ → customer port → `customer_account_id in`; `customerNote` → `header_note` | `/quote-requests/:id` | business id / organization name · submitted date / status |
| `crm.opportunity` | `crm` | `crm:read` | 300 | `number` ✓★ → `crm_opportunities.number`; `title` ✓ → `title`; `organizationName` ✓ → org port; `description` → `description` | `/crm/opportunities/:id` | number · title / organization name / status name |
| `organizations.organization` | `organizations` | `['customers:read','customers:manage']` | 400 | `name` ✓ → `name_search` (folded); `taxId` ✓★ → `tax_id`; `legalName` → `legal_name` | `/organizations/:id` | name / tax ID · city / status — visibility of the Organizations list (not scope-limited, owner Q2); assigned organizations ranked first for a scoped admin (FR-015a) |
| `customers.customer` | `customers` | `customers:read` | 500 | `email` ✓★ and `name` ✓ (first + last) → `customerAccountAdminSearchPort.search({ q, qFields, excludeDeleted: true, allowedOrganizationIds, pageSize })` | `/customers/:id` | full name / e-mail · organization name / status |
| `catalog.product` | `catalog` | `catalog:read` | 600 | `sku` ✓★ → `products.sku`; `name` ✓ → `name::text`; `slug` ★ → `slug`; `quickSearchAttributes` → `attribute_values->>key` for each `quickSearchable` attribute | `/catalog/products/:id` | name (admin language) / SKU · type / status |
| `catalog.category` | `catalog` | `catalog:read` | 700 | `name` ✓ → `name::text`; `slug` ✓★ → `slug` | `/catalog/categories?focus=:id` | name / parent path / — |

Common to all: `deleted_at is null` where the column exists; UUID text adds `or id = :text`
(FR-010); `limit + 1` rows; order by identifier rank then `updated_at desc`, then `id` (stable).
Organization excludes `is_personal`; Customer excludes `deleted`/anonymized via `excludeDeleted`. Scope
per research R-4 — Organization is not scope-limited but orders `id in (assigned)` first (owner Q2).

## 6. Transport shapes (summary — full schemas in `contracts/admin-search-api.md`)

- **Query** `{ q: string(1..100), entityTypes?: string[], limit?: 1..25, language: 'en'|'pl' }`
- **Group** `{ entityType, label, icon, status: 'ok'|'timed_out'|'failed', hits: Hit[], hasMore }`
- **Hit** `{ id, title, subtitle: string|null, status: { code, label }|null, targetRoute }`
- **Configuration view** `{ version, minimumQueryLength, resultsPerEntity, entities: [{ entityType, label, enabled, fields: [{ code, label, selected, defaultSelected }] }] }`

## 7. State and lifecycle

No state machine. The only lifecycle facts:

| Event | Effect |
| --- | --- |
| `admin_search` switched off | endpoints 503 `MODULE_DISABLED`; palette hides records; settings not writable; values kept |
| `admin_search` uninstalled (soft) | the orchestrator's settings sweep removes its settings; re-install starts from defaults (module-activation.md, "the two differ on the operator's activation choice") |
| A provider's module switched off | its provider is not enumerated; its stored entry kept |
| A provider's module not installed in an instance | its boot-hook push is dropped by the platform (`contribution-sinks.ts`); nothing to configure |
| `admin_search` not installed, providers are | every push is dropped; providers' modules run unchanged |
