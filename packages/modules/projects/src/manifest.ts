import { defineModuleManifest, defineModuleSettingsManifest } from '@endora-commerce/contracts';

/**
 * Projects — Projects for zero or more Organizations, run through per-Project
 * Stages by Members holding Project Roles (`specs/163-projects-and-tasks/`).
 *
 * The module is operator-toggleable (Constitution XVII): `projects.enabled` is
 * its activation control, and everything it contributes — routes, workers,
 * admin surfaces — stops with it. Nothing is dropped while it is off.
 */

/**
 * The module's setting codes, for the code that reads them and the tests that
 * write them.
 */
export const PROJECTS_SETTING_CODES = {
  ENABLED: 'projects.enabled',
  VISIBILITY: 'projects.visibility',
  ALERTS_TIME_ZONE: 'projects.alerts_time_zone',
} as const;

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
      code: PROJECTS_SETTING_CODES.ENABLED,
      name: 'Projects enabled',
      description:
        'Switches Projects on or off: the Project screens, Templates, analytics and the Project panels on Orders, Quote Requests and Opportunities. Nothing is dropped — every Project, its Stages and its history stay in the database and resume where they were.',
      groupCode: 'projects',
      valueType: 'boolean',
      defaultValue: true,
    },
    {
      // FR-018, research R-3. A Project set to "inherit" follows this; a
      // Project's own setting, a Member, a listed person and `projects:see_all`
      // act inside it. Nothing here widens Organization reach.
      code: PROJECTS_SETTING_CODES.VISIBILITY,
      name: 'Who sees a Project',
      description:
        'Who may see a Project that follows this setting: "everyone" — every administrator who may view Projects; "members" — its Members and the people listed on it. Each Project can override it. Either way an administrator sees only Projects of Organizations they can reach, and holders of "See every project" see every one of those.',
      groupCode: 'projects',
      valueType: 'string',
      enumOptions: ['everyone', 'members'],
      defaultValue: 'members',
    },
    {
      // Research R-5 and R-12: the calendar a Stage's start day, its deadline
      // and the day a deadline alert goes out are counted in.
      code: PROJECTS_SETTING_CODES.ALERTS_TIME_ZONE,
      name: 'Time zone of Stage dates and deadline alerts',
      description:
        'The time zone, as an IANA name such as Europe/Warsaw, in which "today" is counted for Projects: the day a Stage starts, whether its deadline has passed, and the day a deadline alert is sent.',
      groupCode: 'projects',
      valueType: 'string',
      defaultValue: 'Europe/Warsaw',
    },
  ],
});

export const manifest = defineModuleManifest({
  id: 'projects',
  name: 'Projects',
  description:
    'Projects for zero or more Organizations, run through per-Project Stages by Members holding Project Roles.',
  version: '1.0.0',
  // Every owner named here is one the platform refuses to switch off, so none
  // of these edges can deaden an operator's switch.
  //
  // `auth` owns `requireAdmin`, which gates every route of this module;
  // `settings` owns the store the activation control and the module settings
  // live in.
  //
  // `organizations` is forced by the schema —
  // `project_organizations.organization_id` is a foreign key into its table —
  // and also owns `adminTenantScopePort` (another administrator's reach) and
  // `organizationDetailsPort` (an Organization's name).
  //
  // `admin_roles` owns `permissionService`, which answers whether a reader
  // holds `projects:see_all`; `admin_users` owns `adminUserReadPort`, through
  // which Members are named.
  dependencies: ['admin_roles', 'admin_users', 'auth', 'organizations', 'settings'],
  settings,
  // Constitution XVII — the operator's activation control.
  activation: { settingCode: PROJECTS_SETTING_CODES.ENABLED, default: true },
  /**
   * Reading Projects. The other codes of research R-16 arrive with the first
   * route or check they gate: a code is declared by the change that adds its
   * first `requireAdmin`, so no code is grantable before it gates anything.
   */
  permissions: [
    {
      code: 'projects:read',
      label: 'View projects',
      module: 'projects',
    },
  ],
  /**
   * The refusals this module raises, each with its sentence under
   * `errors.<CODE>` in `i18n/{en,pl}.json`, declared by the change that added
   * its first raise site.
   */
  errorCodes: [{ code: 'PROJECT_NOT_FOUND' }],
  i18n: { bundlesDir: 'i18n' },
  // `docs/projects.md` at the package root: users' and developers' page.
  docs: { dir: 'docs' },
  // Demo data is a later story's decision (research R-20); `false` is a
  // decision, absent would be "nobody has decided".
  demo: false,
});
