---
'@endora-commerce/mod-seo': minor
'@endora-commerce/mod-settings': minor
'@endora-commerce/contracts': minor
'@endora-commerce/cli': minor
---

The Settings screen previews the `robots.txt` a sales channel's storefront serves, and a module can now contribute beside a setting it declared.

**For an operator.** Below **Settings → SEO → Custom robots.txt instructions** there is now a
preview of the file the selected sales channel's storefront serves, in two labelled blocks: the
rules the storefront generates, read-only, and your own text. Your block follows the field as you
type; while it differs from what is saved, the preview says that it is not saved yet and that the
storefront still serves the saved version. Under **All channels** you pick the channel to preview,
and the preview names the channels that have a value of their own and are therefore not affected.
On a channel whose *Default robots* is `NOINDEX` it says that `robots.txt` stays open on purpose,
and warns when your text contains `Disallow: /` for every crawler. An administrator who may read
settings but not change them sees it too. Nothing the storefront serves changes when you preview.

The generated rules are not copied into the backend or the Admin UI: each time, the backend asks
the channel's storefront for them. So **the storefront must be reachable from the backend at the
address the channel is configured with** — the channel's **Storefront URL** setting, else
`STOREFRONT_BASE_URL`. When it is not, the preview says so and shows your block alone; saving is
never blocked. The three messages and what to do about each:

- *The storefront could not be reached* — no answer within three seconds, a refused connection,
  an error, a redirect, or an answer that is not a plain-text file. Check that the storefront runs
  and that the configured address is the one it answers at itself. The server log line
  `seo: the crawler-file preview could not show the storefront’s part` carries the reason.
- *This sales channel has no storefront address configured* — set **Storefront URL** for the
  channel, or `STOREFRONT_BASE_URL`.
- *This storefront does not serve custom instructions yet* — the storefront was scaffolded from a
  release before these settings existed. It serves only its generated rules and ignores both the
  custom instructions and *Default robots*. The same notice now appears on the *Default robots*
  row, so a shop is not believed to be out of search while its storefront ignores the setting.
  Update the storefront's files as the notes of the release that introduced those settings list.

What the backend sends is one request per preview: `GET <origin>/robots.txt?part=system`, to the
origin of the configured address only, with the channel's code in `X-Sales-Channel`. It follows no
redirect, waits at most three seconds, reads at most 512 KiB, accepts only `text/plain`, sends no
cookie or credentials, and stores nothing. A path or query in the configured address is not used.
Private and loopback addresses are **not** refused, because an instance's own storefront is
routinely reached at one; who may point a channel at an address is whoever holds `settings:write`,
as before.

No migration, no new setting, no new environment variable, no new permission.

**For a module author: `settings.setting.after`.** `AdminZoneNameSchema` has a new member, mounted
by the Settings screen once per setting row, below the field. Contribute to it to show what a
setting you declared amounts to — a preview, a consequence, a warning:

```ts
import { zoneComponent, type AdminContributions } from '@endora-commerce/admin-kit/contributions';

export const contributions: AdminContributions = {
  zones: [
    zoneComponent('settings.setting.after', () => import('./zones/FooterNotePreview.js'), {
      match: { settingCode: 'your_module.footer_note' },
      requiredPermission: 'settings:read',
    }),
  ],
};
```

The component receives `SettingsSettingAfterZoneProps`: `settingCode`, `ownerModule`,
`channelCode` (the sales channel being edited, or `null` for the all-channels value), `draftText`
(the text in the field **now**, saved or not, for a `string` setting; `null` for every other value
type) and `dirty`. Narrow with `match` on `settingCode` or `ownerModule` — an unmatched
contribution's chunk is never fetched. The props go one way: a contribution cannot change the
value or hold up the row's save, and it should say in words when what it shows is not saved yet.
The zone is not mounted for a `secret` setting, so a contribution never receives a secret's draft.
A contribution vanishes with its module, and a failing one does not take the row with it.

**If you render `SettingRowEditor` yourself.** `@endora-commerce/mod-settings`' row editor now
mounts a zone, so it must be rendered under `AdminContributionsProvider` and the session
providers, as every host screen that mounts a zone is. The Admin UI already does; a test that
renders the row or `SettingsPage` on its own needs the providers around it.

**In `@endora-commerce/contracts`.** New: `adminCrawlerFilePreviewQuerySchema`,
`adminCrawlerFilePreviewResponseSchema`, `adminCrawlerFilePreviewSchema`,
`adminCrawlerFilePreviewStateSchema`, `adminCrawlerFileSchema`, their inferred types, and
`CRAWLER_FILES_CAPABILITY_HEADER` (`X-Endora-Crawler-Files`) — the response header by which a
storefront says it serves crawler files the current way. A custom storefront that implements
`?part=system` should send it; without it the preview treats the storefront as outdated. The
endpoint is `GET /api/v1/admin/seo/crawler-files/preview?file=robots&salesChannelCode=<code>`,
gated by `settings:read`; `file=llms` is declared in the schema and answers `400` until `llms.txt`
is served.

`@endora-commerce/mod-seo` now declares `lucide-react` as an optional peer dependency, as the other
module packages with an admin surface do; an application that has the Admin UI already has it.

**In `@endora-commerce/cli`: `check:channel-resolution` no longer reports a header that is sent.**
The rule's first signal flags every `x-sales-channel` string literal, because a module must not
read that header from a request — the resolver does. A module that makes a request of its own to
another server and names the sales channel in it was reported as well. The key of an object literal
under a `headers:` property — `fetch(url, { headers: { 'X-Sales-Channel': channel.code } })` — is
now exempt, as a CORS policy's `allowedHeaders` array already was. What stays reported: an
element access on a headers object, a `.get(...)` argument, the name held in a constant, a
computed key, a destructuring declaration, and a destructuring *assignment*
(`({ headers: { 'x-sales-channel': code } } = request)`, also as the variable of a `for…of` or
`for…in`), which has the exempted shape and is refused by its position.
