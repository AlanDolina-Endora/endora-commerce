# Research: Order and Quote status push notifications (`specs/149-pwa-order-status-push/`)

Every decision is stated as **Decision → Rationale → Alternatives rejected**. Paths are relative
to the repository root and were read on `origin/master` at `e6b1494f7`.

## R-1 Baseline — what the tree does today (measured, not assumed)

| Finding | Evidence |
| --- | --- |
| Order-status pushes are sent whenever `pwa.push_enabled` is on for the order's channel; there is no category switch. | `packages/modules/pwa/src/backend/services/push-event-subscriber.ts` (`onOrderStatusChanged`), `plugin.ts` (`isPushEnabled`) |
| The order sentence is hard-coded English, shows the raw status code with `_` → space, and links to `/account/orders/<businessId>`. | `services/cross-module-context.ts` `createOrderPushTargetResolver`. The comment there already classifies this as translation-boundary case 2 deferred to `specs/093-backend-delivered-prose/`. |
| `/account/orders/<anything>` has no dynamic route: `storefront/app/(account)/account/orders/page.tsx` redirects to `/orders`. The detail page is `storefront/app/(account)/orders/[id]/page.tsx`, which calls `GET /api/v1/orders/:id` → `orderService.getById(id)` (a **uuid**). So today's tap lands on the order list. | `packages/modules/orders/src/backend/routes.ts:385-393` |
| **Quote pushes have never fired.** `backend/index.ts` subscribes to `quote_request.updated.v1`, which **no module emits** (the only occurrence of the name in `packages/` is the subscription). Independently, `resolveQuoteTarget` is supplied by nobody, so the handler returns at its first line. `plugin.ts` documents the second half and calls implementing it "a design act". | `packages/modules/pwa/src/backend/index.ts` (`ctx.subscribe('quote_request.updated.v1', …)`), `plugin.ts` (`resolveQuoteTarget` doc block) |
| The events `quote_requests` actually emits: `rfq.created.v1` (customer submit), `rfq.created_by_admin.v1`, `rfq.modified.v1` (offer revised), `rfq.approved.v1`, `rfq.canceled.v1`, `rfq.expired.v1`. Only `created` / `created_by_admin` / `expired` carry `organizationId`; none carries a channel or a customer. | `quote_requests/src/backend/services/rfq-service.ts:80-83`, `rfq-admin-service.ts`, `rfq-expiry-worker.ts:429`, `packages/contracts/src/quote-requests.ts:500,849-876` |
| The storefront already has a **per-browser** on/off control on `/account` and releases the subscription on sign-out (issue #258). Its copy is hard-coded English. | `storefront/components/pwa/PushNotificationsToggle.tsx`, `storefront/lib/api/pwa.ts` (`pushToggleState`, `turnOffPush`) |
| `pwa` is a **Command-Bus-migrated** module: `check:command-coverage -- --module pwa` reports `migrated modules: pwa`, 0 findings; existing device writes carry `command-coverage-ignore` as push infrastructure. | `backend/scripts/check-command-coverage.ts`, `services/push-subscription-service.ts` |
| `pwa` has **no command-palette action** — only a sidebar entry. Same gap `0bfab6980` closed for `cms`. | `packages/modules/pwa/src/manifest.ts` (no `actions`), `src/admin/index.ts` |
| Pre-migration intent: `pwa`'s subscriptions to source modules were meant to be **soft** ("wired only when the source modules are enabled; `pwa` does not hard-depend on them"). | historical repo `specs/046-pwa-module/contracts/events.md`, research §R11 |

## R-2 Where the operator switches live

**Decision**: Two new **pwa-owned Settings**, group `pwa`, `valueType: 'boolean'`,
`defaultValue: true`, `hidden: true` (managed only from the PWA screen like every other `pwa.*`
setting), resolved per channel through the standard global + override chain:
`pwa.push_order_status_enabled`, `pwa.push_quote_status_enabled`. Read in the handler through the
module's own `settingsReadPort`; written through the existing `PUT /api/v1/admin/pwa/config`
(gate `pwa:write`), which already writes through `settingsAdminService` and therefore through the
settings module's audited path.

**Rationale**: It is literally "a Setting in the PWA section"; the screen already implements the
global/channel scope selector for `pwa.push_enabled`; default `true` preserves today's order
behaviour for a shop that has push on (FR-002); the settings store owns its own cache and its
invalidation, so nothing new is needed for Redis.

**Alternatives rejected**:
- *One list-valued setting (`pwa.push_status_triggers: ['order','quote']`)* — a per-channel
  override would have to restate the whole list, and the admin control becomes a multi-select for
  two booleans.
- *Per-status matrix (which order statuses notify)* — statuses are operator-configurable at
  runtime (`order_statuses` table); a matrix is a second lifecycle editor. Not asked for; recorded
  as an open question with default "no".
- *Settings owned by `orders` / `quote_requests`* — the notification is `pwa`'s behaviour; the
  source modules must not know push exists (Principle I).
- *Not hidden, i.e. editable on the generic Settings screen too* — `manifest.ts` deliberately keeps
  every `pwa.*` value in exactly one place.

## R-3 Where the customer's choice lives

**Decision**: A new **pwa-owned** table `push_notification_preferences`, one row per customer
account, two booleans (`order_status_enabled`, `quote_status_enabled`). **No row means both on.**

**Rationale**: The choice exists only because `pwa` delivers push; detaching `pwa` must take it
with it (Principle I). It is read once per status event by `pwa` itself. One row per account
gives the account-wide semantics the request asks for ("on their account"), which the per-device
subscription cannot express.

**Alternatives rejected**:
- *Columns on `customer_accounts`* — a `pwa` concept in another module's table; `pwa` would need
  a write port into `customer_accounts`; the columns would outlive `pwa`'s removal.
- *Runtime custom fields (Principle XIV)* — XIV is for "the operator wants another field on an
  entity"; this is a code-read behavioural flag with fixed semantics that the operator must not be
  able to delete or retype.
- *Flags on `push_subscriptions` (per device)* — per device already exists (subscribe/unsubscribe);
  the request is account-level, and a new device would start with no flags.
- *Settings store with a customer scope* — the settings store scopes by global/channel only.
- *A generic "notification preferences" module (e-mail + in-app + push)* — one consumer today;
  YAGNI (IV). If e-mail and in-app preferences ever join, this table is the obvious extraction
  seed.

## R-4 Default and absence semantics

**Decision**: Absent row ⇒ both on. `PUT` upserts the row; it is never deleted by this feature.

**Rationale**: A customer reaching any push at all already granted browser permission and
subscribed a device; opt-out per category is the refinement. Seeding a row per account would be a
write into every account for no information.

**Alternative rejected**: absent ⇒ off (opt-in per category) — would silently stop the order
pushes existing subscribers receive today on upgrade.

## R-5 Tenant classification of the preference row

**Decision**: `@CustomerScoped()` with an `organization_id` column stamped from the owning
account at the write (same as `push_subscriptions`, D-187), `customer_account_id` unique and
`NOT NULL`, `organization_id NOT NULL`. **No foreign key** to `customer_accounts`, following the
reasoning written down in `pwa/src/migrations/20260830T172022_pwa_organization_attribution.ts`.

**Rationale**: The row belongs to one customer; the organisation column lets the customer filter's
`allowed-set` arm grant a sales representative assigned to the buyer's organisation (Principle XI,
no "no-organization" path — every account has one since D-178).

**Alternative rejected**: `@GlobalEntity()` — would make a buyer's choices readable outside their
tenant scope with no guard.

## R-6 Which events trigger a quote push, and how pwa hears them

**Decision**: Subscribe (via `ctx.subscribe`, so gated on `pwa`'s presence) to the five
`quote_requests` events `rfq.created_by_admin.v1`, `rfq.modified.v1`, `rfq.approved.v1`,
`rfq.canceled.v1`, `rfq.expired.v1`, each mapped to one `QuoteStatusPushKind`
(`prepared`, `revised`, `approved`, `canceled`, `expired`). **Delete** the dead
`quote_request.updated.v1` subscription, the optional `resolveQuoteTarget` option and
`onQuoteRequestUpdated`. `rfq.created.v1` is **not** subscribed (the customer's own submission,
FR-008).

**Rationale**: These are the real, already-emitted, post-commit events, and `crm` already
subscribes to four of them by literal name (`crm/src/backend/index.ts`, `QUOTE_REQUEST_VALUE_EVENTS`)
— a precedent for a degrading consumer. No change to `quote_requests`' emit sites is needed.

**Alternatives rejected**:
- *Ask `quote_requests` to emit one coarse `quote_request.status_changed.v1`* — cleaner for a
  consumer, but a second announcement of five things already announced, a change to a module this
  feature otherwise only reads, and no consumer besides `pwa` needs it today. Revisit if a third
  consumer appears.
- *Read `quote_request_events`* — another module's table (Principle I).

## R-7 Reading the quote — the edge to `quote_requests`

**Decision**: Resolve `quoteRequestReadPort` with `lazyPort<QuoteRequestReadPort>(ctx,
'quoteRequestReadPort')` and declare it in the manifest as a **`nonBindingDependencies`** entry
of kind **`degrades-without`** (not in `dependencies`). The quote handler asks
`effectiveState.isPresent('quote_requests')` **before** the port, as `crm/src/backend/services/
crm-quote-requests.ts` does. Extend `QuoteRequestRecord` (`packages/contracts/src/quote-requests.ts`)
additively with `salesChannelId: string | null`, filled by `toQuoteRequestRecord` from the
entity's existing nullable `salesChannelId`. A `null` channel resolves to the system-default
channel through the kernel's `salesChannelResolutionPort` (already resolved by `pwa`).

**Rationale**: A shop without quotes still wants order push; putting `quote_requests` in
`dependencies` would make `pwa` refuse to stay on without it and would turn the quote desk's
switch into a switch for push (`module-composition.md` item 4a; `crm` research R-17 made the same
call). The record already carries `businessId` and `customerAccountId`; the channel is the one
missing fact, and it is a plain uuid the entity already holds.

**Alternatives rejected**:
- *`dependencies: ['quote_requests']`* — see above.
- *Put the channel on the five event payloads* — changes five emit sites in another module and
  still leaves `businessId` and the customer to read.
- *Infer the channel from the customer's push subscriptions* — a customer subscribed on two
  channels would be notified on both, and the language would be undefined.

## R-8 The order status label

**Decision**: Add one additive method to `OrderReadPort` (`packages/contracts/src/orders.ts`),
implemented by `OrderReadService` (`orders/src/backend/services/order-read-port.ts`):
`findStatusDefinition(code: string): Promise<OrderStatusDefinitionRecord | null>` returning
`{ code, name: Record<string,string>, defaultName }` from `order_statuses`. `pwa` picks
`name[language] ?? defaultName ?? code`.

**Rationale**: Statuses and their per-language names are operator content owned by `orders`
(`order-status.entity.ts`, `name` keyed by `en`/`pl`); the storefront already resolves
`statusName[language] → statusDefaultName → status` the same way (`orders.ts:150`). Keyed by
**code**, so the label is the one for the event's `to`, not whatever the order's status is by the
time the handler runs. `orders` is `nonDeactivatable` and already a binding dependency of `pwa`,
so no manifest edge changes.

**Alternatives rejected**:
- *Label on `order.status_changed.v1`* — event payloads carry identifiers only (the webhook
  contract publishes that event), and the label is language-dependent.
- *`statusName` on `OrderRecord`* — describes the current status rather than `to`, and costs a
  join for every one of the record's readers.
- *Copy status names into `pwa`* — two owners of one operator fact.
- *Keep the raw code* — `shipment_sent` is not something to show a buyer, and it is English.

## R-9 Language of the notification, and who translates

**Decision**: Backend translates (translation-boundary **case 1**, `specs/conventions/module-i18n.md`):
the language is the channel's `defaultLanguage` reduced to its primary subtag and bounded to
`SUPPORTED_LANGUAGES` (`pl-PL` → `pl`; unknown → `en`), resolved from the channel the
notification is sent on. Sentences are keys in **`pwa`'s own** `i18n/en.json` / `pl.json`, rendered
through `_i18n`'s published `AdminI18nTranslatePort` (container name `adminI18nService`, resolved
with `lazyPort`), which already falls back to English. `_i18n` is already a binding dependency of
`pwa` and is `nonDeactivatable`.

**Rationale**: A push is rendered by the operating system from the payload; there is no consumer
with a catalogue to translate a key, so the backend must send the sentence. The channel language
is the reader's best resolvable language — `payments`' `payment-email-notifier.ts` makes the same
choice for transactional e-mail. One notification per (event, channel) also matches one language
per message, which keeps `push_messages` unchanged.

**Alternatives rejected**:
- *Send a key + params and translate in the service worker* — the SW would need a copy of the
  catalogue per language: a second home for the sentences.
- *Per-customer language* — no stored customer language exists (feature 083 resolves language per
  request); inventing one is out of scope.
- *A module-private translation table in code* — bypasses bundle pairing (`check:bundle-pairing`)
  and the platform's fallback chain.

## R-10 Deep links

**Decision**: Orders → `/orders/<order.id>`; quotes → `/quote-requests/<quote.id>`. Both are the
storefront's real detail routes and take the uuid.

**Rationale / alternative rejected**: `/account/orders/<businessId>` (today) redirects to the
list. A business-id route does not exist and adding one is out of scope.

## R-11 Handler shape — order of gates, scope, failure logging

**Decision**: Both triggers go through one module-private composer,
`StatusPushComposer` (`services/status-push-composer.ts`), so the gate order is written once:

1. resolve the subject (order via `orderReadPort`, or quote via `quoteRequestReadPort` after the
   `isPresent('quote_requests')` decision) → `null` ⇒ skip (guest order, unknown id);
2. resolve the channel (`order.salesChannelId`, or the quote's / system default);
3. `pwa.push_enabled` **and** the category setting for that channel → off ⇒ skip;
4. the account: `customerAccountReadPort.findById` → missing, `deletedAt` or `anonymizedAt` ⇒ skip
   (FR-016);
5. the preference row → category off ⇒ skip;
6. render title/body/url (R-8, R-9, R-10) and `messageService.createAndEnqueue` with
   `audience: { kind: 'customers', customerAccountIds: [id] }`, `trigger` `order_status` or
   `quote_request`, `sourceEventId = event.eventId` (the existing unique index gives FR-014).

The whole sequence runs inside `enterSystemScope('pwa: a status push names one account …', …)`
and constrains by `customerAccountId` explicitly (D-285 — the handler inherits whatever context
the emitter had, or none for the expiry sweep, and a `@CustomerScoped` read with no context throws
`MissingTenantContextError`). The existing `catch` in `push-event-subscriber.ts` is kept with its
two distinct log lines (`pwa.push_skipped_module_disabled` / `pwa.push_enqueue_failed`); skips in
steps 1–5 return silently except step 5, which logs at `debug` (`pwa.push_skipped_customer_preference`).

**Rationale**: Cheapest checks first; no `push_messages` row for a skipped push (SC-006); the
`catch` shape is the one `check:port-catches` accepts for an EventBus subscriber (its doc block
explains why `rethrowIfModuleDisabled` is wrong at this seam).

**Alternatives rejected**: filtering preferences in `PushMessageService.resolveAudience` — that
service also serves admin sends, which preferences must not affect (FR-006).

## R-12 Auditing the customer's choice (Principle XIII)

**Decision**: The preference write runs as a Command, `pwa.push_preference.update`, through
`CommandBus.run` with the server-derived **customer** actor (`kind: 'customer'`, admin id `null`,
or the impersonation pair), target `push_notification_preference` / row id, before/after state.
Not reversible.

**Rationale**: `pwa` is a migrated module, so a new mutation must be a Command or carry a justified
`command-coverage-ignore`. Unlike a device subscription (infrastructure that churns with browsers),
this is a person's stated choice, and "why did I not get notified?" is a support question the audit
answers. The Command Bus already models customer actors (`packages/platform/src/commands/actor.ts`).

**Alternative rejected**: `command-coverage-ignore` on the grounds of the `147-saved-views`
precedent — that was operator UI configuration; this decides what is delivered to a customer.

## R-13 Storefront surface

**Decision**: Keep everything in one **"Push notifications"** section on `/account`
(`storefront/app/(account)/account/page.tsx`): the existing client `PushNotificationsToggle`
(device), plus a new server-rendered `PushPreferencesForm` (account-wide checkboxes) saved by a
**server action** that calls `PUT /api/v1/storefront/pwa/preferences` with the session cookie. The
page reads `GET /api/v1/storefront/pwa/config` (server side, `lib/api/pwa-server.ts`) and the
preferences; a failed read (module off ⇒ 503, signed out ⇒ 401) hides the section. All copy in the
section, including the existing toggle's, moves to `storefront/lib/i18n/messages.ts` (`en-US`,
`pl-PL`, total `Record` — a missing Polish key is a `tsc` error).

**Rationale**: Server action + server read is the account area's existing pattern
(`app/(account)/preferences/page.tsx`); no new same-origin route handler; account-wide choices do
not depend on browser capabilities, so they render server-side even where push is unsupported or
blocked on this device (Story 3 scenario 5).

**Alternatives rejected**:
- *Client fetch through a new `/pwa/preferences` route handler* — duplicates the proxy pattern for
  a form that needs no browser API.
- *Place it on `/preferences`* — that page is "Default ordering preferences" (checkout defaults).
- *Leave the toggle's English literals* — the section is being reworked; FR-023.

## R-14 What the storefront is told about availability

**Decision**: Extend `PwaPublicConfigSchema` additively with `orderStatusPushEnabled` and
`quoteStatusPushEnabled` — the **effective** values for the request's channel: push effectively on
(enabled and VAPID key present) **and** the category setting on, and for quotes also
`quote_requests` present. `storefront/lib/api/pwa-server.ts`' `DEFAULT_CONFIG` gains both as `false`.

**Rationale**: The storefront has no module-presence list; the backend decides once (FR-020).
The existing `Cache-Control: public, max-age=60` bounds propagation as for `pushEnabled`.

## R-15 Caching and Redis

**Decision**: Nothing new is cached and no lifecycle pub/sub subscriber is added. Settings reads go
through `settingsReadPort`, whose cache and invalidation belong to `settings`; the preference read
is one indexed single-row lookup per event.

**Rationale / alternative rejected**: a Redis cache of preferences would need invalidation on
every write for a read that happens once per status change — YAGNI (IV).

## R-16 Admin surface

**Decision**: In `PwaPage.tsx`'s *Capabilities* card, under "Enable push notifications", two
indented checkboxes: "Notify on order status changes", "Notify on quote status changes"; disabled
(not hidden) while push is off for the scope; the quote one hidden when
`useModulePresence().isPresent('quote_requests')` is false (`@endora-commerce/admin-kit/lib`, the
`crm` precedent). New strings through `useTranslation('pwa')`; the file's hard-coded baseline
(`PwaPage.tsx: 22` in `backend/scripts/i18n-hardcoded-strings.ts`) must not rise. Add the module's
missing palette action `open-settings` → `/settings/pwa`, `requiredPermission: 'pwa:read'`, icon
`Smartphone` (already in `KnownIconNameSchema`).

**Rationale**: Principle IX — the screen's existing `Checkbox`; Principle XVI — the surface this
feature extends must be reachable under ⌘K, and today it is not. No new permission: `pwa:read`
opens the screen, `pwa:write` saves.

**Alternative rejected**: a separate "Notifications" card — two booleans subordinate to the push
switch read better beside it.

## R-17 No new dependency

**Decision**: No runtime or dev dependency. Everything uses the existing stack, the existing
`web-push` provider, BullMQ delivery queue, Settings, `_i18n` and the Command Bus.
