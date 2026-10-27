---
'@endora-commerce/admin-kit': minor
'@endora-commerce/admin-shell': minor
'@endora-commerce/mod-i18n': minor
---

The signed-in administrator's Admin UI preferences, kept on the server, and a Pinned section in the sidebar (feature 164).

- **`useAdminPreference(key)` and `useAdminPreferencesStatus()`** (`@endora-commerce/admin-kit/lib`). `AuthProvider` now provides the signed-in administrator's preferences itself — no extra provider to mount. `useAdminPreference('sidebarPins' | 'sidebarCollapsedGroups' | 'sidebarRailMode')` returns the value and a setter that applies at once and saves in the background, newest value last, retried on reconnect and when the page returns to the foreground. `useAdminPreferencesStatus()` reports whether the preferences loaded and whether a save failed. A session seeded through `AuthProvider`'s `initial` without `preferences` reads the defaults; a fetched one without them opens with the defaults and saves nothing until a later load succeeds. `AdminMe` gains `preferences?: AdminPreferences | null`.
- **Pinned sidebar section** (`@endora-commerce/admin-shell`). Every sidebar entry has a pin button after its link (a Tab stop of its own; always visible with a 44 px target on touch). Pinned entries appear first, in a section of their own, in the expanded sidebar, the mobile drawer and — as the first icon — the collapsed rail, where its fly-out lists the pins with an unpin button. A pin whose entry the administrator cannot see is not shown. Pinning and unpinning are announced.
- **Pinning from the command palette.** A result whose destination is a sidebar entry has a pin button beside it, and `Alt+Enter` (`⌥↵`) pins or unpins the highlighted result; `Enter` still opens it. No palette entry or group is added.
- **A failed save** keeps the change on screen and shows one dismissible notice below the top bar.
- **New `core` strings** (`@endora-commerce/mod-i18n`, English and Polish): `appShell.pinned.*`, `appShell.palette.pin.*`, `adminPreferences.saveFailed`, `adminPreferences.dismiss`.
- **Theme** (`@endora-commerce/admin-kit/theme.css`): `.b2b-nav-row`, `.b2b-nav-pin`, `.b2b-palette__pin` and the notice's classes.
