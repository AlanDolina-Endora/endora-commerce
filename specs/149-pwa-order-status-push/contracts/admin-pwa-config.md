# Contract: admin PWA config and screen (`pwa`)

## API — existing routes, additive fields

`GET /api/v1/admin/pwa/config?salesChannelId=<uuid|omitted>` (`pwa:read`) — `PwaAdminConfigSchema`
gains:

```json
{ "orderStatusPushEnabled": true, "quoteStatusPushEnabled": true }
```

the effective setting values for the requested scope (global when `salesChannelId` is omitted),
read like `pushEnabled` (`safeBool`, `routes.admin.ts`).

`PUT /api/v1/admin/pwa/config` (`pwa:write`) — `UpdatePwaConfigRequestSchema` gains both as optional
booleans; each present field becomes one write of `pwa.push_order_status_enabled` /
`pwa.push_quote_status_enabled` through `settingsWrite.setValueForSubset` (channel scope) or
`setValueForAllChannels` (global), exactly like `pushEnabled` — i.e. through the settings module's
audited path (FR-004).

The per-channel reset (`POST /api/v1/admin/pwa/config/reset`) iterates
`Object.values(PWA_SETTING_CODES)`, so adding the two codes to that constant is all it needs; a
contract assertion pins it.

No new route, no new permission code, no new error code.

## Screen — `packages/modules/pwa/src/admin/pages/PwaPage.tsx`

In the *Capabilities* card, directly under "Enable push notifications":

| Control | Primitive | State |
| --- | --- | --- |
| "Notify on order status changes" | admin-kit `Checkbox` + `Label`, indented | `disabled` while `config.pushEnabled` is false |
| "Notify on quote status changes" | same | `disabled` while push is off; **not rendered** when `useModulePresence().isPresent('quote_requests')` is false |
| hint line (`settings.field.statusPushHint`) | muted text | shown under the two checkboxes |

Saved with the card's existing **Save** action (same `patch` / `PUT` flow). All new strings through
`useTranslation('pwa')`; the hard-coded baseline for this file must not rise.

## Command palette — `packages/modules/pwa/src/manifest.ts`

```ts
actions: [
  {
    id: 'open-settings',
    labelKey: 'actions.openSettings.label',
    descriptionKey: 'actions.openSettings.description',
    icon: 'Smartphone',
    targetRoute: '/settings/pwa',
    requiredPermission: 'pwa:read',
    keywords: ['pwa', 'push', 'notifications', 'app', 'powiadomienia', 'aplikacja'],
    weight: 1400,
  },
],
```

`pwa:read` is the code the route enforces (`src/admin/index.ts` `READ_PERMISSION`), which is what
`check:action-route-permissions` verifies.

## Settings manifest

Two entries appended to `pwaSettingEntries` (hidden, group `pwa`, boolean, default `true`) — see
data-model §2.
