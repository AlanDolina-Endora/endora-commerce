---
'@endora-commerce/contracts': minor
---

Sales-channel access shapes (`specs/154-sales-channel-access/`).

- `SalesChannelSummarySchema` / `SalesChannelDetailSchema` gain a required `anonymousAccess`;
  `SalesChannelCreateBodySchema` accepts it (default `true`) and `SalesChannelUpdateBodySchema`
  accepts it optionally. `SalesChannelCreateRequest` is the body a client sends before defaults
  apply.
- `PublicSalesChannelSchema` gains `anonymousAccess`.
- New `SalesChannelAccessResponseSchema` for `GET /api/v1/storefront/sales-channel/access`.
- `ERROR_CODES` gains `SALES_CHANNEL_SIGN_IN_REQUIRED`, `SALES_CHANNEL_NOT_PERMITTED` and
  `ORDER_SALES_CHANNEL_MISMATCH`.
- `CartCustomerContext` gains an optional `salesChannelId`.
