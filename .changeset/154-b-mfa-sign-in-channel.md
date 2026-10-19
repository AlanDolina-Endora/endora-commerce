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

`MfaModuleOptions` gains a required `customerChannelAccess`, built from `customerAccountReadPort`
and the kernel's `salesChannelAccessPort` by the module's own composition.
