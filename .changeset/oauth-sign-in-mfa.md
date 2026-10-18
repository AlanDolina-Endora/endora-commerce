---
'@endora-commerce/mod-mfa': patch
---

Federated sign-in (Google, Microsoft) on `/api/v1/auth/{customer,admin}/oauth/:provider/{start,callback}` now follows the same rules as the password sign-in.

- **The sign-in completes only in the browser that began it.** `start` sets a short-lived, httpOnly, `SameSite=Lax` cookie (`b2b_oauth_binding`, scoped to `/api/v1/auth/<surface>/oauth`, ten minutes) and stores its digest with the transaction; `callback` refuses a request that does not present it — with the existing "This sign-in attempt has expired." redirect — and clears it. A callback from another browser no longer uses up the transaction.
- **A second factor applies.** After the provider identity resolves to an account, the callback asks `MfaLoginPort.beginLogin` exactly as the password sign-ins do. An account with an active authenticator is not signed in by the callback: a customer is sent to the storefront's `/login/mfa` with the pending challenge in the `b2b_mfa_challenge` cookie, an administrator to the Admin UI with `#mfa-challenge=<id>`; both complete through the existing `…/mfa/verify` endpoints. An account under an enforced two-factor policy that has not enrolled yet is sent back to the sign-in screen, which owns the forced setup. Only an account with no second factor and no enforced policy is signed in directly, as before.
- **A blocked customer account is refused** with the sentence the password sign-in answers — "This account has been blocked. Please contact support." — before any provider link is recorded.

`SocialIdentityDeps.resolveCustomerByEmail` and `autoCreateCustomer` may answer `organizationId` (used for an organisation's enforced policy) and `blocked`; `SocialSignInResult` gains `organizationId` and the `blocked` reason.
