---
'@endora-commerce/mod-auth': patch
---

A customer session whose account is blocked, deleted or no longer exists is no longer bound as a signed-in customer: the request is anonymous, and `requireCustomer` answers it `401` — the customer side of the active-account check the admin guard makes. Blocking or deleting an account already revokes its sessions; this holds even where a session outlived that. The account is read by the request hook's existing organisation lookup, so no request makes an additional query. Impersonation sessions are bound as before.

Requires `@endora-commerce/mod-customer-accounts` from the same release, whose `customerOrgResolver` now answers whether the account may act.
