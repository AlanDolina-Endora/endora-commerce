---
'@endora-commerce/mod-catalog': patch
---

A malformed cursor on a price-sorted product listing — a price that is not a four-place decimal, an id that is not a uuid, a date that does not parse — is discarded and the listing answers its first page, as the default listing does with a cursor it cannot read, instead of failing with a 500. A default-listing cursor naming an id that is not a uuid is discarded the same way.
