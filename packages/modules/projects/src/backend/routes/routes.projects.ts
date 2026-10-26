import type { FastifyInstance } from 'fastify';
import { ProjectListQuerySchema } from '@endora-commerce/contracts';
import type { RequireAdminFactory } from '@endora-commerce/platform/kernel';
import type { ProjectReadService } from '../services/project-read-service.js';

export interface ProjectRoutesDeps {
  projectReadService: ProjectReadService;
  requireAdmin: RequireAdminFactory;
}

/**
 * Projects — the read routes of the foundation phase
 * (`specs/163-projects-and-tasks/contracts/admin-api.md` §2.1). Reading is
 * `projects:read`. A Project out of the caller's Organization reach, or
 * invisible to them, answers 404 `PROJECT_NOT_FOUND`, the same as a missing
 * one, and is absent from the list and its total.
 */
export async function registerProjectRoutes(app: FastifyInstance, deps: ProjectRoutesDeps): Promise<void> {
  const { requireAdmin, projectReadService: projects } = deps;

  app.get('/api/v1/admin/projects', { preHandler: requireAdmin('projects:read') }, async (request) =>
    projects.list(ProjectListQuerySchema.parse(request.query ?? {})),
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/admin/projects/:id',
    { preHandler: requireAdmin('projects:read') },
    async (request) => ({ data: await projects.get(request.params.id) }),
  );
}
