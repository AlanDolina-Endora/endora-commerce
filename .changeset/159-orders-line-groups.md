---
'@endora-commerce/mod-orders': minor
---

Orders store line groups and answer their lines in display order.

- **Migration** `20261020T172007_orders_order_item_groups.ts` creates `order_item_groups` and adds `order_items.group_id` (on delete set null) and `position` (default 0, no backfill).
- **Replies.** Every order reply — admin, customer and external — answers `itemGroups` (default `[]`) and each item's `groupId` and `position`, with `items` in display order (the read had no order before). Order confirmations, reorder, order-to-quote cloning and the return context read the lines in the same order.
- New orders store each line's basket order as its `position`.
- **Carry-over from quotes.** An order placed from a basket whose accepted-quote source placement vouches for takes the quote's grouping inside the placement transaction: each order line takes the group and place of the quote line it matches (same product, variant and agreed unit price first, then same product and variant), unmatched lines are ungrouped after them, and quote groups that receive no line are not created. The lines are the ones the source judgement already read — the read port is asked once. A refused source, or `quote_requests` switched off, places the order without groups.
- **Admin order creation.** `POST /api/v1/admin/orders` accepts `groups` (`{ key, name }`) and a per-line `groupKey`; the order is created with that grouping in the same transaction, and a group no line names is not created. One product and variant on lines of two different groups answers `422 VALIDATION_FAILED` with `details: [{ path: 'items.<j>.groupKey', code: 'group_conflict', productId, issue }]`, before the customer's basket is touched. The `order.place_on_behalf` audit entry's `stateAfter` gains `groups: [{ name, lineCount }]` when the order has groups.
- **Admin preview.** `POST /api/v1/admin/orders/preview` answers `taxRate` on every priced line.
- **Admin screens.** The create-order screen groups its lines with the line groups editor (summaries of item count, net, VAT and gross per group from the preview); the order screen shows the groups read-only with the same summaries, then *Other items*. An order's grouping cannot be changed after placement. New `lineGroups.*` texts in the module's bundle, English and Polish.
