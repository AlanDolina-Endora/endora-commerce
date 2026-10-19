---
'@endora-commerce/mod-sales-channels': patch
'@endora-commerce/mod-organizations': patch
'@endora-commerce/mod-carts': patch
---

Documentation for sales-channel access (`specs/154-sales-channel-access/`), shipped in each
package's `docs/` directory, English and Polish.

- `@endora-commerce/mod-sales-channels`: the access rule (anonymous visitors only on channels open
  to them, customers only on channels assigned to their Organization), the *Open to anonymous
  visitors* option, `GET /api/v1/storefront/sales-channel/access`, and a corrected multi-storefront
  section. The developer guide tells module authors to declare
  `config: { salesChannelAccess: 'open' }` on every provider callback their module receives
  (payment gateway notifications, carrier webhooks, provider return URLs) — such requests arrive
  without a session and are refused on a store closed to anonymous visitors otherwise — and
  describes `SalesChannelAccessPort`.
- `@endora-commerce/mod-organizations`: the *Sales channels* panel, the *New organization* screen,
  which channel a new Organization gets, and that invitations change no channel.
- `@endora-commerce/mod-carts`: one basket per store, and the `ORDER_SALES_CHANNEL_MISMATCH`
  refusal at order placement.
