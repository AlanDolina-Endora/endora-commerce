---
'@endora-commerce/contracts': patch
---

New constant `MFA_CHALLENGE_COOKIE_NAME` (`'b2b_mfa_challenge'`): the storefront's pending second-step cookie, now set both by the storefront's password sign-in and by the backend when a federated sign-in hands over to the second step.
