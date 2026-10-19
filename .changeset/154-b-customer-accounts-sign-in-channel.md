---
'@endora-commerce/mod-customer-accounts': minor
---

Customer password sign-in follows the sales-channel assignment of the customer's Organization.
After a correct password and a non-blocked account, a sign-in on a channel the Organization is not
assigned to answers 403 `SALES_CHANNEL_NOT_PERMITTED` with `details.channelCode`, and sets no
cookie, creates no session, starts no second factor and leaves `lastLoginAt` unchanged. A wrong
password is still answered 401 first. This holds with the `mfa` module switched off.

Individual self-registration assigns the new personal Organization the channel of the store the
visitor registered on. An account created by a federated sign-in does the same:
`customerSocialLoginPort.autoCreate(email, { salesChannelId })` takes the channel the sign-in was
started on, which `mfa` carries in the OAuth transaction, and gives the new personal Organization
exactly that channel, so the session issued next is accepted there. Without a channel the system
default applies.
