# Contract: admin surfaces — settings, the Settings-screen changes, the preview

**Feature**: `specs/144-seo-search-engine-robots/`. §1 and §4–§5 are `seo`'s; §2 is a change to
`@endora-commerce/contracts` and the `settings` module that serves every module; §3 is `seo`'s
endpoint.

## 1. Settings declared by `seo`

In `packages/modules/seo/src/manifest.ts`, group `seo`, beside `seo.enabled`.

| Code | `valueType` | Declaration | Default |
| --- | --- | --- | --- |
| `seo.default_robots` | `string` | `enumOptions: ['INDEX, FOLLOW', 'NOINDEX, FOLLOW', 'INDEX, NOFOLLOW', 'NOINDEX, NOFOLLOW']` | `'INDEX, FOLLOW'` |
| `seo.robots_txt_custom` | `string` | `multiline: true` | `''` |
| `seo.llms_txt_additional` | `string` | `multiline: true` | `''` |

- None is `hidden`; none restricts `salesChannelCodes`, so each takes an all-channels value and
  per-channel values through the existing settings API. No new write endpoint exists.
- A `SettingWriteValidator` contributed by `seo` for the two text codes refuses a value over
  65 536 bytes of UTF-8 with `400`, error code `SEO_CRAWLER_TEXT_TOO_LARGE`, and a message naming
  the limit — the status and shape `invoices`' numbering validator uses
  (`packages/modules/invoices/src/backend/services/numbering-write-validator.ts`). It is
  registered from a **contribution** boot hook, which by `specs/conventions/module-activation.md`
  item 3 does not probe presence: the registry filters by contributor at enumeration.
- `seo.enabled`'s description and the module's `description` gain the FR-033 sentence.

### Bundle keys (`packages/modules/seo/i18n/{en,pl}.json`, flat)

```text
settingGroups.seo.name
settingLabels.seo.enabled.name                    settingLabels.seo.enabled.description
settingLabels.seo.default_robots.name             settingLabels.seo.default_robots.description
settingLabels.seo.robots_txt_custom.name          settingLabels.seo.robots_txt_custom.description
settingLabels.seo.llms_txt_additional.name        settingLabels.seo.llms_txt_additional.description
actions.openSeo.label                             actions.openSeo.description
actions.openSearchEngineRobots.label              actions.openSearchEngineRobots.description
crawlerPreview.*                                  (the preview's own copy, §4)
```

## 2. Changes that serve every module

### 2.1 `multiline` on a setting declaration

- `SettingManifestEntrySchema` gains `multiline: z.boolean().optional()`, with a refinement:
  only for `valueType: 'string'`, and not together with `enumOptions`.
- `SettingDtoSchema` gains `multiline: z.boolean().optional()`.
- The platform's `settings` table gains `multiline boolean not null default false`
  (`--module core`); `ManifestReconciler` keeps it in step on every boot, exactly as it does
  `hidden`.
- The Settings screen renders a multi-line field for such a setting, preserving line breaks, with
  the same read-only, dirty and reset behaviour as every other row.
- Additive. A manifest that does not mention the field is unchanged, and a DTO consumer that does
  not read it is unaffected.

### 2.2 Names and descriptions from the owner's bundle

For a setting with code `<code>` owned by module `<owner>`, and a group with code `<group>`:

| Shown | Key, in `<owner>`'s bundle | Fallback |
| --- | --- | --- |
| setting name | `settingLabels.<code>.name` | the DTO's `name` |
| setting description | `settingLabels.<code>.description` | the DTO's `description` |
| group name | `settingGroups.<group>.name` | the DTO's `name` |

- Resolution is requested language → English → the DTO string. A key present in neither language
  is not a defect: it is a module that has not translated its settings.
- The server response is unchanged. Nothing is added to `_i18n`'s shared bundle.
- No ratchet is introduced; `check:bundle-pairing` still holds each module's `en` and `pl` files
  to each other at file level.

### 2.3 Zone member `settings.setting.after`

Added to `AdminZoneNameSchema` and `AdminZonePropsMap`, mounted by the Settings row editor once
per setting row, below the field.

```ts
interface SettingsSettingAfterZoneProps {
  /** The row's setting code, e.g. `seo.robots_txt_custom`. Matchable. */
  readonly settingCode: string;
  /** The module that declared the setting. Matchable. */
  readonly ownerModule: string;
  /** The sales channel being edited, or `null` for the all-channels value. */
  readonly channelCode: string | null;
  /** The field's current text, saved or not, for a string-typed setting; `null` otherwise. */
  readonly draftText: string | null;
  /** Whether `draftText` differs from what is stored. */
  readonly dirty: boolean;
}
```

- A contributor narrows itself with `match: { settingCode: '…' }`; an unmatched contribution's
  chunk is never fetched.
- The zone is not mounted for a `secret` setting: a contribution must never receive a secret's
  draft.
- The contributor's `requiredPermission`, its owner's presence, and `ZoneErrorBoundary` apply as
  for every zone. A failing contribution does not take the row with it.
- `check:admin-zones` holds both directions: the member is mounted by a host, and a contribution
  names a declared member.

## 3. `GET /api/v1/admin/seo/crawler-files/preview`

`preHandler: requireAdmin('settings:read')`. `503 MODULE_DISABLED` when `seo` is off.

Query — `adminCrawlerFilePreviewQuerySchema`:

| Param | |
| --- | --- |
| `file` | `robots` \| `llms` |
| `salesChannelCode` | required; the channel to preview |

Response — `adminCrawlerFilePreviewResponseSchema`:

```jsonc
{
  "data": {
    "file": "robots",
    "salesChannelCode": "pl",
    "state": "ok",
    "base": "User-agent: *\nAllow: /\nDisallow: /api/\n…\nSitemap: https://shop.example/sitemap.xml\n",
    "savedExtra": "User-agent: GPTBot\nDisallow: /\n",
    "savedExtraSource": "channel",
    "channelsWithOwnValue": ["pl", "de"],
    "policy": { "index": false, "follow": false },
    "storefront": { "url": "https://shop.example", "source": "setting" }
  }
}
```

| `state` | Meaning | `base` |
| --- | --- | --- |
| `ok` | the storefront answered with the capability header | its answer to `?part=system` / `?part=base` |
| `storefront-outdated` | it answered `2xx` **without** `X-Endora-Crawler-Files` | its whole answer for `robots`; `null` for `llms` |
| `not-served` | `llms` only: `404` **with** the header — the channel is non-indexable, or `seo` is not what the storefront sees | `null` |
| `storefront-unreachable` | timeout (3 s), refusal, any other status, a body over 512 KiB | `null` |
| `address-unknown` | the channel's address resolved from the fallback rung; no request was made | `null` |

- `savedExtra` is the stored text that resolves for the channel; `savedExtraSource` is
  `channel`, `global` or `default`. `channelsWithOwnValue` lists the channel codes holding a
  value of their own for this setting (FR-040).
- `storefront.source` is `setting`, `env` or `fallback`. With `env` the address is shared by
  every channel and the preview says so.
- The endpoint stores nothing and caches nothing. It is a read; no Command, no audit entry.
- The request to the storefront is `GET <storefront.url>/robots.txt?part=system` or
  `/llms.txt?part=base`, with `X-Sales-Channel: <salesChannelCode>`, following no redirect to
  another host.

## 4. The preview component

`seo` contributes two zone components (`zoneComponent('settings.setting.after', …, { match,
requiredPermission: 'settings:read' })`).

| The operator sees | When |
| --- | --- |
| The system part and their own part as two labelled blocks, in served order; the system block marked read-only by text and icon, not by colour alone | `state: ok` |
| Their own part taken from `draftText`, with a "not yet saved — the storefront still serves the saved version" notice | `dirty` |
| A channel picker and "these channels have their own value and are not affected: …" | `channelCode === null` (all-channels value) |
| "robots.txt stays open to crawlers on purpose: a crawler has to fetch a page to read that it must not be indexed" | `file: robots` and `!policy.index` |
| A caution that a site-wide `Disallow: /` prevents crawlers from reading `noindex` | as above, and the operator's part contains a `Disallow: /` line under `User-agent: *` |
| "No llms.txt is served for this channel while its default robots forbids indexing" in place of the blocks | `file: llms` and `!policy.index`, or `state: not-served` |
| "This storefront does not serve custom instructions yet" above the rules it does serve | `state: storefront-outdated` |
| "The storefront could not be reached" / "This channel has no storefront address configured", the operator's own block still shown, no system block | `storefront-unreachable` / `address-unknown` |
| "This address is shared by every sales channel" | `storefront.source === 'env'` |

- The composed text is `composeCrawlerFile(base, operatorPart)` — the function the storefront
  serves with (`crawler-policy.md` §4).
- The preview never disables or delays the row's save.
- It is refetched when the channel changes; typing does not call the backend.
- Built from existing admin-kit primitives; no new primitive is introduced (Principle IX).

## 5. Palette actions

| `id` | `targetRoute` | `requiredPermission` | `icon` |
| --- | --- | --- | --- |
| `open-seo` | `/seo` | `catalog:write` | `Search` |
| `open-search-engine-robots` | `/settings` | `settings:read` | `Search` |

Both icons are already in `KnownIconNameSchema`'s map (the nav entry uses `Search`); keywords
include `robots`, `noindex`, `llms`, `seo`, `sitemap`, `indeksowanie`.
