# Data Model: Sales-channel access

**Feature**: `specs/154-sales-channel-access/` · decisions in [research.md](./research.md)

No new table. One new column, three data migrations, one new cache, two extended shapes.
Migrations are scaffolded with `pnpm --filter backend run migration:new -- --module <id> --name <slug>`
and registered with `composer:generate`; they are planned by owner and dependency, never by number.

## 1. Schema and data changes

| # | Owner (`--module`) | Slug | Kind | Statement (shape) | Depends on |
| --- | --- | --- | --- | --- | --- |
| M1 | `core` (platform, owns `sales_channels`) | `sales-channels-anonymous-access` | DDL | `alter table "sales_channels" add column if not exists "anonymous_access" boolean not null default true;` — every existing row becomes `true` through the default. `down()`: drop the column. | — |
| M2 | `organizations` | `channel-access-backfill` | DML | default channel for every Organization; plus `distinct (sales_channel_id, organization_id)` of `orders` when `to_regclass('public.orders')` is not null; `on conflict do nothing` (research R-7). `down()`: no-op. Ledger entry R1 (`migration-undeclared-references/organizations.ts`). | M1 not required; `sales_channels` is kernel |
| M3 | `carts` | `carts-channel-backfill` | DML | `update "carts" set "sales_channel_id" = (select "id" from "sales_channels" where "system_default" = true) where "sales_channel_id" is null;` `down()`: no-op. | — |

Execution order needs nothing declared: M1 is in the platform's set; `organizations` and `carts` run
after the kernel; M2 reads `orders` only where the table already exists (an upgrade), and on a fresh
database there are no orders to read.

### `sales_channels` (kernel entity `SalesChannel`)

| Field | Column | Type | Default | Notes |
| --- | --- | --- | --- | --- |
| `anonymousAccess` (new) | `anonymous_access` | boolean, not null | `true` | May an anonymous request use this channel. Added to `OptionalProps`. |
| `isPublic` (unchanged) | `is_public` | boolean | `false` | Anonymous price visibility; effective only when `anonymousAccess` is true. |

`DefaultChannelReconciler` creates the default channel with `anonymousAccess: true` (explicit, so the
intent is in code and not only in the column default). `SalesChannelsService.create` accepts
`anonymousAccess` (default `true`); `update` accepts it; both bump `version`, invalidate the channel
cache and are audited by the existing path.

### `sales_channel_organizations` (owned by `organizations`, unchanged schema)

`(sales_channel_id, organization_id)` primary key, both FKs `on delete cascade`, index on
`organization_id` — exactly as created by `20260912T094646_organizations_sales_channel_organizations.ts`.
Meaning from this feature on: **the channels an Organization's members may use**. Invariant: an
Organization has ≥ 1 row (FR-015, the bridge's existing zero-channel refusal; creation paths bind
inside the creating transaction, research R-8). Written only by `SalesChannelMembershipService`.

### `sales_channel_customer_accounts` (owned by `customer_accounts`, unchanged)

Not read or written by this feature (research R-9).

### `carts` (owned by `carts`, unchanged schema)

`sales_channel_id` becomes always set (M3) and always the channel the basket is used on. The existing
unique index `carts_one_active_per_customer_per_channel` is the "one active basket per customer per
channel" invariant (FR-030). Anonymous baskets keep the unique `anonymous_cart_token`.

## 2. Runtime shapes

### `CachedChannel` (kernel, `sales-channels-cache.ts`)

`+ anonymousAccess: boolean`. Cache prefix `sales-channels:v2:` → `sales-channels:v3:`.

### `SalesChannelAccessCache` (kernel, new — `packages/platform/src/kernel/sales-channels/sales-channel-access-cache.ts`)

| Layer | Key | Value | TTL |
| --- | --- | --- | --- |
| LRU (per process, cap 4 096) | `sales-channel-access:v1:org:<orgId>` | `readonly string[]` channel ids | 30 s |
| Redis | same | JSON array | 300 s |
| Source | `listChannelsForEntity('organization', orgId)` through the membership service | — | — |

Invalidation (`SalesChannelAccessCacheInvalidation`): `invalidateAfterWrite(orgId)`,
`invalidateAllAfterWrite()`; each drops Redis first under `SharedDropMarks`, then the LRU, then
publishes `{ "organizationId": "<id>" | "*" }` on `b2b:sales-channel-access:changed`. Every composed
process subscribes from the kernel composition and drops its LRU entry; a lost subscription is
re-armed like the module-state subscriber, with the LRU TTL as the bound.

### `SalesChannelAccessPolicy` / port `salesChannelAccessPort` (kernel, new — `packages/platform/src/kernel/ports/sales-channel.ts`)

```ts
export type SalesChannelAccessDecision =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: 'SALES_CHANNEL_SIGN_IN_REQUIRED' | 'SALES_CHANNEL_NOT_PERMITTED' };

export interface SalesChannelAccessPort {
  /** The channel ids an Organization may use (cached). Empty set when none. */
  permittedChannelIds(organizationId: string): Promise<ReadonlySet<string>>;
  /** The rule of research R-3 for a non-admin, non-api-key actor. */
  decide(
    actor: { kind: 'anonymous' } | { kind: 'customer'; organizationId: string },
    channel: Pick<CachedChannel, 'id' | 'code' | 'anonymousAccess'>,
  ): Promise<SalesChannelAccessDecision>;
  /** `decide` for a customer, throwing the 403 HttpError — for sign-in paths. */
  assertCustomerMayUse(organizationId: string | null, channelId: string): Promise<void>;
}
```

Provided by the kernel composition as `salesChannelAccessPort` (ungated, like
`salesChannelMembershipPort`); consumers resolve it with `lazyPort<SalesChannelAccessPort>(ctx,
'salesChannelAccessPort')` and type on the published port type.

### `MembershipMutationOptions` (kernel, extended)

`+ em?: EntityManager` — when given, the bridge statements run on that manager's transaction
(research R-8). Absent, behaviour is unchanged.

### Fastify route option (platform `http`)

```ts
declare module 'fastify' {
  interface FastifyContextConfig {
    /** `'open'`: reachable whatever the channel-access rule says (research R-4). */
    salesChannelAccess?: 'open';
  }
}
```

### `CartCustomerContext` (contracts, extended)

`+ salesChannelId: string` — the channel whose basket is meant. Every producer (cart routes, the
placement path, quick order, shopping lists, cart→quote conversion) passes the request channel.

## 3. State and invariants

| Invariant | Held by |
| --- | --- |
| Every Organization has ≥ 1 channel | creating paths bind in-transaction (R-8); M2 for existing; membership service refuses zero |
| A customer request is answered only on a permitted channel | kernel access step (R-2/R-3) |
| An anonymous request is answered only on an open channel | kernel access step |
| A basket's channel is the channel it is used on | `CartService` lookups by `(owner, channel)` |
| An order's basket is of the order's channel | `placeOrder` refusal (`ORDER_SALES_CHANNEL_MISMATCH`) |
| A refused sign-in creates no session | `CustomerAuthService.login` order of checks; federated callback |

## 4. Audit and events

| Write | Audit | Event |
| --- | --- | --- |
| Channel `anonymousAccess` change | existing `sales_channel.identity.changed` audit with before/after | existing `sales_channels.identity_changed` |
| Organization channel add/remove/replace/bind | kernel membership audit `sales_channel.membership.changed`, one row per membership (object type `sales_channel_membership`, actor = admin or null for system) | existing `sales_channels.membership_changed` |
| Admin *New organization* | Command `organization.create` (before `null`, after the record) | none new |
| Backfills M2/M3 | none (migrations) | none |
