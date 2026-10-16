---
'@endora-commerce/mod-catalog': minor
---

`catalogProductReadPort` implements `listProductIdsByAttributeValue({ key, value, match })`: the ids
of products whose own attribute value equals `value` (`scalar`), contains it (`array`) or is the
boolean it names (`boolean`), structurally — soft-deleted and inactive products included, like
`listProductIdsInCategory`. The *Attributes* documentation now describes what the *Price list
rules* flag does: it lets an attribute select products in a price list's price matrix.
