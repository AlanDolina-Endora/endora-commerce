import type { EntityManager } from '@mikro-orm/postgresql';
import { ERROR_CODES, type TaskPriorityConfig } from '@endora-commerce/contracts';
import { HttpError } from '@endora-commerce/platform/http';
import type { TaskVisibility } from './task-visibility.js';
import type { TaskWorkflowRead } from './task-workflow-read.js';

export interface TaskPriorityServiceDeps {
  emFactory: () => EntityManager;
  workflow: Pick<TaskWorkflowRead, 'priorities'>;
  visibility: Pick<TaskVisibility, 'condition'>;
}

export function priorityUnknown(code: string): HttpError {
  return new HttpError(422, ERROR_CODES.TASK_PRIORITY_UNKNOWN, `"${code}" is not a configured priority.`, { code });
}

/**
 * The operator's priority list (`specs/165-task-management/` FR-009, FR-024,
 * research R-9; `contracts/admin-api.md` §4) — read here from User Story 1 on;
 * creating, renaming, reordering and removing one arrive with User Story 9.
 *
 * A Task holds a priority by its code. The in-use count of each is the number
 * of Tasks the caller may see holding it — the count composes the visibility
 * pre-filter, so a count says nothing of a Task the caller may not see.
 */
export class TaskPriorityService {
  constructor(private readonly deps: TaskPriorityServiceDeps) {}

  /** `GET /tasks/priorities` — by weight, most urgent first. */
  async list(): Promise<TaskPriorityConfig[]> {
    const [priorities, inUse] = await Promise.all([this.deps.workflow.priorities(), this.#inUse()]);
    return priorities.map((priority) => ({
      code: priority.code,
      name: priority.name,
      defaultName: priority.defaultName,
      color: priority.color,
      weight: priority.weight,
      inUseCount: inUse.get(priority.code) ?? 0,
    }));
  }

  /** A code the list holds — else 422 `TASK_PRIORITY_UNKNOWN`. `null` (no priority) always passes. */
  async assertKnown(code: string | null): Promise<void> {
    if (code === null) return;
    const priorities = await this.deps.workflow.priorities();
    if (!priorities.some((priority) => priority.code === code)) throw priorityUnknown(code);
  }

  async #inUse(): Promise<Map<string, number>> {
    const visible = await this.deps.visibility.condition('t');
    const rows = (await this.deps.emFactory().execute(
      `select t."priority_code", count(*)::int as "n" from "tasks" t
        where t."priority_code" is not null ${visible ? `and ${visible.sql}` : ''}
        group by t."priority_code"`,
      visible?.params ?? [],
    )) as Array<{ priority_code: string; n: number }>;
    return new Map(rows.map((row) => [row.priority_code, Number(row.n)]));
  }
}
