---
'@endora-commerce/mod-orders': patch
'@endora-commerce/mod-i18n': patch
---

**Create order** shows **Items** and **Order summary** only once both the customer and the sales
channel are chosen — the two inputs pricing needs; payment method, delivery method and addresses
do not gate them. Until then one hint names what is missing. The summary still appears only after
the first priced line. Clearing either field hides both sections without discarding the lines,
which come back when the field is set again and still count as unsaved work for the
leave-the-page prompt. A page opened with `customerAccountId` and `salesChannelId` in the query
string shows **Items** at once.

The `core` bundle gains `orderCreate.gate.missingCustomer`, `orderCreate.gate.missingChannel` and
`orderCreate.gate.missingBoth` in English and Polish. No existing key changes.
