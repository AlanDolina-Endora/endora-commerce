---
'@endora-commerce/mod-settings': minor
---

A module can now translate the names and descriptions of its own settings on the admin Settings screen.

The screen used to show the `name` and `description` a settings manifest declares, in English, whatever
language the administrator works in. It now looks in the **owning module's own bundle** first, under
three key families, and falls back to the declared string when a key is absent:

| Key | Replaces |
| --- | --- |
| `settingLabels.<setting code>.name` | the setting's `name` |
| `settingLabels.<setting code>.description` | the setting's `description` |
| `settingGroups.<group code>.name` | the group's `name` |

The code is written whole, dots included, and the keys are flat like every other key in a bundle. For a
module `your_module` that declares the setting `your_module.base_url` in the group `your_section`, add to
`i18n/pl.json` (and the English wording to `i18n/en.json`):

```json
{
  "settingGroups.your_section.name": "Twoja sekcja",
  "settingLabels.your_module.base_url.name": "Bazowy adres URL",
  "settingLabels.your_module.base_url.description": "Adres, pod którym usługa jest dostępna."
}
```

Resolution is per key — the administrator's language, then English, then the manifest string — so
settings can be translated one at a time. Only the bundle of the module whose settings manifest declared
the row is read (its `moduleCode`, which has to equal the module `id`); a key for another module's
setting is ignored. The text is shown as written, with no parameter substitution. The choices of an
`enumOptions` setting are stored values and stay untranslated.

The filter on the Settings screen matches the translated name and description as well as the declared
ones.

**Nothing changes for an operator until a module ships these keys.** This release adds the lookup only;
no existing setting is translated by it, and a module that adds no key renders exactly as before. The
manifest `name` and `description` stay required: they are what the API returns and the last fallback.
