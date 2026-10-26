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
  // `settings` owns the store the activation control lives in;
  // `admin_users` owns `adminUserReadPort`, through which an assignee and a
  // creator are named. All three are non-deactivatable.
  dependencies: ['admin_users', 'auth', 'settings'],
  settings,
  // Constitution XVII — the operator's activation control.
  activation: { settingCode: 'tasks.enabled', default: true },
  /**
   * Reading Tasks. `tasks:write` arrives with the first write route (User
   * Story 2): a code is declared by the change that adds its first
   * `requireAdmin`, so no code is grantable before it gates anything.
   */
  permissions: [
    {
      code: 'tasks:read',
      label: 'View tasks',
      module: 'tasks',
    },
  ],
  /**
   * The refusals this module raises, each with its sentence under
   * `errors.<CODE>` in `i18n/{en,pl}.json`, declared by the change that added
   * its first raise site.
   */
  errorCodes: [{ code: 'TASK_NOT_FOUND' }, { code: 'TASK_CONTEXT_INVALID' }, { code: 'TASK_ASSIGNEE_INVALID' }],
  i18n: { bundlesDir: 'i18n' },
  // `docs/tasks.md` at the package root: users' and developers' page.
  docs: { dir: 'docs' },
  // `false` is a decision, absent would be "nobody has decided".
  demo: false,
});
