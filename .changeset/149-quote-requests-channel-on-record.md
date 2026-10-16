---
'@endora-commerce/mod-quote-requests': minor
---

`quoteRequestReadPort` records now carry `salesChannelId`: the channel the quote request was
raised on, or `null` for one created outside a channel-resolved request.
