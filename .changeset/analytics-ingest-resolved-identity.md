---
'@endora-commerce/mod-analytics': patch
'@endora-commerce/contracts': patch
---

`POST /api/v1/analytics/events` now stores, and forwards to GA4, the identity the server resolved
for the request rather than the one the event body names: `customerAccountId` and
`organizationId` come from the signed-in customer (none for any other caller), and
`salesChannelId` is the request's resolved sales channel. The three body fields on
`ingestAnalyticsEventSchema` are still accepted, so existing senders keep validating, but they are
ignored and marked `@deprecated`.

The route also carries its own rate limit, `ANALYTICS_INGEST_RATE_LIMIT` (60 batches per minute
per client IP), on top of the host's global ceiling. `AnalyticsIngestService.ingest` takes a
required `context` (`IngestContext`) carrying the resolved channel and identity.
