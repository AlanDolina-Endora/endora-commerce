---
'@endora-commerce/mod-catalog': patch
---

The remainder of a price-sorted walk whose price order went missing no longer drops every product on a sales channel that publishes no prices: the walk decides on the viewer's own price whether or not the channel shows it, unpriced products are served as before, and the cards still show no price on such a channel.
