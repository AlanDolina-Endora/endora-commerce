---
'@endora-commerce/mod-orders': minor
---

`orderReadPort` implements `findStatusDefinition(code)`: the configured order status with that
code — its per-language names and default name — or `null` for an unknown code. Consumers use it
to label a status the way the shop does.
