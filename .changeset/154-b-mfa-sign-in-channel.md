---
'@endora-commerce/mod-mfa': minor
---

The customer sign-ins `mfa` completes follow the sales-channel assignment of the customer's
Organization, decided on the channel the sign-in was begun on:

- the federated sign-in callback sends a customer whose Organization may not use the channel the
  sign-in was started on back to `<storefront>/login?error=sales_channel_not_permitted`, before a
  second factor is started or a session issued;
- `POST /api/v1/auth/customer/mfa/verify` and
  `POST /api/v1/auth/customer/mfa/setup-ticket/complete` answer 403 `SALES_CHANNEL_NOT_PERMITTED`
  and issue no session when the assignment was removed after the password step; the set-up is not
  activated.

A federated sign-in that creates an account does so for the channel the sign-in was started on:
the new personal Organization holds exactly that channel. On a channel closed to anonymous visitors
it creates nothing — no account, no Organization, no session — as individual self-registration is
refused there, and redirects to `<storefront>/login?error=sales_channel_sign_in_required`. An
existing account signing in through a provider on such a channel is decided by the assignment rule
as before. `SocialIdentityDeps.autoCreateCustomer` receives `{ salesChannelId }` as its second
argument, and `SocialIdentityService.signInCustomer` takes the sign-in's channel.

`MfaModuleOptions` gains a required `customerChannelAccess`, built from `customerAccountReadPort`
and the kernel's `salesChannelAccessPort` and `salesChannelResolutionPort` by the module's own
composition.
