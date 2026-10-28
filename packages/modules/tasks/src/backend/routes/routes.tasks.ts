import type { FastifyInstance } from 'fastify';
import {
  CreateTaskBodySchema,
  ERROR_CODES,
  isCustomFieldFilterUnavailableFailure,
  MyTasksQuerySchema,
  RecordHistoryQuerySchema,
  TaskAssigneeLookupQuerySchema,
  TaskDocumentLookupQuerySchema,
  TaskListQuerySchema,
  TaskMentionableLookupQuerySchema,
  TaskStatusChangeBodySchema,
  UpdateTaskBodySchema,
} from '@endora-commerce/contracts';
import { HttpError } from '@endora-commerce/platform/http';
import type { RequireAdminFactory } from '@endora-commerce/platform/kernel';
import type { TaskBoardCardFieldService } from '../services/board-card-field-service.js';
import type { TaskDocumentLookupService } from '../services/document-lookup-service.js';
import type { TaskMentionService } from '../services/mention-service.js';
import type { TaskHistoryService } from '../services/task-history-service.js';
import type { TaskService } from '../services/task-service.js';

export interface TaskRoutesDeps {
  taskService: TaskService;
  historyService: TaskHistoryService;
  mentionService: TaskMentionService;
  documentLookupService: TaskDocumentLookupService;
  /** The board's card fields — what `cardValues=true` fills each row with. */
  cardFields: Pick<TaskBoardCardFieldService, 'selected'>;
  requireAdmin: RequireAdminFactory;
}

const API = '/api/v1/admin/tasks';

/**
 * A custom field the list does not offer is the caller's mistake: 400, naming
 * it (research R-8). Everything else is rethrown untouched. The list, *My
 * Tasks* and the board share it.
 */
export function refuseUnofferedCustomField(error: unknown): never {
  if (isCustomFieldFilterUnavailableFailure(error)) {
    throw new HttpError(400, ERROR_CODES.CUSTOM_FIELD_FILTER_UNAVAILABLE, error.message, {
      key: error.keys[0] ?? '',
      keys: [...error.keys],
    });
  }
  throw error;
}

/**
 * Tasks (`specs/165-task-management/contracts/admin-api.md` §1, grown from
 * 163's). Reading is `tasks:read`; creating, editing, a status move, deleting
 * and the assignee picker are `tasks:write`. A Task the caller may not see —
 * its context hidden, or another admin's draft or private Task — answers 404
 * `TASK_NOT_FOUND`, the same as a missing one, and is absent from every list.
 *
 * The static paths (`/mine`, `/lookups/…`, `/custom-field-filters`) are
 * static routes, which the router matches before `/:id`, so none is ever read
 * as an id.
 */
export async function registerTaskRoutes(app: FastifyInstance, deps: TaskRoutesDeps): Promise<void> {
  const { requireAdmin, taskService: tasks, historyService: history, mentionService, documentLookupService } = deps;

  app.get(API, { preHandler: requireAdmin('tasks:read') }, async (request) => {
    const query = TaskListQuerySchema.parse(request.query ?? {});
    // A board lane's further cards carry the card fields its first ones did (R-11).
    const cardFields = query.cardValues ? await deps.cardFields.selected() : undefined;
    return tasks
      .list(query, await request.responseLanguage(), cardFields ? { cardFields } : {})
      .catch(refuseUnofferedCustomField);
  });

  // The `task` custom fields the list offers as filters (FR-007).
  app.get(`${API}/custom-field-filters`, { preHandler: requireAdmin('tasks:read') }, async () => ({
    data: await tasks.customFieldFilterFields(),
  }));

  app.get(`${API}/mine`, { preHandler: requireAdmin('tasks:read') }, async (request) => ({
    data: await tasks
      .mine(MyTasksQuerySchema.parse(request.query ?? {}), await request.responseLanguage())
      .catch(refuseUnofferedCustomField),
  }));

  app.get(`${API}/lookups/assignees`, { preHandler: requireAdmin('tasks:write') }, async (request) => ({
    data: await tasks.assignees(TaskAssigneeLookupQuerySchema.parse(request.query ?? {}).q),
  }));

  // Who a text of a Task may mention (admin-api §3): somebody who may see it.
  app.get(`${API}/lookups/mentionable`, { preHandler: requireAdmin('tasks:read') }, async (request) => ({
    data: await mentionService.mentionable(TaskMentionableLookupQuerySchema.parse(request.query ?? {})),
  }));

  // What a text of a Task may refer to after `@@` (admin-api §3): `tasks:write`,
  // because a reference is chosen only while writing. Each group's own read code
  // and its owner's presence are the service's to decide — a switchable owner's
  // code on the route would answer 403 where the list should leave the group out.
  app.get(`${API}/lookups/documents`, { preHandler: requireAdmin('tasks:write') }, async (request) =>
    documentLookupService.documents(TaskDocumentLookupQuerySchema.parse(request.query ?? {})),
  );

  app.post(
    API,
    { preHandler: requireAdmin('tasks:write'), schema: { body: CreateTaskBodySchema } },
    async (request, reply) => {
      const created = await tasks.create(CreateTaskBodySchema.parse(request.body), await request.responseLanguage());
      reply.code(201);
      return { data: created };
    },
  );

  app.get<{ Params: { id: string } }>(`${API}/:id`, { preHandler: requireAdmin('tasks:read') }, async (request) => ({
    data: await tasks.get(request.params.id, await request.responseLanguage()),
  }));

  app.patch<{ Params: { id: string } }>(
    `${API}/:id`,
    { preHandler: requireAdmin('tasks:write'), schema: { body: UpdateTaskBodySchema } },
    async (request) => ({
      data: await tasks.update(
        request.params.id,
        UpdateTaskBodySchema.parse(request.body),
        await request.responseLanguage(),
      ),
    }),
  );

  // A status move goes through the configured workflow (research R-1); `PATCH`
  // no longer takes a status.
  app.post<{ Params: { id: string } }>(
    `${API}/:id/status`,
    { preHandler: requireAdmin('tasks:write'), schema: { body: TaskStatusChangeBodySchema } },
    async (request) => ({
      data: await tasks.changeStatus(
        request.params.id,
        TaskStatusChangeBodySchema.parse(request.body),
        await request.responseLanguage(),
      ),
    }),
  );

  app.delete<{ Params: { id: string } }>(
    `${API}/:id`,
    { preHandler: requireAdmin('tasks:write') },
    async (request, reply) => {
      await tasks.delete(request.params.id);
      return reply.code(204).send();
    },
  );

  app.get<{ Params: { id: string } }>(
    `${API}/:id/history`,
    { preHandler: requireAdmin('tasks:read') },
    async (request) => history.list(request.params.id, RecordHistoryQuerySchema.parse(request.query ?? {})),
  );
}
