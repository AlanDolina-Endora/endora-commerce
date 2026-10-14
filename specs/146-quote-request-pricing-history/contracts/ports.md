# Contract: in-process ports changed or added

Plain TypeScript in `packages/contracts/src/` (in-process calls, not an API boundary). Consumers
read them with `lazyPort<T>(ctx, 'literalName')`, `T` always the contract type
(`specs/conventions/module-composition.md` item 3).

## 1. `buyerLinePricePort` — new, owner `price_lists`

`packages/contracts/src/price-lists.ts`:

```ts
export interface BuyerLinePriceLine {
  /** Caller's correlation key, echoed back. */
  key: string;
  productId: string;
  variantId?: string | null;
  /** In the unit the line is expressed in — base pieces for every path today (research R2). */
  quantity: number;
}

export interface BuyerLinePriceQuery {
  buyer: { customerAccountId: string | null; organizationId: string | null };
  /** `null` = the system-default channel (requests raised before channel attribution). */
  salesChannelId: string | null;
  /** Absent = the channel's default currency. */
  currencyCode?: string;
  lines: readonly BuyerLinePriceLine[];
}

export interface BuyerLinePriceAnswer {
  key: string;
  /** `null` = nothing applies ("no price"), the resolver's own documented answer. */
  price: { amount: string; currency: string; isSale: boolean; priceListId: string } | null;
}

/**
 * Container name: `buyerLinePricePort`. Owner: `price_lists`.
 *
 * The net unit price a buyer would pay for each line on a normal order, on a given channel, now —
 * the question the admin resolved-price probe answers for one product, asked for many. One
 * implementation serves both, so a quote's "price at request" and its "current price" are the same
 * question at two moments (`specs/146-quote-request-pricing-history/research.md` R2).
 *
 * A product that does not exist answers `price: null` for its line rather than throwing; an unknown
 * `salesChannelId` throws `HttpError(400, VALIDATION_FAILED)`.
 *
 * **Owner off:** `price_lists` is `nonDeactivatable`; the gate is still the registration, so a
 * change to that throws `ModuleDisabledError` at the call site.
 */
export interface BuyerLinePricePort {
  resolveForBuyer(query: BuyerLinePriceQuery): Promise<BuyerLinePriceAnswer[]>;
}
```

Registered in `packages/modules/price_lists/src/backend/index.ts` with
`ctx.di.providePort<BuyerLinePricePort>('buyerLinePricePort', …)`. Customer group precedence:
the account's `customerGroupId`, else the organization's (unchanged from the probe).

Consumer: `quote_requests` (adds `price_lists` to its manifest `dependencies`).

## 2. `rfqService` (`RfqCustomerPort`) — one optional argument, owner `quote_requests`

`packages/contracts/src/quote-requests.ts`:

```ts
export interface CreateForCustomerOptions {
  /**
   * Server-side reference prices, index-aligned with `input.items`. Set only by an in-process
   * caller that holds a snapshot the buyer could not have forged — `carts`' conversion, whose cart
   * line price is the reference (FR-008). Unreachable from HTTP: the route parses its body with
   * `createQuoteRequestSchema`, which has no such field. `null` at an index = resolve that line.
   */
  lineReferencePrices?: ReadonlyArray<{ amount: string; currency: string } | null>;
}

export interface RfqCustomerPort {
  createForCustomer(
    ctx: RfqCustomerContext,
    input: CreateQuoteRequest,
    options?: CreateForCustomerOptions,
  ): Promise<QuoteRequest>;
  listForCustomer(ctx: RfqCustomerContext): Promise<QuoteRequestSummary[]>;
}
```

Optional and trailing: every existing caller (`orders`, `shopping_lists`, `quick_order`,
`customers`) compiles unchanged. A length mismatch with `input.items` is a programming error and
throws.

`listForCustomer`'s `totalAtCustomerPrice` changes **meaning, not shape** (FR-009): `null` unless
every line carries a proposal.

## 3. `carts` — conversion change (consumer side)

`packages/modules/carts/src/backend/services/cart-conversion-service.ts` `convertToQuoteRequest`:
stop sending `desiredUnitPrice`; pass
`{ lineReferencePrices: items.map((it) => ({ amount: it.unitPrice, currency: it.currency })) }`.
No manifest change: `carts` already resolves `rfqService`.

## 4. Unchanged, deliberately

- `QuoteRequestLineRecord` (`quoteRequestReadPort.listItems`) gains nothing: its readers
  (cart conversion back, `comarch_xl`) have no use for the reference, and the record is narrow on
  purpose. A cart-converted line's `desiredUnitPrice` is now `null`, which those readers already
  handle (it is nullable).
- `rfqDiffEntrySchema` / `RfqRevisionService.diffRevisions` (customer comparison) — research R6.
- `LinePricePort` / `OrgLinePricePort` — no new method; the new port is separate so no structural
  stub of the old ones breaks (the reason `OrgLinePricePort` extends rather than widens).
