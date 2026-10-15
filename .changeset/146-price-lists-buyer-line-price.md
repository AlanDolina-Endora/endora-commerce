---
'@endora-commerce/mod-price-lists': minor
---

New `buyerLinePricePort` (container name; type `BuyerLinePricePort` in `@endora-commerce/contracts`): `resolveForBuyer({ buyer, salesChannelId, currencyCode?, lines })` answers, per line, the net unit price a buyer would pay on a normal order on that sales channel now — the account's customer group before the organization's, quantity brackets and active sale prices included. `salesChannelId: null` is the system default channel; a product that does not exist answers `price: null`; an unknown channel throws `400 VALIDATION_FAILED`. Lines are resolved in bounded chunks. The port carries no authority check — the caller passes a buyer it has already authorised — but a `customerAccountId` named together with an `organizationId` it does not belong to throws `400 VALIDATION_FAILED`.

The admin probe `GET /api/v1/admin/products/:id/resolved-price` is served by the same implementation and accepts a new `salesChannelId` query parameter (absent = system default channel; an unknown or malformed id is `400 VALIDATION_FAILED`, without echoing the id).
