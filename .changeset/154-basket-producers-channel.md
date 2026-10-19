---
'@endora-commerce/mod-quick-order': patch
'@endora-commerce/mod-quote-requests': patch
'@endora-commerce/mod-shopping-lists': patch
---

Callers of the cart ports name the basket's sales channel (`specs/154-sales-channel-access/`):
quick-order builds and one-click buy fill the basket of the request's channel (one-click now
always places on that channel), converting an approved quote request seeds the basket of the
request's channel (`RfqService.convertToOrder` takes the channel), and converting a shopping list
fills the basket of the request's channel (`ShoppingListService.convertToCart` takes the channel
as its fourth argument).
