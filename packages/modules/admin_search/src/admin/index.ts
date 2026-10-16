/**
 * `admin_search`'s admin surface (feature 091 contribution shape;
 * `specs/150-admin-global-search/contracts/admin-ui.md` §2): the full results
 * page and the searchable-fields configuration, with the configuration's
 * sidebar entry. The command palette's record groups are the shell's own —
 * the palette is one keyboard loop over data, which a zone cannot join
 * (research R-8).
 *
 * This entry exports data and nothing else (R2); each screen is a
 * dynamic-import factory (R6).
 */
import type { AdminContributions } from '@endora-commerce/admin-kit/contributions';

/** The code `GET`/`PUT /api/v1/admin/global-search/configuration` enforce. */
const CONFIGURE_PERMISSION = 'admin_search:configure';

export const contributions: AdminContributions = {
  routes: [
    {
      // No permission of its own: every record type is filtered by the code its
      // own list enforces, server-side (research R-4, R-20).
      path: '/global-search',
      component: () => import('./pages/GlobalSearchPage.js'),
      index: true,
    },
    {
      path: '/global-search/configuration',
      component: () => import('./pages/GlobalSearchConfigurationPage.js'),
      requiredPermission: CONFIGURE_PERMISSION,
    },
  ],
  nav: [
    {
      to: '/global-search/configuration',
      labelKey: 'nav.configuration.label',
      icon: 'Search',
      section: 'system',
      weight: 650,
      requiredPermission: CONFIGURE_PERMISSION,
    },
  ],
};
