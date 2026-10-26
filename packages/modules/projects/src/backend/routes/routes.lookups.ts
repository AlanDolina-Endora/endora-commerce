import type { FastifyInstance } from 'fastify';
import { ProjectAdminUserLookupQuerySchema, ProjectOrganizationLookupQuerySchema } from '@endora-commerce/contracts';
import type { RequireAdminFactory } from '@endora-commerce/platform/kernel';
import type { ProjectLookupService } from '../services/lookup-service.js';
import type { ProjectAccess } from '../services/project-access.js';

export interface LookupRoutesDeps {
  lookupService: ProjectLookupService;
  access: ProjectAccess;
  requireAdmin: RequireAdminFactory;
}

/**
 * What the Projects screens' pickers choose from
 * (`specs/163-projects-and-tasks/contracts/admin-api.md` §2.1a), and the module
 * visibility setting the visibility control explains.
 *
 * All three are `projects:read`. The two lookups serve the forms that write a
 * Project — Organizations, Members, listed people — and also the list's
 * Organization and any-member filters, which are a reader's (the CRM
 * precedent: its filter lookups are `crm:read`). They answer names and nothing
 * else, and Organizations only within the caller's reach. The setting —
 * whoever sees a Project's visibility may be told what *Follow the module
 * setting* means.
 */
export async function registerLookupRoutes(app: FastifyInstance, deps: LookupRoutesDeps): Promise<void> {
  const { requireAdmin, lookupService: lookups, access } = deps;

  app.get('/api/v1/admin/projects/lookups/organizations', { preHandler: requireAdmin('projects:read') }, async (request) => ({
    data: await lookups.organizations(ProjectOrganizationLookupQuerySchema.parse(request.query ?? {})),
  }));

  app.get('/api/v1/admin/projects/lookups/admin-users', { preHandler: requireAdmin('projects:read') }, async (request) => ({
    data: await lookups.adminUsers(ProjectAdminUserLookupQuerySchema.parse(request.query ?? {})),
  }));

  app.get('/api/v1/admin/projects/visibility-setting', { preHandler: requireAdmin('projects:read') }, async () => ({
    data: { setting: await access.visibilitySetting() },
  }));
}
