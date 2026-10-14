---
'@endora-commerce/mod-quote-requests': minor
---

Customer draft edits and seller revisions keep line data they used to drop.

- **Customer draft edits** (`PATCH /api/v1/quote-requests/:id`) are refused only once an administrator has modified the request (`409 RFQ_NOT_DRAFT`); a customer — or an organization administrator editing a colleague's draft — may now edit a pending draft repeatedly. An edit stores each line's packaging unit as sent. The route is rate-limited to 30 edits per minute per quote request (`429` beyond).
- **Seller revisions** (`PATCH /api/v1/admin/quote-requests/:id`) keep each surviving line's customer proposal, variant, line note, packaging unit and stored reference price unless the request changes them; `lineNote: null` clears a note. A line the seller adds has no packaging unit.
- **New peer dependency: `@fastify/rate-limit` (`^10`)**, needed for the route's rate-limit configuration. The platform host already registers it.
- Customer create and draft-edit bodies accept at most 200 lines.
