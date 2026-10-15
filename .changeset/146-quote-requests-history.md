---
'@endora-commerce/mod-quote-requests': minor
---

New `GET /api/v1/admin/quote-requests/:id/history` (gated by `rfqs:handle` and the sales-representative scope) and a rebuilt History tab on the admin quote-request screen. The stored events are turned into readable, translated entries: records of one decision are merged, every entry names the person who acted (an administrator by name and role, a customer user by name and e-mail, *System* for expiry and completion), and a modification lists what changed against the previous revision — lines added and removed, quantity, agreed and proposed price, line note, header note and validity date. The reply reads the most recent 100 events and says `truncated: true` when older ones exist. Names are on the admin surface only.

An admin modification that changes the offer's validity date now records it in the `modified` event's payload as `validity`, and the customer's event payloads may carry that one key.
