---
'@endora-commerce/platform': patch
---

The error envelope (`registerErrorEnvelope`) now answers a request body Fastify refuses to parse as a 4xx refusal of the request, instead of `500 INTERNAL`. An empty body sent with `Content-Type: application/json` (for example a `DELETE` from a caller that sets the header on every request) and a malformed JSON body answer `400`, a body over `bodyLimit` answers `413`, and a media type with no parser answers `415` — each with Fastify's own status, the `VALIDATION_FAILED` code, Fastify's message and the `requestId`. These are no longer written to the error log as unhandled faults. Only Fastify's own `FST_*` errors are mapped this way; any other unrecognised throw is still a logged `500`.
