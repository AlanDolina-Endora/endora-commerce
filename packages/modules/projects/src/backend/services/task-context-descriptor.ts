import type { EntityManager } from '@mikro-orm/postgresql';
import type { TaskContextDescription, TaskContextDescriptor } from '@endora-commerce/contracts';
import { uuidArray, type ProjectAccess } from './project-access.js';
import { PROJECT_TASK_CONTEXT_TYPE } from './project-tasks.js';

/**
 * The `project` Task context (research R-1, R-9): what makes a Task belong to
 * a Project and one of its Stages, without `tasks` knowing Projects exist.
 *
 * Every answer runs under the **caller's** ambient context and goes through
 * `ProjectAccess` — the Organization rule and the visibility rule (R-2, R-3) —
 * so a Project Task is seen exactly by whoever may see its Project: in the
 * Tasks list, in *My Tasks*, by id, and nowhere else. With Projects switched
 * off the registry stops enumerating this descriptor and the Tasks are hidden
 * (fail-closed); they return when Projects is back.
 *
 * `describe` names a Project by number and title, links to its screen, and
 * labels each Stage — the Task's group — by its current name. It describes only
 * the Projects `visibleIds` hands back; an id it leaves out is shown by
 * `tasks` as an unavailable record.
 */
export function createProjectTaskContext(deps: {
  access: ProjectAccess;
  emFactory: () => EntityManager;
}): TaskContextDescriptor {
  const { access, emFactory } = deps;
  return {
    contextType: PROJECT_TASK_CONTEXT_TYPE,
    ownerModuleId: 'projects',
    allVisibleContextIds: () => access.allVisibleIds(),
    visibleContextIds: (ids) => access.visibleIds(ids),
    describe: async (ids) => {
      const visible = [...(await access.visibleIds(ids))];
      const out = new Map<string, TaskContextDescription>();
      if (visible.length === 0) return out;
      const em = emFactory();
      const projects = (await em.execute(
        `select p."id", p."number", p."title" from "projects" p where p."id" = any(?::uuid[])`,
        [uuidArray(visible)],
      )) as Array<{ id: string; number: string; title: string }>;
      const stages = (await em.execute(
        `select s."id", s."project_id", s."name" from "project_stages" s
          where s."project_id" = any(?::uuid[]) order by s."position", s."id"`,
        [uuidArray(visible)],
      )) as Array<{ id: string; project_id: string; name: string }>;
      for (const project of projects) {
        out.set(project.id, {
          label: `${project.number} ${project.title}`,
          href: `/projects/${project.id}`,
          groups: new Map(stages.filter((s) => s.project_id === project.id).map((s) => [s.id, s.name])),
        });
      }
      return out;
    },
  };
}
