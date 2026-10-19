---
'@endora-commerce/mod-organizations': minor
---

A new Organization gets the sales channel of the store it was created on. A business registered
through `POST /api/v1/organizations/register` is assigned exactly the request's resolved channel,
also on a channel closed to anonymous visitors; without a request channel it gets the system
default. A personal Organization provisioned for an individual registration is assigned the
channel passed in `PersonalOrganizationProvisionInput.salesChannelId` (the system default when it
is `null`), in the caller's transaction. Accepting an invitation leaves the Organization's
channels unchanged.

`PersonalOrganizationProvisionInput` (`@endora-commerce/mod-organizations/ports`) gains a
required `salesChannelId: string | null`. A caller of `provisionFor` passes the channel of the
store the account registers on, or `null`:

```ts
// before
await provision.provisionFor(em, { customerAccountId, email });
// after
await provision.provisionFor(em, { customerAccountId, email, salesChannelId: null });
```
