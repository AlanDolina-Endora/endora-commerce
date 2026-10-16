# Contract: status push triggers — events consumed, ports read, manifest edges (`pwa`)

Replaces the pre-migration `046-pwa-module/contracts/events.md` for the two automatic triggers.

## 1. Events consumed

All registered in `packages/modules/pwa/src/backend/index.ts` with `ctx.subscribe` (gated on
`pwa`'s presence; `check:subscribe-seam`). Payloads are read defensively (the bus hands them over
untyped; a payload missing a required field is dropped, as `crm`'s `readEventId` does).

| Event (owner) | Fields read | Subject |
| --- | --- | --- |
| `order.status_changed.v1` (`orders`) | `eventId`, `orderId`, `salesChannelId`, `to` | order |
| `rfq.created_by_admin.v1` (`quote_requests`) | `eventId`, `rfqId` | quote, `prepared` |
| `rfq.modified.v1` (`quote_requests`) | `eventId`, `rfqId` | quote, `revised` |
| `rfq.approved.v1` (`quote_requests`) | `eventId`, `rfqId` | quote, `approved` |
| `rfq.canceled.v1` (`quote_requests`) | `eventId`, `rfqId` | quote, `canceled` |
| `rfq.expired.v1` (`quote_requests`) | `eventId`, `rfqId` | quote, `expired` |

**Removed**: the subscription to `quote_request.updated.v1` (emitted by nothing), the handler
`onQuoteRequestUpdated`, and the optional `PwaModuleOptions.resolveQuoteTarget`.

Not consumed: `rfq.created.v1` (the customer's own submission), `order.cancelled.v1` (a
cancellation is already an `order.status_changed.v1` with `to: 'cancelled'`; consuming both would
notify twice — the unique index is per trigger *and* event id, and the two events have different
ids).

## 2. Handler algorithm (one composer for both)

`packages/modules/pwa/src/backend/services/status-push-composer.ts`, called from
`push-event-subscriber.ts` inside its existing `try`/`catch`:

```
enterSystemScope('pwa: a status push names one account and is constrained by it', async () => {
  subject  ← resolve (order: orderReadPort.findById; quote: isPresent('quote_requests') ? quoteRequestReadPort.findById : skip)
             null, or order without placedByCustomerAccountId           → skip
  channel  ← subject channel ?? salesChannelResolutionPort.getSystemDefault().id
  if !setting('pwa.push_enabled', channel) or !setting(category, channel) → skip
  account  ← customerAccountReadPort.findById(subject.customerAccountId)
             null, deletedAt, anonymizedAt                               → skip
  pref     ← PushNotificationPreference by customerAccountId (absent ⇒ both on)
             category off                                               → skip (debug log)
  lang     ← primary subtag of channel.defaultLanguage ∈ SUPPORTED_LANGUAGES, else 'en'
  title/body ← adminI18nService.translate('pwa', key, lang, params)
             order params: { orderNumber: businessId, status: label }
             label = (await orderReadPort.findStatusDefinition(to))?.name[lang] ?? defaultName ?? to
  url      ← order: `/orders/${orderId}`; quote: `/quote-requests/${quoteId}`
  messageService.createAndEnqueue({ salesChannelId: channel, title, body, url,
    audience: { kind: 'customers', customerAccountIds: [accountId] },
    trigger: 'order_status' | 'quote_request', sourceEventId: eventId })
})
```

Producer only — it enqueues, the existing `pwa.push.deliver` worker sends (Principle X). A
duplicate `eventId` is already answered by `PushMessageService.createAndEnqueue`, which looks up
`(trigger, sourceEventId)` before inserting and returns the existing message, with
`push_messages_trigger_event_uniq` behind it (FR-014). This feature adds a test for it, not code.

Failure handling stays as in `push-event-subscriber.ts`: `ModuleDisabledError` →
`warn pwa.push_skipped_module_disabled { module, trigger, eventId }`; anything else →
`error pwa.push_enqueue_failed { err, trigger, eventId }`; never re-thrown (FR-015).

## 3. Ports read

| Port (owner) | Type (contracts) | Edge | New? |
| --- | --- | --- | --- |
| `orderReadPort` (`orders`) | `OrderReadPort` — `findById`, **`findStatusDefinition`** (new method) | `dependencies` (existing) | method new |
| `quoteRequestReadPort` (`quote_requests`) | `QuoteRequestReadPort` — `findById` (record gains `salesChannelId`) | **`nonBindingDependencies`, `degrades-without`** | **yes** |
| `customerAccountReadPort` (`customer_accounts`) | `CustomerAccountReadPort` — `findById` | `dependencies` (existing) | no |
| `adminI18nService` (`_i18n`) | `AdminI18nTranslatePort` — `translate` | `dependencies` (existing `_i18n`) | **yes** (first resolution by `pwa`) |
| `salesChannelResolutionPort` (kernel) | `SalesChannelResolutionPort` — `getById`, `getSystemDefault` | platform name, no edge | no |
| `settingsReadPort` (`settings`) | existing | existing | no |
| `commandBus` (platform cradle) | `CommandBus` | platform name, no edge | **yes** (first use by `pwa`) |

Manifest entry to add in `packages/modules/pwa/src/manifest.ts`:

```ts
nonBindingDependencies: [
  {
    moduleId: 'quote_requests',
    name: 'quoteRequestReadPort',
    kind: 'degrades-without',
    whenAbsent:
      'Customers stop receiving push notifications about their quote requests, and the quote ' +
      'switch and choice are not offered; order notifications keep working',
    reason:
      'The one call into this owner is the quote branch of the status-push composer, which asks ' +
      '`isPresent()` in front of the gate and skips; while the owner is off it emits none of the ' +
      'events that reach that branch. No table of that owner is referenced from this module\'s schema.',
  },
],
```

## 4. Contract changes owned by other modules (additive)

- `packages/contracts/src/orders.ts`: `OrderStatusDefinitionRecord`, `OrderReadPort.findStatusDefinition`.
  Implementer: `orders/src/backend/services/order-read-port.ts`. Every test double implementing
  `OrderReadPort` in full must gain the method (`Pick<>`-typed doubles are unaffected).
- `packages/contracts/src/quote-requests.ts`: `QuoteRequestRecord.salesChannelId`. Implementer:
  `quote_requests/src/backend/services/quote-request-read-port.ts` `toQuoteRequestRecord`.

Both are additive for consumers; each needs a changeset for its package
(`specs/conventions/release-intent.md`).
