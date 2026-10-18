---
'@endora-commerce/platform': patch
'@endora-commerce/contracts': patch
'@endora-commerce/mod-admin-users': patch
'@endora-commerce/mod-customer-accounts': patch
'@endora-commerce/mod-mfa': patch
'@endora-commerce/mod-organizations': patch
---

Customer sign-in, the customer second factor and password-reset requests are now limited per
account, the way administrator sign-in already was.

- `@endora-commerce/platform/kernel` publishes `AuthenticationAttemptThrottle`, the attempt
  counter administrator sign-in used, with the profile types an owner of accounts builds one
  over (`AttemptThrottleProfile`, `AttemptPolicy`, `AttemptCounterStore`, `ThrottledAttempt`,
  `ThrottledCheckResult`, `ThrottledCredentialState`) and `ADDRESS_POLICY`, `ACCOUNT_POLICY`,
  `ABANDONED_AFTER_SECONDS`, `DEFAULT_STORE_DEADLINE_MS`, `addressOrigin`. `admin_users`' own
  throttle is now a profile over it; its keys, cookie values, codes and audit rows are unchanged.
- `@endora-commerce/contracts` adds `CustomerAuthenticationThrottlePort` (container name
  `customerAuthenticationThrottlePort`, owner `customer_accounts`) with
  `CustomerAuthenticationAttempt`, `CustomerAuthenticationCheckResult`,
  `CustomerAuthenticationOrigin` and `CustomerAuthenticationFactor`; the error codes
  `CUSTOMER_AUTHENTICATION_THROTTLED` (429, with `Retry-After`) and
  `CUSTOMER_AUTHENTICATION_UNAVAILABLE` (503); the cookie name
  `CUSTOMER_KNOWN_DEVICE_COOKIE_NAME` (`b2b_customer_device`) and its lifetime. Optional
  additions: `CustomerLoginInput.knownDevice`, `CustomerLoginResult.knownDevice`, and a second
  `context` argument on `CustomerPasswordResetPort.requestReset`.
- `customer_accounts` counts wrong passwords per folded e-mail address (50 in 30 minutes from a
  device the account has not signed in on, 10 from a known one), and password-reset requests per
  address (5 an hour). There is no per-address counter: the storefront signs shoppers in from its
  own server. A completed sign-in sets the signed `b2b_customer_device` cookie, and an attempt
  carrying it is held to that device's own budget. Asking for a new reset link retires the
  earlier unused ones.
- `mfa` checks customer second-factor codes inside the customer throttle (20 in 30 minutes,
  10 from a known device) and sets the customer known-device cookie when a customer sign-in
  completes there.
- `organizations` reads and sets the customer known-device cookie on
  `POST /api/v1/auth/customer/login` and reads it on `POST /api/v1/auth/password-reset/request`.
