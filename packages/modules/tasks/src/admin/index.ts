/**
 * `tasks`' admin surface (`specs/163-projects-and-tasks/contracts/admin-surfaces.md`
 * §1–§3): 163's four screens and two sidebar rows — the Tasks screen and *My
 * Tasks* now each a list or a board (`specs/165-task-management/` User Story 3)
 * — and the workflow screen (User Story 2) with its *Task settings* row.
 *
 * The palette actions are the manifest's (`src/manifest.ts`, §4). The zone
 * `task.detail.after` is mounted by `pages/TaskDetail.tsx`; this module
 * contributes nothing to it.
 *
 * **This entry exports data and nothing else**; every component is a
 * dynamic-import factory, so none of the screens is in the admin's entry chunk.
 */
import type { AdminContributions } from '@endora-commerce/admin-kit/contributions';

/** The code that opens the lists and one Task; `GET /tasks`, `/tasks/mine` and `/tasks/:id` enforce it. */
const READ_PERMISSION = 'tasks:read';

/** The code that opens the create screen: `POST /tasks` is the one write it exists to make. */
const WRITE_PERMISSION = 'tasks:write';

/**
 * The code that opens the workflow screen: every write it makes — statuses and
 * moves — is gated on it (`specs/165-task-management/` FR-012).
 */
const CONFIGURE_PERMISSION = 'tasks:configure';

const TASKS_PATH = '/tasks';

const WORKFLOW_PATH = `${TASKS_PATH}/settings/workflow`;

export const contributions: AdminContributions = {
  routes: [
    {
      path: TASKS_PATH,
      component: () => import('./pages/TasksPage.js'),
      requiredPermission: READ_PERMISSION,
      index: true,
    },
    {
      // Both static segments are declared before `/:id`; `<Routes>` ranks them first anyway.
      path: `${TASKS_PATH}/mine`,
      component: () => import('./pages/MyTasksPage.js'),
      requiredPermission: READ_PERMISSION,
    },
    {
      path: `${TASKS_PATH}/new`,
      component: () => import('./pages/TaskCreate.js'),
      requiredPermission: WRITE_PERMISSION,
    },
    {
      path: WORKFLOW_PATH,
      component: () => import('./pages/settings/TaskWorkflowPage.js'),
      requiredPermission: CONFIGURE_PERMISSION,
    },
    {
      path: `${TASKS_PATH}/:id`,
      component: () => import('./pages/TaskDetail.js'),
      requiredPermission: READ_PERMISSION,
    },
  ],
  nav: [
    {
      to: `${TASKS_PATH}/mine`,
      labelKey: 'nav.mine.label',
      icon: 'ListChecks',
      // The host's "Projects & tasks" section (research R-16), after Projects.
      section: 'work',
      weight: 200,
      requiredPermission: READ_PERMISSION,
    },
    {
      to: TASKS_PATH,
      labelKey: 'nav.tasks.label',
      icon: 'ListChecks',
      section: 'work',
      weight: 210,
      requiredPermission: READ_PERMISSION,
    },
    {
      // With the section's other configuration rows, after Projects' (400–420)
      // (`specs/165-task-management/contracts/admin-surfaces.md` §1).
      to: WORKFLOW_PATH,
      labelKey: 'nav.settings.label',
      icon: 'Settings',
      section: 'work',
      weight: 430,
      requiredPermission: CONFIGURE_PERMISSION,
    },
  ],
};
