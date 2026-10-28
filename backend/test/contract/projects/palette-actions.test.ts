import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contributions as projectsAdmin } from '@endora-commerce/mod-projects/admin';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import {
  actionRouteFindings,
  expectDeclared,
  expectLabels,
  expectTargetsOwnRoutes,
  type ExpectedAction,
} from './palette-actions-shared.js';

/**
 * Projects under ⌘K (`specs/163-projects-and-tasks/` FR-041, T130;
 * `contracts/admin-surfaces.md` §4): four actions, each on a screen of the
 * module's own, gated by the code that screen and its API enforce.
 *
 * §4 writes the ids as `projects.open`, `projects.new`, …; a manifest action id
 * is a lower-case slug (`ModuleActionSchema`) and the palette scopes it by its
 * module already, so the ids below are the slugs those names stand for.
 */
const EXPECTED: readonly ExpectedAction[] = [
  {
    id: 'open-projects',
    route: '/projects',
    permission: 'projects:read',
    icon: 'ClipboardList',
    label: { en: 'Projects', pl: 'Projekty' },
  },
  {
    id: 'new-project',
    route: '/projects/new',
    permission: 'projects:write',
    icon: 'FolderPlus',
    label: { en: 'New project', pl: 'Nowy projekt' },
  },
  {
    id: 'open-project-templates',
    route: '/projects/templates',
    permission: 'projects:configure',
    icon: 'Layers',
    label: { en: 'Project templates', pl: 'Szablony projektów' },
  },
  {
    id: 'open-project-analytics',
    route: '/projects/analytics',
    permission: 'projects:analytics',
    icon: 'LineChart',
    label: { en: 'Project analytics', pl: 'Analityka projektów' },
  },
];

describe('projects palette actions (163 FR-041, T130)', () => {
  let h: BackendServerHandle;

  beforeAll(async () => {
    h = await setupBackendServer();
  }, 60_000);

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  it('declares the four actions of §4', () => {
    expectDeclared('projects', EXPECTED);
  });

  it('each opens a screen of the module’s own admin layer, on the action’s code', () => {
    expectTargetsOwnRoutes('projects', projectsAdmin);
  });

  it('each resolves to a real API route with that route’s permission (check:action-route-permissions)', () => {
    const result = actionRouteFindings('projects');
    expect(result.violations).toEqual([]);
    expect(result.stale).toEqual([]);
    // The Templates screen is `projects:configure` in the admin, while the list
    // it lands on is read-gated: the create form offers Templates to every
    // writer. The check's ledger records that one disagreement, and only it.
    expect(result.ledgered.map((finding) => finding.actionId)).toEqual(['open-project-templates']);
  });

  it('serves the four, labelled in English and Polish', async () => {
    await expectLabels(h, 'projects', EXPECTED);
  });
});
