import type { FastifyInstance } from 'fastify';
import { TaskListQuerySchema } from '@endora-commerce/contracts';
import type { RequireAdminFactory } from '@endora-commerce/platform/kernel';
import type { TaskService } from '../services/task-service.js';

export interface TaskRoutesDeps {
  taskService: TaskService;
  requireAdmin: RequireAdminFactory;
}

/**
 * Tasks — the read routes (`specs/163-projects-and-tasks/contracts/admin-api.md`
 * §1). Reading is `tasks:read`. A Task whose context the caller may not see
 * answers 404 `TASK_NOT_FOUND`, the same as a missing one, and is absent from
 * the list.
 */
export async function registerTaskRoutes(app: FastifyInstance, deps: TaskRoutesDeps): Promise<void> {
  const { requireAdmin, taskService: tasks } = deps;

  app.get('/api/v1/admin/tasks', { preHandler: requireAdmin('tasks:read') }, async (request) =>
    tasks.list(TaskListQuerySchema.parse(request.query ?? {})),
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/admin/tasks/:id',
    { preHandler: requireAdmin('tasks:read') },
    async (request) => ({ data: await tasks.get(request.params.id) }),
  );
}
