---
'@endora-commerce/admin-kit': minor
---

`formatMoney(amount, currency, locale?, options?)` takes `{ unitPrice: true }` for a unit price (owner ruling of 2026-10-25): two places when its third and fourth are zero, otherwise its significant places, up to four (`0,0125 zł`, `1,50 zł`, `1,505 zł`), by `unitPriceFractionDigits` from `@endora-commerce/contracts`. An amount (a line value, a total) still shows two. New exported type `FormatMoneyOptions`.
