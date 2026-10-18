---
'@endora-commerce/mod-organizations': minor
---

Every Organization is assigned the sales channels its members may use. A data migration assigns
each existing Organization the system-default channel plus every channel it has orders on
(`Migration20261018T104644OrganizationsChannelAccessBackfill`, idempotent, keeps earlier
assignments). A registered business, a personal Organization and the demo Organization are bound
to the system-default channel when they are created. Customer sign-in and sign-out, password
reset, e-mail verification, business registration and invitation acceptance are declared
reachable whatever the sales-channel access rule decides.
