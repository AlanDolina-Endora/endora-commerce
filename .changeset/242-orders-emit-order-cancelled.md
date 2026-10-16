---
'@endora-commerce/mod-orders': minor
---

`order.cancelled.v1` is emitted. It was declared in `OrderEvents` and documented, and nothing emitted it, so a subscriber written against it never ran. An order moved to `cancelled` is now announced as `order.cancelled.v1` after `order.status_changed.v1`, once the cancelling write has committed, whichever path cancelled it — an administrator, the customer, or `payments` / `shipments` through `orderStatusAnnouncePort`.

The payload grows from `{ orderId }` to `orderId`, `organizationId`, `salesChannelId`, `from` (the status it was cancelled from), `actor`, `reason` and `businessId`. The event stays on the in-process event bus: outbound webhooks keep delivering a cancellation as `order.status_changed.v1` and do not offer `order.cancelled.v1`.
