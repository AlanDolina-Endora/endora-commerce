---
'@endora-commerce/mod-carts': minor
---

The basket belongs to the sales channel it is used on (`specs/154-sales-channel-access/`, User
Story 6). It used to be created on the system-default channel and priced there whatever
storefront it was used on.

- A customer holds one active basket per channel; every storefront cart route addresses the
  basket of the request's channel, and a line of another channel's basket answers 404.
- An anonymous cookie token whose basket is another channel's names no basket on this one: reads
  answer the empty cart, and the first write replaces the `b2b_cart_anon` cookie with a new token.
- Line prices, the "sold on request only" decision, the read-time recompute and the placement
  price check resolve on the basket's own channel; the system-default fallback is gone.
- Merge at sign-in merges the anonymous basket of the sign-in channel into the customer's basket
  of that channel; an anonymous basket of another channel is left alone (`noop_no_anon`).
- `cartPlacementApplyPort.readActiveForPlacement` reads the basket of `ctx.salesChannelId`.
- New migration `Migration20261019T043854CartsChannelBackfill` records baskets with no channel on
  the system-default channel.
- Composition-facing API: `CartService.getOrCreateForAnon(em, token, salesChannelId)` returns
  `Cart | null`; `CartService` methods take a `CartActor` whose customer context carries
  `salesChannelId`; `CartLinePricing.contextFor` takes `salesChannelId`;
  `CartShoppingListBridge.appendShoppingListToCart` receives `salesChannelId`.
