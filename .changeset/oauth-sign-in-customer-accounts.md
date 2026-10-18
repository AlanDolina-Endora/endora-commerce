---
'@endora-commerce/mod-customer-accounts': patch
---

Two ports answer more about the account they read:

- `customerSocialLoginPort.resolveByEmail` answers `{ id, organizationId, blocked }` (was `{ id }`), and `autoCreate` answers `{ id, organizationId }`. A blocked account is still returned — it is the account the address belongs to — so federated sign-in refuses it instead of creating a second one.
- `customerOrgResolver` answers `{ organizationId, active }`, or `null` for an account that does not exist (was the organisation id, or `null`). `active` is `false` for a blocked or deleted account. Its one consumer is `@endora-commerce/mod-auth`'s request hook; upgrade the two packages together.
