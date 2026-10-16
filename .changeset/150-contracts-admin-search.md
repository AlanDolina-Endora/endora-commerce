---
'@endora-commerce/contracts': minor
---

New `admin-search` exports for admin global search, and two optional criteria on the customer admin search.

- Schemas: `AdminSearchEntityTypeSchema`, `AdminSearchFieldCodeSchema`, `AdminSearchLabelKeySchema`,
  `AdminSearchQuerySchema`, `AdminSearchHitSchema`, `AdminSearchTargetRouteSchema`,
  `AdminSearchGroupSchema`, `AdminSearchResultSchema`, `AdminSearchResponseSchema`,
  `AdminSearchCapabilitySchema`, `AdminSearchCapabilityQuerySchema`,
  `AdminSearchConfigurationViewSchema`, `UpdateAdminSearchConfigurationRequestSchema`,
  `AdminSearchStoredConfigurationSchema` and their inferred types, plus
  `ADMIN_SEARCH_DEFAULT_STORED_CONFIGURATION` and the limits `ADMIN_SEARCH_MAX_FIELDS`,
  `ADMIN_SEARCH_MAX_ENTITY_TYPES`, `ADMIN_SEARCH_MAX_QUERY_LENGTH`, `ADMIN_SEARCH_MAX_LIMIT`.
- Provider contract: `AdminSearchProvider`, `AdminSearchFieldDescriptor`, `AdminSearchProviderQuery`,
  `AdminSearchProviderHit`, `AdminSearchProviderResult`, `AdminSearchAbortSignal` and
  `AdminSearchProviderRegistryPort` (container name `adminSearchProviderRegistry`, owner
  `admin_search`). A module makes its records findable by pushing a provider into that registry from a
  contribution-only boot hook.
- `CustomerAccountAdminSearchCriteria` gains `qFields?: ('email' | 'name')[]` — match `q` only against
  those fields, literally, most relevant first — and `excludeDeleted?: boolean` — leave out deleted and
  anonymized accounts. Both are optional; a caller that sets neither gets exactly what it got before.
