---
'@endora-commerce/demo-composition': minor
---

`demo reset` withdraws the demo organisation's rows in `pwa`'s new
`push_notification_preferences` table (a customer's account-wide push choices), as it already did
for `push_subscriptions`. The section is skipped, and reported as such, on an instance where `pwa`
was never installed.
