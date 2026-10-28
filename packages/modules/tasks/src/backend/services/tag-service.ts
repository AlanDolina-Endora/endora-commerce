import { UniqueConstraintViolationException } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import { ERROR_CODES, TASK_TAGS_MAX, type CreateTaskTagBody, type TaskTag as TaskTagView } from '@endora-commerce/contracts';
import type { CommandBus } from '@endora-commerce/platform/commands';
import { HttpError } from '@endora-commerce/platform/http';
import { randomUUID } from 'crypto';
import { TaskTag } from '../entities/task-tag.entity.js';
import { isUuid } from './task-access.js';
import type { TaskVisibility } from './task-visibility.js';

export interface TaskTagServiceDeps {
  emFactory: () => EntityManager;
  commandBus: CommandBus;
  visibility: Pick<TaskVisibility, 'condition'>;
}

function nameTaken(name: string): HttpError {
  return new HttpError(409, ERROR_CODES.TASK_TAG_NAME_TAKEN, `A tag named "${name}" already exists.`, { name });
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.name.localeCompare(b.name);
}

/**
 * The Task tag list (`specs/165-task-management/` FR-010, FR-023, research
 * R-10; `contracts/admin-api.md` §4) — CRM's `tag-service.ts`, the model.
 *
 * **A tag is platform configuration** — one list, created by whoever holds
 * `tasks:configure`; renaming and deleting arrive with User Story 9. **What a
 * tag is on is not**: a tagging is a child of a Task, written by the Task's own
 * Command, and a tag's usage count is the number of Tasks carrying it *that the
 * caller may see* — the count composes the visibility pre-filter.
 *
 * Every write is a Command recorded against `task_tag` and the tag's id. Names
 * are unique whatever their case; the index is on `lower(name)`.
 */
export class TaskTagService {
  constructor(private readonly deps: TaskTagServiceDeps) {}

  /** `GET /tasks/tags` — by name, each with how many visible Tasks carry it. */
  async list(): Promise<TaskTagView[]> {
    const em = this.deps.emFactory();
    const [tags, usage] = await Promise.all([em.find(TaskTag, {}), this.#usageCounts(em)]);
    return tags
      .sort(byName)
      .map((tag) => ({ id: tag.id, name: tag.name, color: tag.color, usageCount: usage.get(tag.id) ?? 0 }));
  }

  /** `POST /tasks/tags` — 409 `TASK_TAG_NAME_TAKEN` for a name taken in any case. */
  async create(input: CreateTaskTagBody): Promise<TaskTagView> {
    const id = randomUUID();
    try {
      const tag = await this.deps.commandBus.run({
        action: 'tasks.tag.create',
        objectType: 'task_tag',
        objectId: id,
        run: async ({ em }) => {
          const taken = (await (em as EntityManager).execute(
            `select 1 from "task_tags" where lower("name") = lower(?) limit 1`,
            [input.name],
          )) as unknown[];
          if (taken.length > 0) throw nameTaken(input.name);
          const created = (em as EntityManager).create(TaskTag, {
            id,
            name: input.name,
            ...(input.color !== undefined ? { color: input.color } : {}),
          });
          return { result: created, before: null, after: { name: created.name, color: created.color } };
        },
      });
      return { id: tag.id, name: tag.name, color: tag.color, usageCount: 0 };
    } catch (error) {
      // Two requests creating one name: the unique index refused the second.
      if (error instanceof UniqueConstraintViolationException) throw nameTaken(input.name);
      throw error;
    }
  }

  /**
   * Every id names a tag, and there are at most {@link TASK_TAGS_MAX} — else
   * 422 `TASK_TAG_UNKNOWN`. Asked before the Task's Command runs.
   */
  async assertKnown(ids: readonly string[]): Promise<void> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return;
    if (unique.length > TASK_TAGS_MAX || unique.some((id) => !isUuid(id))) throw tagUnknown();
    const found = await this.deps.emFactory().count(TaskTag, { id: { $in: unique } });
    if (found !== unique.length) throw tagUnknown();
  }

  /** How many Tasks the caller may see carry each tag. */
  async #usageCounts(em: EntityManager): Promise<Map<string, number>> {
    const visible = await this.deps.visibility.condition('t');
    const rows = (await em.execute(
      `select ta."tag_id", count(*)::int as "n" from "task_tag_assignments" ta
         join "tasks" t on t."id" = ta."task_id"
        ${visible ? `where ${visible.sql}` : ''}
        group by ta."tag_id"`,
      visible?.params ?? [],
    )) as Array<{ tag_id: string; n: number }>;
    return new Map(rows.map((row) => [row.tag_id, Number(row.n)]));
  }
}

export function tagUnknown(): HttpError {
  return new HttpError(422, ERROR_CODES.TASK_TAG_UNKNOWN, 'One of these tags does not exist.');
}
