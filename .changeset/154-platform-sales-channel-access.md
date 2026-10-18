---
'@endora-commerce/platform': minor
---

The sales-channel resolver now decides who may use the channel it resolved.

After a request's channel is resolved — by API-key binding, `X-Sales-Channel`, `?salesChannel=`,
the host map or the system-default fallback — an **anonymous** request is answered only on a
channel open to anonymous visitors, and a **customer** request (impersonation included) only on a
channel assigned to the customer's Organization in `sales_channel_organizations`. Refusals are 403
`SALES_CHANNEL_SIGN_IN_REQUIRED` / `SALES_CHANNEL_NOT_PERMITTED` with `details.channelCode`.
Administrator and API-key requests and every `/api/v1/admin/*` path are not decided.

**Module authors: a route a visitor must reach before signing in, or that is called with no
storefront channel at all, must declare `config: { salesChannelAccess: 'open' }`.** That covers
sign-in, registration and account-recovery routes, e-mail links, feed downloads and — the case
easy to miss — **payment-provider and carrier callbacks**: they arrive anonymously with no channel
signal, resolve to the system-default channel, and are refused when an operator closes that
channel. The option is typed on Fastify's `FastifyContextConfig` through the `./http` barrel; an
open route is still resolved (an unknown channel still answers 400) and keeps its own guards.

New on `./kernel`:

- `SalesChannelAccessPort` — `decide(actor, channel)`, `permittedChannelIds(organizationId)` and
  `assertCustomerMayUse(organizationId, channelId)` (throws the 403 refusal), registered by both
  composition roots as `salesChannelAccessPort` for sign-in paths that must decide before a session
  exists.
- `SalesChannelAccessCacheInvalidation` — the invalidating half of the per-Organization
  permitted-channel cache (`salesChannelAccessCache`): a per-process LRU (30 s) over Redis, dropped
  by the membership writer as part of every change of an Organization's channels and announced on
  `b2b:sales-channel-access:changed`, so every process follows within the LRU window.

Also:

- `SalesChannel` gains `anonymousAccess` (column `sales_channels.anonymous_access`, default `true`,
  core migration `Migration20261018T101912CoreSalesChannelsAnonymousAccess`); the cached channel
  carries it and the channel cache key moves to `sales-channels:v3:`. The default channel the
  reconciler creates is open.
- `MembershipMutationOptions` gains `em`: the bridge statements run on that `EntityManager`, so a
  caller can bind channels inside the transaction that creates the entity.
- The OpenAPI document carries the two refusals as shared response components
  (`SalesChannelSignInRequired`, `SalesChannelNotPermitted`); `GET /api/v1/storefront/module-presence`
  and the OpenAPI routes are open.
