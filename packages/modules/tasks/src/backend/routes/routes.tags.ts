import type { FastifyInstance } from 'fastify';
import { CreateTaskTagBodySchema } from '@endora-commerce/contracts';
import type { RequireAdminFactory } from '@endora-commerce/platform/kernel';
import type { TaskTagService } from '../services/tag-service.js';

export interface TaskTagRoutesDeps {
  tagService: Pick<TaskTagService, 'list' | 'create'>;
  requireAdmin: RequireAdminFactory;
}

const API = '/api/v1/admin/tasks';

/**
 * The tag list (`specs/165-task-management/contracts/admin-api.md` §4): read
 * by every holder of `tasks:read`; creating a tag is configuration,
 * `tasks:configure` (US9 scenario 4). Renaming and deleting arrive with User
 * Story 9.
 */
export async function registerTaskTagRoutes(app: FastifyInstance, deps: TaskTagRoutesDeps): Promise<void> {
  app.get(`${API}/tags`, { preHandler: deps.requireAdmin('tasks:read') }, async () => ({
    data: await deps.tagService.list(),
  }));

  app.post(
    `${API}/tags`,
    { preHandler: deps.requireAdmin('tasks:configure'), schema: { body: CreateTaskTagBodySchema } },
    async (request, reply) => {
      const created = await deps.tagService.create(CreateTaskTagBodySchema.parse(request.body));
      reply.code(201);
      return { data: created };
    },
  );
}
