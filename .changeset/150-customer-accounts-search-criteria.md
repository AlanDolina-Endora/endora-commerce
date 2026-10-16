---
'@endora-commerce/mod-customer-accounts': minor
---

`customerAccountAdminSearchPort.search` honours the two new optional criteria of
`CustomerAccountAdminSearchCriteria`: `qFields` matches `q` only against the e-mail and/or the first
and last name, literally, ordered by an exact e-mail, then one starting with `q`, then the most recent
change; `excludeDeleted` leaves out deleted and anonymized accounts. Without either, the search — and
the admin Customers list built on it — behaves exactly as before.
