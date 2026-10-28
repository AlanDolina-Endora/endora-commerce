import type { FastifyInstance } from 'fastify';
import type { RequireAdminFactory } from '@endora-commerce/platform/kernel';
import type { TaskPriorityService } from '../services/priority-service.js';

export interface TaskPriorityRoutesDeps {
  priorityService: Pick<TaskPriorityService, 'list'>;
  requireAdmin: RequireAdminFactory;
}

const API = '/api/v1/admin/tasks';

/**
 * The priority list (`specs/165-task-management/contracts/admin-api.md` §4):
 * read by every holder of `tasks:read` from User Story 1 on, so the picker and
 * the filter offer it. Its writes (`tasks:configure`) arrive with User Story 9.
 */
export async function registerTaskPriorityRoutes(app: FastifyInstance, deps: TaskPriorityRoutesDeps): Promise<void> {
  app.get(`${API}/priorities`, { preHandler: deps.requireAdmin('tasks:read') }, async () => ({
    data: await deps.priorityService.list(),
  }));
}
