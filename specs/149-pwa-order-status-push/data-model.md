# Data model: Order and Quote status push notifications (`specs/149-pwa-order-status-push/`)

One new table, two new settings, two additive contract fields on other modules' read models, one
additive port method. Nothing is dropped or renamed; `push_messages` is unchanged.

## 1. `push_notification_preferences` — new, owned by `pwa`

A customer account's account-wide choice of which automatic push categories it wants (FR-017 –
FR-019). **Absence of a row means both categories on** (research R-4).

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | app-generated | primary key |
| `customer_account_id` | `uuid` | no | — | **unique**; the owning account. No FK (R-5, same reasoning as `push_subscriptions`) |
| `organization_id` | `uuid` | no | — | stamped from the account at every write (D-187 pattern); indexed |
| `order_status_enabled` | `boolean` | no | `true` | |
| `quote_status_enabled` | `boolean` | no | `true` | |
| `created_at` | `timestamptz` | no | `now()` | |
| `updated_at` | `timestamptz` | no | `now()` | set on every write |

Constraints and indexes:

- `push_notification_preferences_pkey` on `id`.
- `push_notification_preferences_customer_account_id_unique` on `customer_account_id`.
- `push_notification_preferences_organization_id_index` on `organization_id`.

Entity: `PushNotificationPreference`
(`packages/modules/pwa/src/backend/entities/push-notification-preference.entity.ts`), decorated
`@CustomerScoped()`, `tableName: 'push_notification_preferences'`, added to the `entities` array
exported from `packages/modules/pwa/src/backend/index.ts`. Because it declares `organizationId`,
the customer filter's `allowed-set` arm grants a sales representative assigned to the
organisation (Principle XI).

Migration: one, owned by `pwa`, scaffolded with
`pnpm --filter backend run migration:new -- --module pwa --name push_notification_preferences`
(class `Migration<STAMP>PwaPushNotificationPreferences…`); registered by `composer:generate`.
No cross-module reference, so no manifest edge and no ordering concern.

Validation rules:

- Written only through the `pwa.push_preference.update` Command (R-12) for the signed-in account
  (`request.actor.kind === 'customer'`); never from a body-supplied account id.
- `organization_id` is resolved through `customerAccountReadPort.findById(accountId)`; an account
  that does not resolve refuses the write (the `PushSubscriptionService.#organizationOf` rule).
- A write is a partial patch: an omitted field keeps its current value (or `true` for a first
  write).

Lifecycle: never deleted by this feature. Switching `pwa` off keeps the rows (FR-024). A soft
uninstall keeps them (schema stays); a hard uninstall drops the module's tables with the rest.

## 2. Settings — two new, owned by `pwa`

Declared in `packages/modules/pwa/src/manifest.ts` in `pwaSettingEntries` (so they inherit
`hidden: true`), codes added to `PWA_SETTING_CODES` in `packages/contracts/src/pwa.ts`.

| Code | Type | Default | Scope | Meaning |
| --- | --- | --- | --- | --- |
| `pwa.push_order_status_enabled` | `boolean` | `true` | global + per-channel override | automatic push on order status changes (FR-001 – FR-003) |
| `pwa.push_quote_status_enabled` | `boolean` | `true` | global + per-channel override | automatic push on the five quote events (FR-001 – FR-003, FR-005) |

Effective rule evaluated per channel by the handler:
`push_enabled ∧ category_enabled` (and, for quotes, `quote_requests` present).
No `secret` value types are involved.

## 3. Contract additions on other modules' read models (additive)

### 3.1 `QuoteRequestRecord.salesChannelId` — `packages/contracts/src/quote-requests.ts`

```ts
/** The channel the request was raised on; `null` when created outside a request scope. */
salesChannelId: string | null;
```

Filled in `quote_requests/src/backend/services/quote-request-read-port.ts`
`toQuoteRequestRecord` from `quote.salesChannelId ?? null`. No schema change (the column exists).

### 3.2 `OrderReadPort.findStatusDefinition` — `packages/contracts/src/orders.ts`

```ts
/** One configured order status, as a consumer labels it. */
export interface OrderStatusDefinitionRecord {
  code: string;
  /** Operator-supplied names keyed by language (`en`, `pl`, …). */
  name: Record<string, string>;
  defaultName: string;
}

export interface OrderReadPort {
  // …existing members…
  /** The configured status with this code, or `null` when no such status exists. */
  findStatusDefinition(code: string): Promise<OrderStatusDefinitionRecord | null>;
}
```

Implemented in `orders/src/backend/services/order-read-port.ts` as one
`em.findOne(OrderStatus, { code })` (the table is global configuration).

## 4. Public PWA config — `packages/contracts/src/pwa.ts` (additive)

`PwaPublicConfigSchema` gains:

| Field | Type | Meaning |
| --- | --- | --- |
| `orderStatusPushEnabled` | `boolean` | push effectively on for the channel ∧ `pwa.push_order_status_enabled` |
| `quoteStatusPushEnabled` | `boolean` | push effectively on ∧ `pwa.push_quote_status_enabled` ∧ `quote_requests` present |

`PwaAdminConfigSchema` gains `orderStatusPushEnabled: boolean`, `quoteStatusPushEnabled: boolean`
(raw setting values for the scope); `UpdatePwaConfigRequestSchema` gains both as optional.

## 5. Push preference DTOs — `packages/contracts/src/pwa.ts` (new)

```ts
export const PushPreferencesSchema = z.object({
  orderStatus: z.boolean(),
  quoteStatus: z.boolean(),
});
export type PushPreferences = z.infer<typeof PushPreferencesSchema>;

export const UpdatePushPreferencesRequestSchema = z
  .object({ orderStatus: z.boolean().optional(), quoteStatus: z.boolean().optional() })
  .strict()
  .refine((v) => v.orderStatus !== undefined || v.quoteStatus !== undefined, {
    message: 'at_least_one_field',
  });
export type UpdatePushPreferencesRequest = z.infer<typeof UpdatePushPreferencesRequestSchema>;
```

## 6. Module-private value types (not exported from the package)

```ts
/** What one status event becomes before rendering. */
type StatusPushSubject =
  | { kind: 'order'; eventId: string; orderId: string; businessId: string;
      customerAccountId: string; salesChannelId: string; toStatus: string }
  | { kind: 'quote'; eventId: string; quoteId: string; businessId: string;
      customerAccountId: string; salesChannelId: string | null;
      what: 'prepared' | 'revised' | 'approved' | 'canceled' | 'expired' };
```

Event → `what` mapping (research R-6):

| Event | `what` |
| --- | --- |
| `rfq.created_by_admin.v1` | `prepared` |
| `rfq.modified.v1` | `revised` |
| `rfq.approved.v1` | `approved` |
| `rfq.canceled.v1` | `canceled` |
| `rfq.expired.v1` | `expired` |

## 7. Existing entities touched

- `push_messages` — unchanged. `trigger` stays `order_status` / `quote_request` (the existing
  `push_messages_trigger_check` allows both); `source_event_id` is the event's `eventId`, so the
  existing partial unique index `push_messages_trigger_event_uniq` delivers FR-014.
- `push_subscriptions` — unchanged; the preference never edits a device row (FR-019).

## 8. i18n keys (pwa bundle, `packages/modules/pwa/i18n/{en,pl}.json`, flat)

| Key | en | pl |
| --- | --- | --- |
| `notification.orderStatus.title` | Order update | Aktualizacja zamówienia |
| `notification.orderStatus.body` | Order {orderNumber} is now: {status}. | Zamówienie {orderNumber} ma teraz status: {status}. |
| `notification.quote.title` | Quote request update | Aktualizacja zapytania ofertowego |
| `notification.quote.body.prepared` | A quote {quoteNumber} has been prepared for you. | Przygotowaliśmy dla Ciebie ofertę {quoteNumber}. |
| `notification.quote.body.revised` | Quote {quoteNumber} has a revised offer waiting for you. | W zapytaniu ofertowym {quoteNumber} czeka na Ciebie zaktualizowana oferta. |
| `notification.quote.body.approved` | Quote {quoteNumber} has been approved. | Zapytanie ofertowe {quoteNumber} zostało zatwierdzone. |
| `notification.quote.body.canceled` | Quote {quoteNumber} has been cancelled. | Zapytanie ofertowe {quoteNumber} zostało anulowane. |
| `notification.quote.body.expired` | Quote {quoteNumber} has expired. | Zapytanie ofertowe {quoteNumber} wygasło. |
| `settings.field.orderStatusPush` | Notify on order status changes | Powiadamiaj o zmianach statusu zamówienia |
| `settings.field.quoteStatusPush` | Notify on quote status changes | Powiadamiaj o zmianach statusu zapytań ofertowych |
| `settings.field.statusPushHint` | Sent automatically to the customer who placed the order or requested the quote, on their subscribed devices. | Wysyłane automatycznie do klienta, który złożył zamówienie lub zapytanie, na jego zasubskrybowane urządzenia. |
| `actions.openSettings.label` | PWA settings | Ustawienia PWA |
| `actions.openSettings.description` | App identity, caching and push notifications | Tożsamość aplikacji, cache i powiadomienia push |

Storefront keys (`storefront/lib/i18n/messages.ts`, both `en-US` and `pl-PL`):
`account.push.heading`, `account.push.device.heading`, `account.push.device.on`,
`account.push.device.off`, `account.push.device.blocked`, `account.push.device.turnOn`,
`account.push.device.turnOff`, `account.push.preferences.heading`, `account.push.preferences.hint`,
`account.push.preferences.orderStatus`, `account.push.preferences.quoteStatus`,
`account.push.preferences.save`, `account.push.preferences.saved`, `account.push.preferences.error`.
Wording is the implementer's within the meaning stated in spec Story 3; Polish is required.
