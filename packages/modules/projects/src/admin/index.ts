/**
 * `projects`' admin surface (`specs/163-projects-and-tasks/contracts/admin-surfaces.md`
 * §1–§2): User Story 1's three routes and sidebar row, and User Story 3's
 * Templates screens and row.
 *
 * **Only what has shipped.** Project Roles, loss reasons and analytics each
 * arrive with the story that ships its page — a sidebar or
 * palette entry pointing at a route that does not exist is a defect
 * (Principle XVI). The palette actions are task T131's.
 *
 * **This entry exports data and nothing else**; every component is a
 * dynamic-import factory, so none of the screens is in the admin's entry chunk.
 */
import type { AdminContributions } from '@endora-commerce/admin-kit/contributions';

/** The code that opens the list and one Project; `GET /projects` and `GET /projects/:id` enforce it. */
const READ_PERMISSION = 'projects:read';

/** The code that opens the create screen: `POST /projects` is the one write it exists to make. */
const WRITE_PERMISSION = 'projects:write';

/** The code that opens the Templates screens: every write there is `projects:configure` (User Story 3). */
const CONFIGURE_PERMISSION = 'projects:configure';

const PROJECTS_PATH = '/projects';

export const contributions: AdminContributions = {
  routes: [
    {
      path: PROJECTS_PATH,
      component: () => import('./pages/ProjectsList.js'),
      requiredPermission: READ_PERMISSION,
      index: true,
    },
    {
      // Declared before `/:id`; `<Routes>` ranks the static segment first anyway.
      path: `${PROJECTS_PATH}/new`,
      component: () => import('./pages/ProjectCreate.js'),
      requiredPermission: WRITE_PERMISSION,
    },
    // User Story 3 — Templates. Declared before `/:id`, whose segment would
    // otherwise also match `templates`.
    {
      path: `${PROJECTS_PATH}/templates`,
      component: () => import('./pages/TemplatesList.js'),
      requiredPermission: CONFIGURE_PERMISSION,
    },
    {
      path: `${PROJECTS_PATH}/templates/new`,
      component: () => import('./pages/TemplateEditor.js'),
      requiredPermission: CONFIGURE_PERMISSION,
    },
    {
      path: `${PROJECTS_PATH}/templates/:id`,
      component: () => import('./pages/TemplateEditor.js'),
      requiredPermission: CONFIGURE_PERMISSION,
    },
    {
      path: `${PROJECTS_PATH}/:id`,
      component: () => import('./pages/ProjectDetail.js'),
      requiredPermission: READ_PERMISSION,
    },
  ],
  nav: [
    {
      to: PROJECTS_PATH,
      labelKey: 'nav.projects.label',
      icon: 'ClipboardList',
      // The host's "Projects & tasks" section (research R-16); Projects first.
      section: 'work',
      weight: 100,
      requiredPermission: READ_PERMISSION,
    },
    {
      to: `${PROJECTS_PATH}/templates`,
      labelKey: 'nav.templates.label',
      icon: 'Layers',
      // After My Tasks (200) and Tasks (210); analytics will sit between (300).
      section: 'work',
      weight: 400,
      requiredPermission: CONFIGURE_PERMISSION,
    },
  ],
};
