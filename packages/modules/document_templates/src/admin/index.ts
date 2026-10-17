/**
 * `document_templates`' admin surface (feature 091 contribution shape;
 * `specs/152-compare-pdf-template/contracts/admin-ui.md` §1): the list of
 * document types and their templates, the editor, and the sidebar entry.
 * The palette entry is the manifest's `open-document-templates` action.
 *
 * This entry exports data and nothing else (R2); each screen is a
 * dynamic-import factory (R6).
 */
import type { AdminContributions } from '@endora-commerce/admin-kit/contributions';

/** The code every read route of `/api/v1/admin/document-templates` enforces. */
const READ_PERMISSION = 'document_templates:read';

export const contributions: AdminContributions = {
  routes: [
    {
      path: '/document-templates',
      component: () => import('./pages/DocumentTemplatesPage.js'),
      requiredPermission: READ_PERMISSION,
      index: true,
    },
    {
      path: '/document-templates/:id',
      component: () => import('./pages/DocumentTemplateEditor.js'),
      requiredPermission: READ_PERMISSION,
    },
  ],
  nav: [
    {
      to: '/document-templates',
      labelKey: 'nav.documentTemplates.label',
      icon: 'FileText',
      section: 'content',
      weight: 650,
      requiredPermission: READ_PERMISSION,
    },
  ],
};
