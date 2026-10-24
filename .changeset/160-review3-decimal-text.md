---
'@endora-commerce/contracts': minor
---

`decimalText(value)` is exported: a string trimmed, or a number as the shortest decimal that round-trips it (an exponent form read as an integer or at twelve places). `roundAmountHalfUp` and `grossAmountHalfUp` read their arguments through it instead of each carrying a copy, and `grossAmountHalfUp` takes an optional third argument, `'percent'` (the default) or `'fraction'`, so a rate such as `0.23` is read as written rather than shifted by hand. The storefront's gross derivation uses it and drops its own decimal-point shifting.
