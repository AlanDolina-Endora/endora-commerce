import { defineModuleManifest, defineModuleSettingsManifest } from '@endora-commerce/contracts';

/**
 * Global search — find records of every type from the admin's command palette,
 * and decide which fields each type is searched by
 * (`specs/150-admin-global-search/`).
 *
 * The module owns no table. It hosts the provider registry the owning modules
 * push their record types into, the federated search endpoint, the search
 * configuration (Settings rows) and the two screens. It is operator-toggleable
 * (Constitution XVII): `admin_search.enabled` is its activation control, and
 * switching it off withdraws record search from the palette, the results page,
 * the configuration screen and the API — nothing is deleted.
 */

const settings = defineModuleSettingsManifest({
  moduleCode: 'admin_search',
  groups: [
    {
      code: 'admin_search',
      name: 'Global search',
    },
  ],
  settings: [
    {
      // The operator's activation control. Platform-wide.
      code: 'admin_search.enabled',
      name: 'Global search enabled',
      description:
        'Switches record search in the admin on or off: the record groups in the command palette, the full results page, the searchable-fields configuration and their API. The command palette keeps finding screens and actions either way. Nothing is dropped — the configuration stays in the database and applies again when you switch it back on.',
      groupCode: 'admin_search',
      valueType: 'boolean',
      defaultValue: true,
    },
  ],
});

export const manifest = defineModuleManifest({
  id: 'admin_search',
  name: 'Global search',
  description:
    'Find organizations, customers, orders, quote requests, sales opportunities, products and categories from the admin command palette, with configurable searchable fields.',
  version: '1.0.0',
  // The ports this module resolves: `requireAdmin` (`auth`), the caller's
  // permission list (`admin_roles`), server-side label resolution (`_i18n`) and
  // the settings store its configuration lives in (`settings`). All four are
  // non-deactivatable, so this module holds no other module's switch.
  dependencies: ['_i18n', 'auth', 'admin_roles', 'settings'],
  settings,
  // Constitution XVII — the operator's activation control.
  activation: { settingCode: 'admin_search.enabled', default: true },
  docs: false,
  demo: false,
});
