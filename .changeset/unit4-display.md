---
'@endora-commerce/mod-invoices': patch
'@endora-commerce/mod-carts': patch
'@endora-commerce/mod-customers': patch
'@endora-commerce/mod-comparisons': patch
'@endora-commerce/mod-crm': patch
'@endora-commerce/cms-components': minor
---

Unit prices are shown by the one rule of the owner ruling of 2026-10-25: two places when the third and fourth are zero, otherwise the significant places, up to four (`0,0125 zł`, `1,50 zł`, `1,505 zł`); line values and totals keep two.

- `@endora-commerce/mod-invoices`: the invoice PDF's unit net price column (new `unitMoney` beside `money` in the PDF sections), the admin invoice screen and the template preview.
- `@endora-commerce/mod-carts`, `@endora-commerce/mod-customers`: the admin cart and the customer's cart history.
- `@endora-commerce/mod-comparisons`: a compared product's price on the screen, the canvas and the PDF (`1.50 PLN`, `0.0125 PLN`), where it was rounded to two places.
- `@endora-commerce/mod-crm`: an Opportunity's value of a linked Quote Request adds the quote's line values, each rounded to the cent once, as the quote desk does; it rounded only the sum.
- `@endora-commerce/cms-components`: the CMS product card's price; the package now depends on `@endora-commerce/contracts` for the rule.
