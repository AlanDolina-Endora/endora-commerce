---
'@endora-commerce/mod-quote-requests': patch
'@endora-commerce/mod-settings': patch
---

The Quote Request expiry sweep holds each request to `quote_requests.expiry_days` resolved for its own sales channel. It read the default channel's value and applied it to requests of every channel, so a channel set to `0` was not exempt and a channel with its own number of days was held to the default's. A request with no channel is held to the default channel's value, as before, and the `expired` history entry records the value that applied.

**On upgrading:** a channel that already has its own value starts following it on the sweep's first runs. A channel with a lower value than the default expires its backlog of requests that have been quiet that long, and a channel set to `0` stops expiring. Read the per-channel values of *Auto-expire pending after (days)* before upgrading if that matters.

`@endora-commerce/mod-settings`: the setting's help text says so in English and Polish.
