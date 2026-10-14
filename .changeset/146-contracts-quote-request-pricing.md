---
'@endora-commerce/contracts': minor
---

New quote-request shapes for reference prices, a readable history and a per-customer price negotiation lock. Everything is additive; existing callers and structural stubs compile unchanged.

- **Quote request items** (`quoteRequestItemSchema`) gain optional `referencePrice` (`{ amount, currency, capturedAt } | null`), `customerProposedUnitPrice`, `packagingUnitName` and `packagingUnitBaseQuantity`. `referencePrice` and `customerProposedUnitPrice` are sent in admin replies only; `quoteRequestSchema` likewise gains an admin-only optional `salesChannelId`.
- **History**: `quoteRequestHistorySchema` (`{ entries, truncated }`), `quoteRequestHistoryEntrySchema`, `quoteRequestHistoryEntryKindSchema`, `quoteRequestHistoryChangeSchema`, `quoteRequestHistoryActorSchema`, `quoteRequestHistoryLineRefSchema` and their types, for `GET /api/v1/admin/quote-requests/:id/history`.
- **Price negotiation**: `quoteRequestOrgNegotiationSchema`, `setQuoteRequestOrgNegotiationSchema`, `quoteRequestNegotiationOverrideSchema` (`'inherit' | 'allowed' | 'not_allowed'`), `quoteRequestAccountNegotiationSchema`, `setQuoteRequestAccountNegotiationSchema` and `storefrontQuoteRequestNegotiationSchema`, with their types. The two `set*` admin bodies are strict.
- **Error code** `RFQ_PRICE_PROPOSAL_NOT_ALLOWED` in `ERROR_CODES`.
- **`QuoteRequestLineRecord`** gains optional `referenceUnitPrice` and `referenceCurrency` (decimal string and ISO code, both `null` when no reference is stored). Export readers of `quoteRequestReadPort.listItems` should read a cart-converted line's price from `referenceUnitPrice`: those lines now carry `desiredUnitPrice = null`.
- **`RfqCustomerPort.createForCustomer`** takes an optional third argument, `CreateForCustomerOptions` (`{ lineReferencePrices? }`): server-side reference prices index-aligned with `input.items`, for in-process callers that hold a snapshot the buyer could not have forged. Two-argument callers and implementations stay valid.
- **`BuyerLinePricePort`** with `BuyerLinePriceQuery`, `BuyerLinePriceLine` and `BuyerLinePriceAnswer`: the net unit price a buyer would pay for many lines on a given sales channel. A new port, so `LinePricePort` and its stubs are unchanged.
- **`createQuoteRequestSchema` and `patchQuoteRequestSchema`** accept at most 200 `items`; a longer list fails validation. Their strictness is unchanged — an unknown key in the create body is still stripped.
