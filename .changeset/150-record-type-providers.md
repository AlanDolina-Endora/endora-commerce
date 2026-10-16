---
'@endora-commerce/mod-orders': minor
'@endora-commerce/mod-quote-requests': minor
'@endora-commerce/mod-crm': minor
'@endora-commerce/mod-organizations': minor
'@endora-commerce/mod-customers': minor
'@endora-commerce/mod-catalog': minor
---

Each module contributes its record type to admin global search (`@endora-commerce/mod-admin-search`).

| Package | Record type | Fields offered (default in bold) | Permission |
| --- | --- | --- | --- |
| `mod-orders` | `orders.order` | **number**, **organizationName**, **customer**, billingCompanyName, billingTaxId | `orders:read` |
| `mod-quote-requests` | `quote_requests.quote_request` | **number**, **organizationName**, **customer**, customerNote | `rfqs:handle` |
| `mod-crm` | `crm.opportunity` | **number**, **title**, **organizationName**, description | `crm:read` |
| `mod-organizations` | `organizations.organization` | **name**, **taxId**, legalName | `customers:read` or `customers:manage` |
| `mod-customers` | `customers.customer` | **email**, **name** | `customers:read` |
| `mod-catalog` | `catalog.product`, `catalog.category` | **sku**, **name**, slug, quickSearchAttributes; **name**, **slug** | `catalog:read` |

Every provider applies its own admin list's visibility: sales representatives see only their
organizations' orders, quote requests, opportunities and customers; organizations follow the
Organizations list, with a representative's assigned organizations ranked first. Each module declares
a `contributes-to` edge on `adminSearchProviderRegistry`, so none of them depends on global search and
none loses its switch. `mod-quote-requests`, `mod-organizations`, `mod-customers` and `mod-catalog`
now declare `_i18n` in `dependencies` (status labels in the admin's language), and each module's
bundle gains `adminSearch.*` keys in English and Polish.
