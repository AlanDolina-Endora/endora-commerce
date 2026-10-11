# Data model: search engine robots (`specs/144-seo-search-engine-robots/`)

**No new table and no new entity class.** The three values are ordinary settings; the feature
adds one column to a platform table for a presentation flag that serves every module.

## 1. Settings (rows in the existing `settings` / `setting_values` tables)

Owned by `seo`, created by the manifest reconciler at boot, removed by the lifecycle's settings
sweep on uninstall — the existing lifecycle of every module-declared setting.

| Code | Stored value | Validation on write | Resolution |
| --- | --- | --- | --- |
| `seo.default_robots` | one of `INDEX, FOLLOW`, `NOINDEX, FOLLOW`, `INDEX, NOFOLLOW`, `NOINDEX, NOFOLLOW` | the settings store's closed-list check (`enumOptions`) | channel value → all-channels value → `INDEX, FOLLOW` |
| `seo.robots_txt_custom` | text | ≤ 65 536 bytes UTF-8 (`seo`'s write validator) | channel value → all-channels value → `''` |
| `seo.llms_txt_additional` | text | ≤ 65 536 bytes UTF-8 (same validator) | channel value → all-channels value → `''` |

- **Tenancy (Principle XI)**: settings are platform-global configuration, already classified;
  no organization-scoped data is read or written by this feature, and no new entity needs a
  classification.
- **Channel scope (Principle XII)**: every read names a resolved sales channel. There is no read
  path with no channel: the storefront endpoints resolve one from the request or fall to the
  system default, and the admin preview requires `salesChannelCode`.
- **Audit (Principle XIII)**: writes go through the existing settings write path, which records
  an audit entry with actor and before/after through `AuditPort`
  (`packages/modules/settings/src/backend/services/settings-admin.service.ts`). This feature adds
  no write of its own. The values are not secrets and appear in the audit entry in full.
- **Off state (Principle XVII)**: rows and values are untouched when `seo` is deactivated; the
  settings API reports them `editable: false`.

## 2. Schema change

One column, on the platform's `settings` table:

| Column | Type | Default | Written by | Read by |
| --- | --- | --- | --- | --- |
| `multiline` | `boolean not null` | `false` | `ManifestReconciler`, from the manifest's `multiline`, on every boot | `serializeSetting` → `SettingDto.multiline` → the Settings row editor |

- Planned by **ownership**: the table is the platform's, so the migration is scaffolded with
  `pnpm --filter backend run migration:new -- --module core` and registered through
  `composer:generate`. No number is assigned here.
- It depends on nothing but the table existing, and nothing in `seo`'s own migrations depends on
  it; `seo` gains no migration.
- Backfill: none. Every existing row takes `false`, which is today's behaviour.
- Reversible: dropping the column loses only a presentation flag the next boot would restore.

## 3. Values that exist only in a process

| Value | Where | Lifetime | Why it is not stored |
| --- | --- | --- | --- |
| Last-known robots policy per channel | the storefront's middleware module scope | the process | FR-017 needs an answer when the backend does not give one; a stored copy would need its own invalidation |
| Last-known crawler files per channel | the storefront's Node module scope | the process | FR-022, same reasoning |
| The system-generated rules | `storefront/lib/seo/robots-system-rules.ts` — source code | a release | FR-041: one statement, owned by the storefront |
| The preview's `base` | the response of one admin request | the request | FR-041: never remembered by the backend or the Admin UI |

## 4. Derived shapes on the wire

Defined in `packages/contracts/src/seo.ts`; described in `contracts/crawler-policy.md` and
`contracts/admin-surfaces.md`.

| Schema | Shape |
| --- | --- |
| `storefrontRobotsPolicySchema` | `{ index: boolean, follow: boolean }` |
| `storefrontCrawlerFilesSchema` | policy + `robotsTxtCustom`, `llmsTxtAdditional`, `shop: { name }` |
| `adminCrawlerFilePreviewQuerySchema` | `{ file: 'robots' \| 'llms', salesChannelCode }` |
| `adminCrawlerFilePreviewResponseSchema` | `file`, `salesChannelCode`, `state`, `base`, `savedExtra`, `savedExtraSource`, `channelsWithOwnValue`, `policy`, `storefront: { url, source }` |
| `SettingsSettingAfterZoneProps` | `settingCode`, `ownerModule`, `channelCode`, `draftText`, `dirty` |

The mapping between the stored token and `{ index, follow }` is one pure function in `seo`'s
backend, total over the four values; an unknown stored value (which the closed list makes
unreachable through the API) maps to `{ index: true, follow: true }` and is logged, so a corrupt
row can never de-index a shop.

## 5. State transitions

None. The feature has configuration and no workflow. The one state machine is the storefront
reader's classification of a backend answer (`contracts/crawler-policy.md` §3): *value*, *none*,
*unreadable* → *last-known* or *unknown*.
