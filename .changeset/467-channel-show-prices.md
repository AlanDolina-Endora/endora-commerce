---
'@endora-commerce/contracts': minor
'@endora-commerce/mod-sales-channels': minor
---

A sales channel's **Show prices** setting (`isPublic`) can be set from the admin and the admin API (issue #467). Until now a new channel always got `isPublic: false` and the only way to show prices was a direct SQL update.

- `@endora-commerce/contracts`: `SalesChannelCreateBodySchema` accepts an optional `isPublic` (defaults to `false`, the previous behaviour) and `SalesChannelUpdateBodySchema` an optional `isPublic`. `SalesChannelSummarySchema` and `SalesChannelDetailSchema` now **require** `isPublic: boolean`, so code that builds a `SalesChannelSummary` or `SalesChannelDetail` by hand — test fixtures included — must add it. `PublicSalesChannelSchema` is unchanged.
- `@endora-commerce/mod-sales-channels`: `POST` and `PATCH /api/v1/admin/sales-channels` write `isPublic`, and every admin channel response carries it. A change is audited in the `sales_channel.identity.changed` row's before/after state and drops the cached channel (in-process and Redis), so it applies from the next request without a restart. The channel form has a **Show prices** checkbox next to **Open to anonymous visitors**. Off withholds prices on the channel from every viewer, signed-in customers included — the form's hint and the module documentation say so; the previous hint's reference to "showing prices to anonymous visitors" is corrected.
