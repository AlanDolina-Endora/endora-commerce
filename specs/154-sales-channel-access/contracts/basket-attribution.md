# Contract: basket attribution to the request channel

Owner `carts` (with the placement half in `orders`). Rationale: [research.md](../research.md) R-13.

## §1 Which basket a request addresses

| Caller | Basket |
| --- | --- |
| Customer, storefront route | `(customerAccountId, salesChannelId = getResolvedChannel().id, status='active')`; created on first write |
| Anonymous, storefront route | `(anonymousCartToken, salesChannelId = request channel, status='active')`; a token whose active basket is on another channel is "no basket"; the first write mints a new token and replaces the `b2b_cart_anon` cookie |
| Admin order creation on a customer's behalf | the explicit `salesChannelId` it already passes (unchanged contract) |
| In-process callers of the cart ports (`quick_order`, `shopping_lists`, cart → quote conversion, quote → cart) | `CartCustomerContext.salesChannelId`, which each passes from its own request channel |

`CartService.#defaultSalesChannelId` is deleted; no path creates a basket on the system default unless
the request is on it.

## §2 Pricing

Line unit price, the quote-only decision (`displayMode === 'none'`), coupon/promotion evaluation and
the recompute all resolve for `cart.salesChannelId`:

- with PR #345 merged: `CartLinePricing.contextFor(em, { organizationId, signedIn, salesChannelId })`
  loads `SalesChannel` by id (`fields: ['id','defaultCurrency']`); `CartPlacementApplyService
  .#currentPrices` passes the basket's channel;
- `CartPricingRecompute.loadChannel` already uses the basket's channel; its system-default fallback
  becomes unreachable and is removed with a test proving a null channel no longer occurs.

## §3 Merge at sign-in

`mergeAnonymousIntoCustomer(token, ctx)` with `ctx.salesChannelId` = the login request's channel: the
source is `(token, ctx.salesChannelId)`; the destination is the customer's basket on the same channel.
An anonymous basket on another channel is untouched and the outcome is `noop_no_anon` (the
`CartMergeOutcome` vocabulary is unchanged). Runs only after a permitted sign-in (a refused sign-in
returns before `onLogin`).

## §4 Placement

`CartPlacementApplyPort.readActiveForPlacement(em, ctx)` reads `(customer, ctx.salesChannelId)`.
`OrderService.placeOrder`, before the #345 drift check:

```ts
if (cart.salesChannelId !== placement.salesChannelId) {
  throw new HttpError(422, ERROR_CODES.ORDER_SALES_CHANNEL_MISMATCH,
    'The basket belongs to a different sales channel than this order.',
    { cartSalesChannelId: cart.salesChannelId, requestSalesChannelId: placement.salesChannelId });
}
```

Inside the placement transaction, before anything is reserved or written; the basket survives. Never
reprices.

## §5 Data

M3 of [data-model.md](../data-model.md): baskets with no channel are recorded on the system default.

## §6 Tests

- Unit (`carts/src/backend/services/cart-service.test.ts` additions): lookup keys per caller, token
  minting on cross-channel token, no default fallback.
- Integration (`backend/test/integration/carts/cart-channel-attribution.test.ts`): two channels with
  different price lists — add on A and on B → two baskets, prices per channel; quote-only per channel;
  merge on login same/other channel.
- Integration (`backend/test/integration/orders/place-order-cart-channel.test.ts`): placement on B uses
  B's basket and B's prices; a forced mismatch → 422, nothing written, basket kept; #345 drift check
  priced on B (red if `contextFor` falls back to the default).
- Contract (`backend/test/contract/carts/cart-channel.contract.test.ts`): HTTP behaviour of §1.
