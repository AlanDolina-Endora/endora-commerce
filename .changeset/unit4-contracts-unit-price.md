---
'@endora-commerce/contracts': minor
'@endora-commerce/platform': minor
'@endora-commerce/mod-i18n': minor
---

A unit price keeps up to four decimal places, unrounded, from the price book to the invoice line; only the line value is rounded (owner ruling of 2026-10-25).

- `@endora-commerce/contracts`: new `unitPriceHalfUp(value)` (a unit price at its four places, as `numeric(14,4)` stores it), `unitPriceFractionDigits(value)` and `unitPriceDisplayText(value)` (the one display rule: two places when places three and four are zero, otherwise the significant places, up to four), `grossUnitPriceHalfUp(net, rate, unit?)` (a displayed gross unit price: two places for a two-place net, four for a sub-cent one) and `UNIT_PRICE_PLACES`. In `money-input`: `fourDecimalUnitPrice(schema)`, `fourDecimalUnitPriceString(schema)`, `hasAtMostFourDecimals(value)`, `isUnitPricePrecisionIssue(issue)` and the `UNIT_PRICE_PRECISION_EXCEEDED` constant; new `ERROR_CODES.UNIT_PRICE_PRECISION_EXCEEDED`. A quote's `desiredUnitPrice` (`createQuoteRequestLineSchema`) and `agreedUnitPrice` (`adminCreateQuoteRequestLineSchema`, `adminPatchQuoteRequestLineSchema`) now accept four places; a fifth is refused with the new code. Typed money amounts keep `twoDecimalAmount`.
- `@endora-commerce/platform`: the error envelope answers `400 UNIT_PRICE_PRECISION_EXCEEDED` when every failed issue of a request is the unit-price precision issue; a request refused for an amount and a unit price at once stays `VALIDATION_FAILED`.
- `@endora-commerce/mod-i18n`: declares `UNIT_PRICE_PRECISION_EXCEEDED` in the platform block, with its sentence in English and Polish.
