---
'@endora-commerce/platform': patch
---

A request refused by the rate limiter is answered `429 RATE_LIMITED` in the standard error envelope instead of `500 INTERNAL`.

`registerErrorEnvelope`'s error handler now recognises the error `@fastify/rate-limit` throws (`statusCode: 429`) — for the host's global per-client limit and for any route's own `config.rateLimit` alike — and keeps the limiter's `Retry-After` and `x-ratelimit-*` headers. The refusal is no longer logged as an unhandled error. Only the limiter's own refusal is mapped: a thrown `statusCode: 429` on a reply the limiter has not stamped with `Retry-After` — an upstream client's 429 escaping a handler, say — still answers `500 INTERNAL` and is logged. Other thrown errors carrying a `statusCode` are unchanged: they still answer `500 INTERNAL` and are logged.
