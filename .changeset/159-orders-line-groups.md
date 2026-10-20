---
'@endora-commerce/mod-orders': minor
---

Orders store line groups and answer their lines in display order.

- **Migration** `20261020T172007_orders_order_item_groups.ts` creates `order_item_groups` and adds `order_items.group_id` (on delete set null) and `position` (default 0, no backfill).
- **Replies.** Every order reply — admin, customer and external — answers `itemGroups` (default `[]`) and each item's `groupId` and `position`, with `items` in display order (the read had no order before). Order confirmations, reorder, order-to-quote cloning and the return context read the lines in the same order.
- New orders store each line's basket order as its `position`. Groups are not yet written at placement; that follows with carry-over from quotes and admin order creation.
