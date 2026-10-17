---
'@endora-commerce/mod-pwa': minor
---

Order and quote status push notifications: operator switches, customer choices, and working
quote pushes.

**Behaviour change for shops with push enabled.** After upgrading:

- **Quote pushes start.** The quote trigger listened to an event no module emits, so no quote push
  was ever sent. It now listens to `rfq.created_by_admin.v1`, `rfq.modified.v1`,
  `rfq.approved.v1`, `rfq.canceled.v1` and `rfq.expired.v1` (not `rfq.created.v1`, the customer's
  own submission) and notifies the requesting account. Switch the category off with
  `pwa.push_quote_status_enabled` if you do not want this.
- **Order pushes are localised and link to the order.** The sentence is rendered from the
  module's `en`/`pl` bundle in the order channel's default language (English otherwise), names the
  status with the shop's own label (`orderReadPort.findStatusDefinition`), and opens
  `/orders/<id>` instead of a URL that redirected to the order list.

**New.**

- Settings `pwa.push_order_status_enabled` and `pwa.push_quote_status_enabled` (boolean, default
  `true`, global and per channel), editable on the PWA screen and through
  `GET`/`PUT /api/v1/admin/pwa/config` (`orderStatusPushEnabled`, `quoteStatusPushEnabled`).
- `GET`/`PUT /api/v1/storefront/pwa/preferences` — the signed-in customer's account-wide choice
  (`{ orderStatus, quoteStatus }`, absent means both on), stored in the new
  `push_notification_preferences` table (one migration) and written as the audited
  `pwa.push_preference.update` Command.
- `GET /api/v1/storefront/pwa/config` carries `orderStatusPushEnabled` and
  `quoteStatusPushEnabled`, the categories offered on the request's channel.
- A `degrades-without` non-binding dependency on `quote_requests` (`quoteRequestReadPort`): with
  Quote Requests off, order pushes keep working and the quote switch and choice are not offered.
- Command-palette action `open-settings` (`/settings/pwa`, `pwa:read`).
- A duplicate announcement that races past the idempotency look-up now answers the committed
  message instead of logging `pwa.push_enqueue_failed`.

**Composition.** The exported `PwaCradle` reads two more names, `requireCustomer` (`auth`) and
`commandBus` (the platform); both are registered by every composition, so nothing changes for a
deployment. The target-resolver options the module used internally are gone, replaced by the
status-push composer.
