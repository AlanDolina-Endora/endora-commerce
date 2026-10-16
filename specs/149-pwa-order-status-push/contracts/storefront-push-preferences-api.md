# Contract: storefront push preferences API (`pwa`)

Schemas: `PushPreferencesSchema`, `UpdatePushPreferencesRequestSchema` in
`packages/contracts/src/pwa.ts` (data-model §5). Routes registered in
`packages/modules/pwa/src/backend/routes.storefront.ts`, therefore inside `ctx.routes` and gated on
`pwa`'s effective presence.

Both routes take the auth guard `requireCustomer` (the `auth` module's cradle registration, which
`pwa` already declares in `dependencies`) as their **`preHandler`**, so an anonymous caller is
answered `401` before validation (`module-admin-surfaces.md` item 3 applies the same rule to
storefront gates). The account is `request.actor.customerAccountId` — never a body or path value.

## `GET /api/v1/storefront/pwa/preferences`

Response `200`:

```json
{ "data": { "orderStatus": true, "quoteStatus": false } }
```

- No row → `{ "orderStatus": true, "quoteStatus": true }` (FR-018). The read writes nothing.
- The value is the stored choice, independent of whether the category is currently offered on the
  channel; the storefront decides what to *show* from the public config (FR-020).

## `PUT /api/v1/storefront/pwa/preferences`

Request (`UpdatePushPreferencesRequestSchema`, strict, at least one field):

```json
{ "quoteStatus": false }
```

Response `200`: the full resulting preferences, same shape as `GET`.

Behaviour: runs `CommandBus.run` with

| Field | Value |
| --- | --- |
| `action` | `pwa.push_preference.update` |
| `objectType` | `push_notification_preference` |
| `objectId` | the row id (generated before the run for a first write) |
| `capture` | `{ orderStatus, quoteStatus }` before, or `null` for a first write |
| `run` | upsert by `customerAccountId`, stamping `organizationId` from `customerAccountReadPort` |
| `after` | `{ orderStatus, quoteStatus }` |
| actor | server-derived (`kind: 'customer'`, or the impersonation pair) |

Not reversible. No domain event.

## Errors

| Status | `error.code` | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` (platform) | body fails the schema (unknown key, no field, non-boolean) |
| 401 | platform unauthenticated code | no customer session |
| 503 | `MODULE_DISABLED` | `pwa` switched off (route gate), or `customer_accounts` refusing the organisation lookup on a write |

No new error code is introduced.

## Public config (existing route, additive fields)

`GET /api/v1/storefront/pwa/config` gains `orderStatusPushEnabled` and `quoteStatusPushEnabled`
(data-model §4). The storefront renders:

| Element | Shown when |
| --- | --- |
| whole "Push notifications" section | `pushEnabled` and the preferences `GET` succeeded |
| "Order status updates" checkbox | `orderStatusPushEnabled` |
| "Quote updates" checkbox | `quoteStatusPushEnabled` |
| preferences form | at least one checkbox is shown |
| device control (`PushNotificationsToggle`) | unchanged rules (`pushToggleState`) |

## Storefront wiring

- `storefront/lib/api/pwa-server.ts`: `getPushPreferences(sessionCookie, ctx)` and
  `updatePushPreferences(sessionCookie, ctx, patch)` over the authed server client the account area
  already uses; `DEFAULT_CONFIG` gains both new config fields as `false`.
- `storefront/components/pwa/PushPreferencesForm.tsx`: server-rendered `<form>` with two native
  checkboxes and a submit button; a server action in `app/(account)/account/page.tsx` sends only
  the fields present on the form and redirects back with `?pushSaved=1` or `?pushError=1`.
- Unchecked checkbox semantics: the action sends `false` for each checkbox **rendered** and absent
  from the form data, and omits a checkbox that was not rendered.
