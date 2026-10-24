---
'@endora-commerce/mod-product-feeds': minor
'@endora-commerce/mod-quote-requests': patch
'@endora-commerce/mod-comparisons': patch
---

A resolver amount stays the decimal string `price_lists` answers with until it is rounded, and it is rounded only by the decimal helpers (`roundAmountHalfUp`, `grossAmountHalfUp`).

- **`@endora-commerce/mod-product-feeds`.** The feed's price ports carry decimal strings: `NamedListPriceResolver` and `SelectionPricePort` answer `Map<string, string>` (was `Map<string, number>`), `AnonymousPriceResolver` answers `{ amount: string; isSale }`, `NamedListPriceResolvers.one` answers `string | null`, and `FeedItemPrice.net` / `.gross` are strings (`gross` already rounded to two places). A custom item-field resolver or a decoration of these ports reads strings now; the file's figures do not change.
- **`@endora-commerce/mod-quote-requests`.** A quote line's reference price is rounded from the resolver's decimal string, not from a JS number; anything but a non-negative decimal stores no reference.
- **`@endora-commerce/mod-comparisons`.** The comparison PDF, its document table block and the admin comparison screen write a price at two places, half-up: a price of 9.0450 was shown as `9.045 PLN`, and 1900 as `1900 PLN`.
