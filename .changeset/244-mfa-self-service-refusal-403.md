---
'@endora-commerce/mod-mfa': minor
---

A wrong confirmation on the signed-in 2FA self-service routes answers `403`, not `401`, so the Admin UI no longer signs the administrator out over a typo. This covers `POST …/activate` (confirming setup), `POST …/disable` and `POST …/recovery-codes/regenerate`, under both `/api/v1/admin/account/mfa` and `/api/v1/account/mfa`. The Admin UI treats every `401` as an expired session; with `403` it shows the error on the security screen and the session stays.

- A wrong code answers `403 MFA_INVALID_CODE` (was `401`).
- A wrong password on `…/disable` answers `403 CURRENT_PASSWORD_INVALID` — "The current password is incorrect." — as the profile screen does since #215. It was `401 INVALID_CREDENTIALS`, whose sentence is the sign-in form's "invalid email or password".

**API clients:** a client that branched on `401` for these refusals now receives `403`. The refusals before a session exists — the login challenge and enrolment during sign-in — keep their `401`. The authentication throttle is unchanged: the sixth attempt still answers `429`.
