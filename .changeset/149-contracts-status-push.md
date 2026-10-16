---
'@endora-commerce/contracts': minor
---

Additive contract surface for order and quote status push notifications.

- `PWA_SETTING_CODES.PUSH_ORDER_STATUS_ENABLED` (`pwa.push_order_status_enabled`) and
  `PWA_SETTING_CODES.PUSH_QUOTE_STATUS_ENABLED` (`pwa.push_quote_status_enabled`).
- `PwaPublicConfigSchema` gains the required booleans `orderStatusPushEnabled` and
  `quoteStatusPushEnabled` — the effective values for the request's channel.
  `PwaAdminConfigSchema` gains the same two fields (raw values for the scope) and
  `UpdatePwaConfigRequestSchema` accepts both as optional booleans.
- New `PushPreferencesSchema` / `PushPreferences` (`{ orderStatus, quoteStatus }`) and
  `UpdatePushPreferencesRequestSchema` / `UpdatePushPreferencesRequest` (strict, at least one
  field) for `GET`/`PUT /api/v1/storefront/pwa/preferences`.
- `OrderReadPort.findStatusDefinition(code)` returning the new `OrderStatusDefinitionRecord`
  (`{ code, name, defaultName }`) or `null`. A test double that implements `OrderReadPort` in
  full must add the method.
- `QuoteRequestRecord.salesChannelId: string | null` — the channel the request was raised on.
