---
'@endora-commerce/mod-quote-requests': minor
---

**A sales representative outside a quote request's organization now gets `404`, not `403`, on every admin quote-request route** — the detail, the new history and every action — the same answer as for an id that does not exist, so the response no longer reveals that the request exists. A client that branched on `403` for "not yours" should treat `404` as that case.
