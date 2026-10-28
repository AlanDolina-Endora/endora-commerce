import type { FastifyInstance } from 'fastify';
import type { RequireAdminFactory } from '@endora-commerce/platform/kernel';
import type { TaskService } from '../services/task-service.js';

export interface TaskWorkflowRoutesDeps {
  taskService: Pick<TaskService, 'workflow'>;
  requireAdmin: RequireAdminFactory;
}

const API = '/api/v1/admin/tasks';

/**
 * The Task workflow (`specs/165-task-management/contracts/admin-api.md` §4):
 * served read-only to `tasks:read` from the Foundational phase on, so the
 * status picker offers the operator's statuses. Its writes — statuses and
 * moves, `tasks:configure` — arrive with User Story 2.
 */
export async function registerTaskWorkflowRoutes(app: FastifyInstance, deps: TaskWorkflowRoutesDeps): Promise<void> {
  app.get(`${API}/workflow`, { preHandler: deps.requireAdmin('tasks:read') }, async () => ({
    data: await deps.taskService.workflow(),
  }));
}
