---
'@endora-commerce/mod-quote-requests': minor
---

A per-customer **price negotiation lock**. An administrator decides whether customers may propose prices on quote requests — on the organization (allowed by default) and, as an override, on a customer account (*as organization*, *allowed*, *not allowed*). The effective value is the account's override, else the organization's value, else allowed.

- **Admin API**: `GET` / `PUT /api/v1/admin/organizations/:id/quote-price-negotiation` and `GET` / `PUT /api/v1/admin/customers/:id/quote-price-negotiation`. Reading follows `customers:read`, writing needs `customers:manage`; a sales representative reaches only organizations they may see (`404` otherwise). Every change is an audited Command with the old and new value.
- **Admin UI**: panels on the organization and customer screens, shown to roles with `customers:read`; the control is disabled without `customers:manage`. A role with `customers:manage` but not `customers:read` sees no panel.
- **Storefront API**: `GET /api/v1/quote-requests/price-negotiation` answers the signed-in customer's own effective value (`{ priceProposalsAllowed }`) and nothing else.
- **Enforcement**: a customer create or draft edit whose lines carry a proposed price — `0` included — while the request owner's value is *not allowed* is refused with `422 RFQ_PRICE_PROPOSAL_NOT_ALLOWED` (translated) and writes nothing. The lock binds the request's **owner**, not the acting user: an organization administrator editing a colleague's draft is judged by the colleague's value. Cart conversion and resubmission carry no proposal and keep working. The seller's side and proposals already stored are not affected.
- While the module is switched off, the panels, the routes and the enforcement are absent; stored values are kept and apply again when it is switched back on.
