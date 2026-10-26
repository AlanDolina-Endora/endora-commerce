import { defineModuleManifest, defineModuleSettingsManifest } from '@endora-commerce/contracts';

/**
 * Tasks — a first version of Tasks assigned to admin users, with a due date and
 * a status (`specs/163-projects-and-tasks/`). Any module may own Tasks through
 * an opaque context; this module names none of them.
 *
 * The module is operator-toggleable (Constitution XVII): `tasks.enabled` is its
 * activation control, and everything it contributes — routes, ports, admin
 * surfaces — stops with it. Nothing is dropped while it is off.
 */

const settings = defineModuleSettingsManifest({
  moduleCode: 'tasks',
  groups: [
    {
      code: 'tasks',
      name: 'Tasks',
    },
  ],
  settings: [
    {
      // The operator's activation control. Platform-wide.
      code: 'tasks.enabled',
      name: 'Tasks enabled',
      description:
        'Switches Tasks on or off: the Tasks list, My Tasks, the Task screens and the Tasks other modules create. Nothing is dropped — every Task and its history stay in the database and reappear when Tasks is switched back on.',
      groupCode: 'tasks',
      valueType: 'boolean',
      defaultValue: true,
    },
  ],
});

export const manifest = defineModuleManifest({
  id: 'tasks',
  name: 'Tasks',
  description:
    'Tasks assigned to admin users, with a due date and a status, which any module can own through an opaque context.',
  version: '1.0.0',
  // `auth` owns `requireAdmin`, which gates every route of this module;
  // `settings` owns the store the activation control lives in.
  dependencies: ['auth', 'settings'],
  settings,
  // Constitution XVII — the operator's activation control.
  activation: { settingCode: 'tasks.enabled', default: true },
  // Nothing to document yet: the page lands with the first operator-visible
  // surface (Phase 2).
  docs: false,
  // `false` is a decision, absent would be "nobody has decided".
  demo: false,
});
