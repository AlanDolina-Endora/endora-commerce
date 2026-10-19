---
'@endora-commerce/contracts': minor
---

`CartCustomerContext.salesChannelId` is now **required** (`specs/154-sales-channel-access/`, User
Story 6). A customer holds one active basket per sales channel, so every caller of
`CartReadPort` and `CartWritePort` names the channel whose basket it means — the channel of its
own request, or the channel an operator-created order names.

Before: `cartWritePort.getOrCreateForCustomer({ customerAccountId, organizationId })`.
After: `cartWritePort.getOrCreateForCustomer({ customerAccountId, organizationId, salesChannelId })`.
