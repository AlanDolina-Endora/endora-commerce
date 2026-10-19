---
'@endora-commerce/contracts': minor
---

Admin shapes for an Organization's sales channels and for creating an Organization
(`specs/154-sales-channel-access/`).

- `OrganizationSalesChannelsResponseSchema` — `GET`/`PUT /api/v1/admin/organizations/:id/sales-channels`:
  the assigned channel ids and every channel option, each `OrganizationSalesChannelOptionSchema`
  (`SalesChannelOptionSchema` plus `systemDefault`).
- `OrganizationSalesChannelsUpdateBodySchema` — `{ salesChannelIds }`, 1 to 100 distinct uuids.
- `OrganizationSalesChannelOptionsResponseSchema` — `GET /api/v1/admin/organizations/sales-channel-options`.
- `AdminOrganizationCreateBodySchema` — `POST /api/v1/admin/organizations`: the organization part of
  `registerOrganizationRequestSchema` plus `status` (`active` by default, or `pending_verification`)
  and `salesChannelIds` (at least one). `AdminOrganizationCreateRequest` is the body before defaults.
