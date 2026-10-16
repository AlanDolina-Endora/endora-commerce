---
'@endora-commerce/mod-admin-search': minor
---

New package `@endora-commerce/mod-admin-search` (module id `admin_search`): global search in the admin.

The module hosts the record-type registry other modules contribute to (`adminSearchProviderRegistry`,
typed by `AdminSearchProviderRegistryPort` in `@endora-commerce/contracts`) and serves:

- `GET /api/v1/admin/global-search/capability?language=` — the minimum search length, the per-type
  result count and the record types the caller may search right now;
- `GET /api/v1/admin/global-search?q=&entityTypes=&limit=&language=` — one group per record type, each
  searched in parallel with a 1.5 s deadline; a type that fails or is late is reported unavailable
  without failing the others;
- `GET`/`PUT /api/v1/admin/global-search/configuration` — which fields each record type is searched
  by, behind the new permission `admin_search:configure`.

It owns no table. Its settings are `admin_search.enabled` (the activation switch),
`admin_search.minimum_query_length` (2–10, default 3), `admin_search.results_per_entity` (1–10,
default 5) and the hidden `admin_search.entity_fields`. The admin layer adds `/global-search` (full
results) and `/global-search/configuration`, a System sidebar entry and two palette actions. An
instance gets record search by installing this package; without it every contribution is dropped and
the command palette keeps finding screens and actions only.
