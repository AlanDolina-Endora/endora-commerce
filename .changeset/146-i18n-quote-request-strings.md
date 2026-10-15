---
'@endora-commerce/mod-i18n': minor
---

New `core` strings, in English and Polish, for the admin quote-request screen: `rfq.detail.reference.*` (reference price, proposal and difference columns; *price at request* / *current price* / *no price*; *per base unit*), `rfq.detail.history.*` (history entries, changes, actors, roles, loading, error and truncation notices; the truncation notice takes the event window as `{count}`) and `rfq.detail.modify.lineGroup` (*Line {number}*, the accessible name of a Modify line that has no product name yet). Removed: `rfq.detail.column.desired` and `rfq.detail.modify.desiredPrice`, which the screen no longer renders; the proposal column is now labelled by `rfq.detail.reference.column.proposed`.
