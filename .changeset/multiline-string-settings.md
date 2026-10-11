---
'@endora-commerce/contracts': minor
'@endora-commerce/platform': minor
'@endora-commerce/mod-settings': minor
---

A `string` setting can be declared multi-line, and the Settings screen then edits it in a multi-line field that keeps line breaks exactly.

**For a module author.** Add `multiline: true` to the setting's entry in the module's settings
manifest:

```ts
defineModuleSettingsManifest({
  moduleCode: 'your_module',
  settings: [
    {
      code: 'your_module.footer_note',
      name: 'Footer note',
      valueType: 'string',
      defaultValue: '',
      multiline: true,
    },
  ],
});
```

Nothing else changes: the value is still a `string`, is read through `SettingsService.get` as
before, and resolves per sales channel like every other setting. What is typed is what is stored —
line breaks, blank lines, indentation and a trailing line break included.

`SettingManifestEntrySchema` accepts `multiline` only on `valueType: 'string'` and not together with
`enumOptions`; any other combination fails when the manifest is parsed, with the issue on
`multiline`. The flag is presentation, kept in step with the manifest by `ManifestReconciler` on
every boot in both directions, so adding or removing it later is not a breaking change and never
touches a stored value. `SettingDtoSchema` gains an optional `multiline: boolean`, which
`GET /api/v1/admin/settings` and `GET /api/v1/admin/settings/:code` now always send — read it if
your module renders its own editor for a setting.

**For an operator upgrading.** This release carries one platform migration,
`Migration20261011T135250CoreSettingsMultiline`, which adds `settings.multiline boolean not null
default false`. It rewrites no row and needs no backfill. It is one of the platform's own
migrations, so an instance receives it with `@endora-commerce/platform` and `pnpm run upgrade
<version>` applies it with the release's other migrations. Every existing setting stays single-line,
so the Settings screen looks and behaves exactly as it did until a module you install declares the
flag.

Take the migration back only together with the packages. `down` drops the column and loses nothing
but the flag, which the next boot of a release that has it would restore — but this release's code
expects the column: over a database without it, a new setting cannot be registered and a declared
`multiline` cannot be stored, and the instance fails at boot. Reverting the migration is safe as
part of downgrading `@endora-commerce/platform` and `@endora-commerce/mod-settings` to the previous
version, and not on its own.

The Settings screen also names the multi-line field after the setting for assistive technology, and
the line under it that previews the default and current value shows one shortened line for such a
setting rather than the whole text.
