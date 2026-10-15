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
  /** In base pieces, the unit every quote line's quantity is in (spec Edge Cases, 12efc10ac).
   *  The caller never multiplies by a packaging unit's base quantity (T6). */
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

The implementation resolves in bounded chunks (one load of products, customer, organization and
channel per chunk) and callers send lines in chunks (T11). The port performs **no authority
check** — its caller passes the owner of a quote request it already authorised; the HTTP probe,
which serves arbitrary admin input, carries the sales-representative scope check (T8,
`admin-quote-request-api.md` §4).

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
`customers`) compiles unchanged. Validated before any write, each violation a programming error
that throws (T6):

- array length equal to `input.items.length`;
- each non-`null` entry: `amount` a finite decimal string ≥ 0 with at most two decimals;
  `currency` matching `/^[A-Z]{3}$/`.

The HTTP body cannot reach this argument: `createQuoteRequestSchema` is **not** strict and strips a
body `lineReferencePrices` or per-line `referenceUnitPrice` (they are ignored, not refused — M4);
`patchQuoteRequestSchema` is already strict and refuses them. Neither schema's strictness changes.
Both schemas' `items` gain `.max(200)` (T11, additive).

`listForCustomer`'s `totalAtCustomerPrice` changes **meaning, not shape** (FR-009): `null` unless
every line carries a proposal.

## 3. `carts` — conversion change (consumer side)

`packages/modules/carts/src/backend/services/cart-conversion-service.ts` `convertToQuoteRequest`:
stop sending `desiredUnitPrice`; pass
`{ lineReferencePrices: items.map((it) => ({ amount: it.unitPrice, currency: it.currency })) }`.
No manifest change: `carts` already resolves `rfqService`.

**Basis (T12)**: `CartItem.unitPrice` is the **net** unit price per base piece (the cart's own
snapshot, the same basis as `desiredUnitPrice` / `agreedUnitPrice` on a quote line), which is what
the reference is compared against. A cart line priced per packaging unit stores its quantity in
base pieces and its unit price per base piece (`cart-service.ts` `effectiveQuantity`).

## 4. Unchanged, deliberately

- *(moved to §5 — `QuoteRequestLineRecord` is no longer unchanged.)*

## 5. `quoteRequestReadPort` (`QuoteRequestLineRecord`) — two optional fields, owner `quote_requests`

Owner decision, option (b). A cart-converted line's `desiredUnitPrice` becomes `null` (FR-008); the
ERP / connector readers (`comarch_xl`, and anything reading `listItems`) used to find the cart price
there. The record gains, additively:

```ts
export interface QuoteRequestLineRecord {
  // … existing fields unchanged …
  /** The stored at-request reference unit price (net, per base piece), decimal string; `null` when
   *  none is stored. For a cart-converted line this is the cart's unit price (FR-008) — read it
   *  here, not from `desiredUnitPrice`, which is now `null` on those lines. */
  referenceUnitPrice?: string | null;
  /** Currency of `referenceUnitPrice`; `null` exactly when it is `null`. */
  referenceCurrency?: string | null;
}
```

Populated by `quote_requests/src/backend/services/quote-request-read-port.ts` `listItems` (the one
place the record is built) from the item's reference columns. Optional, so every structural stub
of the port compiles unchanged. The quote → cart conversion still ignores money fields (it
re-resolves prices, FR-017 of feature 075); the record's doc comment is updated to say the new
fields are for export readers. Tests: contract-level in `packages/contracts/src/quote-requests.test.ts`
(T003), `[PG]` in `cart-conversion-reference.test.ts` (T028).
- `rfqDiffEntrySchema` / `RfqRevisionService.diffRevisions` (customer comparison) — research R6.
- `LinePricePort` / `OrgLinePricePort` — no new method; the new port is separate so no structural
  stub of the old ones breaks (the reason `OrgLinePricePort` extends rather than widens).
