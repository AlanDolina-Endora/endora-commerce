---
'@endora-commerce/mod-price-lists': patch
---

Every array `price_lists` binds to a statement now goes through one helper that quotes and escapes each element.

The price surface built the text array of an attribute change by hand and escaped `"` but not `\`, so an attribute key holding a backslash was read as another key (its rows marked nothing), and one ending in a backslash made the literal malformed, so the marking failed and fell back to marking every profile stale — a full rebuild. The uuid, numeric and text arrays of the module (the engine, the surface, its marking, the book reads and writes, the representative scope and the list-read port) are now built by `pgArray`, which double-quotes every element, escapes `\` and `"`, and writes `null` as `NULL`; the three private copies of `uuidArray` and two of the text-array helper are gone.
