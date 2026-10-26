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
 * The two lookups are `projects:write`: Organizations, Members and listed
 * people are chosen on the forms that write a Project. The setting is
 * `projects:read` — whoever sees a Project's visibility may be told what
 * *Follow the module setting* means.
 */
export async function registerLookupRoutes(app: FastifyInstance, deps: LookupRoutesDeps): Promise<void> {
  const { requireAdmin, lookupService: lookups, access } = deps;

  app.get('/api/v1/admin/projects/lookups/organizations', { preHandler: requireAdmin('projects:write') }, async (request) => ({
    data: await lookups.organizations(ProjectOrganizationLookupQuerySchema.parse(request.query ?? {})),
  }));

  app.get('/api/v1/admin/projects/lookups/admin-users', { preHandler: requireAdmin('projects:write') }, async (request) => ({
    data: await lookups.adminUsers(ProjectAdminUserLookupQuerySchema.parse(request.query ?? {})),
  }));

  app.get('/api/v1/admin/projects/visibility-setting', { preHandler: requireAdmin('projects:read') }, async () => ({
    data: { setting: await access.visibilitySetting() },
  }));
}
