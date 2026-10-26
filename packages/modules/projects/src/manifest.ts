import { defineModuleManifest, defineModuleSettingsManifest } from '@endora-commerce/contracts';

/**
 * Projects — Projects for zero or more Organizations, run through per-Project
 * Stages by Members holding Project Roles (`specs/163-projects-and-tasks/`).
 *
 * The module is operator-toggleable (Constitution XVII): `projects.enabled` is
 * its activation control, and everything it contributes — routes, workers,
 * admin surfaces — stops with it. Nothing is dropped while it is off.
 */

const settings = defineModuleSettingsManifest({
  moduleCode: 'projects',
  groups: [
    {
      code: 'projects',
      name: 'Projects',
    },
  ],
  settings: [
    {
      // The operator's activation control. Platform-wide.
      code: 'projects.enabled',
      name: 'Projects enabled',
      description:
        'Switches Projects on or off: the Project screens, Templates, analytics and the Project panels on Orders, Quote Requests and Opportunities. Nothing is dropped — every Project, its Stages and its history stay in the database and resume where they were.',
      groupCode: 'projects',
      valueType: 'boolean',
      defaultValue: true,
    },
  ],
});

export const manifest = defineModuleManifest({
  id: 'projects',
  name: 'Projects',
  description:
    'Projects for zero or more Organizations, run through per-Project Stages by Members holding Project Roles.',
  version: '1.0.0',
  // `auth` owns `requireAdmin`, which gates every route of this module;
  // `settings` owns the store the activation control lives in.
  dependencies: ['auth', 'settings'],
  settings,
  // Constitution XVII — the operator's activation control.
  activation: { settingCode: 'projects.enabled', default: true },
  // Nothing to document yet: the page lands with the first operator-visible
  // surface (Phase 2).
  docs: false,
  // Demo data is a later story's decision (research R-20); `false` is a
  // decision, absent would be "nobody has decided".
  demo: false,
});
