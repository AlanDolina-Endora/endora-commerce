# Quickstart: Order and Quote status push notifications (`specs/149-pwa-order-status-push/`)

How to see the feature work end to end on a dev stack, and how to prove each acceptance path.

## 0. Prerequisites

```bash
git worktree add ../wt-149 -b feat/149-pwa-order-status-push origin/master   # if not already
bash ../wt-149/scripts/setup-worktree.sh
pnpm run build:packages
pnpm run dev:infra
pnpm run setup            # db:fresh then module:install --all (runs the new migration)
pnpm run dev
```

Push needs a secure context: use `localhost` (treated as secure by browsers) or an HTTPS tunnel.
The storefront service worker registers only in a production build (`PwaRegister`), so for the
device part run the storefront with `pnpm --filter storefront run build && pnpm --filter storefront run start`.

## 1. Operator switches (US1)

1. Admin → **Settings → PWA** (or ⌘K → "PWA settings" — the new palette action).
2. Click **Generate VAPID keys**, tick **Enable push notifications**, save.
3. Under it, two new checkboxes are ticked by default: *Notify on order status changes*, *Notify on
   quote status changes*. Switch the scope selector to one channel and untick the order one →
   save. Reload: the channel shows it unticked, global still ticked.
4. Switch `quote_requests` off on `/platform/modules` → reload the PWA screen: the quote checkbox is
   gone; switch it back on → it returns with its saved value.

API check:

```bash
curl -s -b admin.cookie localhost:3000/api/v1/admin/pwa/config | jq '{pushEnabled, orderStatusPushEnabled, quoteStatusPushEnabled}'
```

## 2. Notifications (US2)

1. On the storefront, sign in as a customer with an organisation, accept the notification prompt.
2. Admin → place / pick that customer's order → change its status (e.g. to *Shipment sent*).
3. A system notification appears in the channel's language naming the order number and the shop's
   label for the status; clicking opens `/orders/<id>`.
4. Admin → approve one of that customer's quote requests → notification naming the quote, opening
   `/quote-requests/<id>`. Repeat with *revise prices*, *cancel*; create one on the customer's behalf.
5. Expiry: set a pending quote's `expires_at` in the past and let the sweep run (or run its worker
   job) → *expired* notification.

Without a real device, read what was produced:

```sql
select trigger, title, body, url, source_event_id, created_at
from push_messages order by created_at desc limit 5;
```

## 3. Customer choices (US3)

1. Storefront → **Profile** (`/account`): section *Push notifications* shows the device control and
   two ticked checkboxes *Order status updates*, *Quote updates*.
2. Untick *Quote updates* → save → "Saved". Approve a quote for this customer → **no** new
   `push_messages` row; change an order status → a row appears.
3. Open `/account` in another browser for the same customer → *Quote updates* is unticked.
4. Admin untick *Notify on quote status changes* for the channel → within a minute the storefront
   hides the *Quote updates* checkbox.

API check (with the storefront session cookie):

```bash
curl -s -b customer.cookie -H 'X-Sales-Channel: default' localhost:3000/api/v1/storefront/pwa/preferences
curl -s -b customer.cookie -H 'Content-Type: application/json' -X PUT \
  -d '{"orderStatus":false}' localhost:3000/api/v1/storefront/pwa/preferences
```

Audit: `select action, actor_admin_user_id, state_before, state_after from audit_log_entries where action = 'pwa.push_preference.update' order by created_at desc limit 1;`

## 4. Off-state

Switch `pwa` off on `/platform/modules`:

- order/quote changes produce no `push_messages` row;
- `GET /api/v1/storefront/pwa/preferences` → `503 MODULE_DISABLED`; the `/account` section is gone;
- the PWA screen and palette action are absent.

Switch it back on: switches and choices are as before; the next status change notifies.

## 5. Automated tests

```bash
cd backend
pnpm exec vitest run ../packages/modules/pwa/src/backend
pnpm exec vitest run test/unit/pwa
pnpm exec vitest run test/contract/pwa test/integration/pwa     # needs Postgres + Redis
cd .. && pnpm --filter storefront exec vitest run test/pwa
pnpm --filter admin exec vitest run test/modules/pwa.module-owned-surface.test.tsx
```
