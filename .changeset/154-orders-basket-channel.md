---
'@endora-commerce/mod-orders': patch
---

An order is placed from the customer's basket of the order's sales channel
(`specs/154-sales-channel-access/`, User Story 6). A basket recording another channel is refused
with 422 `ORDER_SALES_CHANNEL_MISMATCH` inside the placement transaction, before anything is
reserved or written, and the basket is kept. The total preview reads the basket of the previewed
channel. Reorder seeds the basket of the storefront request's channel, and an operator's reorder
the basket of the order's own channel; admin order creation and the API-key intake seed the
basket of the channel the order is placed on.
