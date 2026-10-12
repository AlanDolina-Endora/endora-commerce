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
| `salesChannelCode` | optional; the channel to preview. Absent means the **system default channel** — what an administrator who may read settings but may not list sales channels asks for (FR-045). The answer's `salesChannelCode` names the channel it is about |

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
| `storefront-outdated` | it answered `2xx` **without** `X-Endora-Crawler-Files` — it did not confirm that it supports the feature. Usually an older storefront; also a partly updated one, or a proxy that strips the header, so the Admin UI says "did not confirm" and "may". For `llms` also a `404` without the header *(slice 5)*: a storefront that has no such route | its whole answer for `robots`; `null` for `llms` |
| `not-served` | `llms` only: `404` **with** the header — the channel is non-indexable, or `seo` is not what the storefront sees. Nothing of the `404`'s body is read | `null` |
| `storefront-unreachable` | timeout (3 s, over connection, headers and body), refusal, any other status **including every redirect**, an answer that is not `text/plain`, a body over 512 KiB, a configured address that is not an `http(s)` origin or carries credentials | `null` |
| `address-unknown` | the channel's address resolved from the fallback rung; no request was made | `null` |

- `savedExtra` is the stored text that resolves for the channel; `savedExtraSource` is
  `channel`, `global` or `default`. `channelsWithOwnValue` lists the channel codes holding a
  value of their own for this setting (FR-040).
- `storefront.source` is `setting`, `env` or `fallback`. With `env` the address is shared by
  every channel and the preview says so.
- The endpoint stores nothing and caches nothing. It is a read; no Command, no audit entry.
- The request to the storefront is `GET <origin of storefront.url>/robots.txt?part=system` (or
  `/llms.txt?part=base`), with `X-Sales-Channel: <the channel's code>`. Only the **origin** of the
  configured address is used; a path or query in it is dropped. **No redirect is followed**, to
  another host or to the same one. No credentials, cookies or caller headers are sent.
- `file=llms` answered `400` until slice 5; it is now answered like `robots`. An unknown channel
  code is `404`.
- A `503` from the storefront's `llms.txt` — it cannot tell whether the channel may be indexed
  (`crawler-policy.md` §5) — is `storefront-unreachable`, not `not-served`.
- A stored `seo.default_robots` outside the four tokens still fails **this** endpoint with `500`
  for both files (the preview's `policy` has no "not known"); the row shows "the preview could not
  be loaded". The storefront's own `robots.txt` is served regardless (`crawler-policy.md` §2.2).
- Private, loopback and link-local addresses are **not** refused: an instance's own storefront is
  routinely reached at one. The disclosure is in the service's doc comment and the module page.

## 4. The preview component

`seo` contributes three zone components (`zoneComponent('settings.setting.after', …, { match,
requiredPermission: 'settings:read' })`): the two previews and the *Default robots* notice.
**The two previews are one component**, `CrawlerFilePreview`, given the file — `RobotsTxtPreview`
and `LlmsTxtPreview` are wrappers that name it *(slice 5)*. Everything in the table is true of
both unless the row names a file; beside `llms.txt` the words are "content" rather than
"instructions" and the headings name `llms.txt`.

| The operator sees | When |
| --- | --- |
| **One block whose text is the served file** — `composeCrawlerFile(base, operatorPart)` to the byte. Inside it the operator's lines carry a bar on the left and a label, the generated lines a "generated · read-only" label; the labels are drawn by the stylesheet and are not text in the block. Heading: "robots.txt as served now" | `state: ok` |
| The same block with the operator's lines taken from `draftText`; heading "robots.txt after saving"; a secondary line that the storefront keeps serving the previous version until the save | `dirty` |
| A channel picker and "these channels have their own value and are not affected: …" | `channelCode === null` (all-channels value) |
| "robots.txt stays open to crawlers on purpose: a crawler has to fetch a page to read that it must not be indexed" | `file: robots` and `!policy.index` |
| A caution that a site-wide `Disallow: /` prevents crawlers from reading `noindex` | as above, and the operator's part contains a `Disallow: /` line under `User-agent: *` |
| Heading "llms.txt is not served" and "No llms.txt is served for this sales channel while its Default robots asks search engines not to index it" **in place of the block** — no file, and the operator's text is not drawn apart either | `file: llms` and `!policy.index` — whether the storefront already answers `not-served` or still serves the file inside its own minute |
| The same heading and "The storefront serves no llms.txt for this sales channel at the moment…" *(slice 5)* — the setting is not blamed for it | `file: llms`, `state: not-served` and `policy.index` (the storefront has not caught up, or sees no `seo`) |
| "This storefront did not confirm that it serves llms.txt"; no file block; the operator's text apart, marked "may not be served" | `file: llms` and `state: storefront-outdated` |
| "This storefront did not confirm that it supports custom instructions" above a block that is the rules it serves alone; the operator's text apart, marked "may not be served" | `state: storefront-outdated` |
| "The storefront could not be reached" / "This channel has no storefront address configured"; no file block; the operator's own text still shown, apart | `storefront-unreachable` / `address-unknown` |
| "This address is shared by every sales channel" | `storefront.source === 'env'` |

- The composed text is `composeCrawlerFile(base, operatorPart)` — the function the storefront
  serves with (`crawler-policy.md` §4).
- The preview never disables or delays the row's save.
- It is refetched when the channel or the editing mode (all channels / one channel) changes, when
  any of the three `seo` rows stops being dirty (a save or a reset), and on "Check again"; typing does not
  call the backend. An answer is kept only while a row is showing it.
- Built from existing admin-kit primitives; no new primitive is introduced (Principle IX).

## 5. Palette actions

| `id` | `targetRoute` | `requiredPermission` | `icon` |
| --- | --- | --- | --- |
| `open-seo` | `/seo` | `catalog:write` | `Search` |
| `open-search-engine-robots` | `/settings` | `settings:read` | `Search` |

Both icons are already in `KnownIconNameSchema`'s map (the nav entry uses `Search`); keywords
include `robots`, `noindex`, `llms`, `seo`, `sitemap`, `indeksowanie`.
