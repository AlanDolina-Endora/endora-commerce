---
'@endora-commerce/mod-organizations': minor
---

Operators manage which sales channels an Organization's members may use.

- `GET`/`PUT /api/v1/admin/organizations/:id/sales-channels` (read with `customers:read` or
  `customers:manage`, write with `customers:manage`) answer the assignment with every channel option
  and replace the whole set through the kernel membership writer: one audit row per channel added or
  removed, the access cache dropped, the same set again a no-op. An id naming no channel is refused
  with 422 `VALIDATION_FAILED` on `salesChannelIds.<i>`.
- `POST /api/v1/admin/organizations` (`customers:manage`) creates an Organization through the
  Command `organization.create` and assigns its channels in the same transaction; a duplicate tax id
  is refused with 409 `ORGANIZATION_TAX_ID_EXISTS`, as in registration.
  `GET /api/v1/admin/organizations/sales-channel-options` lists what the form chooses from.
- Admin: a *Sales channels* panel on the Organization page (read-only without `customers:manage`),
  a *New organization* screen at `/organizations/new` with a button on the roster, and the palette
  action `new-organization`.
- `OrganizationsModuleOptions.salesChannelMembership` now also takes `replaceChannelsForEntity` and
  `listChannelsForEntity`.
