import type { EntityManager } from '@mikro-orm/postgresql';
import type { AdminUserReadPort, TaskReadPort, TaskWritePort } from '@endora-commerce/contracts';
import type { CommandBus } from '@endora-commerce/platform/commands';
import {
  effectiveState,
  lazyPort,
  type ModuleContext,
  type RequireAdminFactory,
} from '@endora-commerce/platform/kernel';
import { Task } from './entities/task.entity.js';
import { registerTaskRoutes } from './routes/routes.tasks.js';
import { TaskContextRegistry } from './services/task-context-registry.js';
import { TaskReadPortService } from './services/task-read-port.js';
import { TaskService } from './services/task-service.js';
import { isSystemActor, TaskVisibility } from './services/task-visibility.js';
import { TaskWritePortService } from './services/task-write-port.js';

/**
 * `tasks` — composed by the kernel container.
 *
 * **One file, deliberately** (CRM `research.md` N-6): `check:port-dependencies`
 * reads a module's registrations from the file that exports `registerModule`
 * and from no other, so every registration, route, subscriber and boot hook of
 * this module is written here, one delimited section per area, and a story adds
 * a section rather than a file.
 */

/** What this module reads from the container: the platform's services and its own. */
interface TasksCradle {
  readonly emFactory: () => EntityManager;
  readonly commandBus: CommandBus;
  readonly requireAdmin: RequireAdminFactory;
  readonly taskContextRegistry: TaskContextRegistry;
  readonly tasksVisibility: TaskVisibility;
  readonly tasksTaskService: TaskService;
}

export function registerModule(ctx: ModuleContext): void {
  // --- Context (research R-1, R-9) -------------------------------------------
  // The Task contexts other modules own. A **contribution seam**: registered
  // ungated (`ctx.di.register`, never `providePort`), so a contributor's boot
  // hook can push into it whatever this module's state — a boot hook resolving
  // a gated port would stop the backend starting while `tasks` is off.
  //
  // Enumeration policy: fail-closed. A descriptor whose owner is not
  // effectively present is never enumerated, so its Tasks are hidden, and
  // return without a restart when the owner is back (the registry's header).
  //
  // Visibility is the module's only read path (`Task` is `@RuleScoped`): every
  // list, count and read by id asks it, under the caller's own context.
  ctx.di.register({
    taskContextRegistry: ctx
      .asFunction(() => new TaskContextRegistry((moduleId) => effectiveState.isPresent(moduleId)))
      .singleton(),
    tasksVisibility: ctx
      .asFunction(
        ({ taskContextRegistry }: TasksCradle) =>
          new TaskVisibility({ contributors: () => taskContextRegistry.present(), isSystemActor }),
      )
      .singleton(),
  });
  // --- end of Context ----------------------------------------------------------

  // --- Tasks (read side) ---------------------------------------------------------
  // `admin_users`' read port names an assignee and a creator; it is resolved
  // lazily, per call, and never captured in this singleton.
  ctx.di.register({
    tasksTaskService: ctx
      .asFunction(
        ({ emFactory, tasksVisibility, taskContextRegistry }: TasksCradle) =>
          new TaskService({
            emFactory,
            visibility: tasksVisibility,
            contexts: taskContextRegistry,
            adminUsers: lazyPort<AdminUserReadPort>(ctx, 'adminUserReadPort'),
          }),
      )
      .singleton(),
  });
  ctx.routes(async (app) => {
    const cradle = ctx.cradle<TasksCradle>();
    await registerTaskRoutes(app, { taskService: cradle.tasksTaskService, requireAdmin: cradle.requireAdmin });
  });
  // --- end of Tasks ----------------------------------------------------------------

  // --- Published ports (contracts/ports-and-events.md §1) ---------------------------
  // What another module reads and writes Tasks through. Both are `providePort`:
  // gated, so a consumer resolving either while this module is off gets
  // `ModuleDisabledError` (503 `MODULE_DISABLED`) and nothing half-executes.
  ctx.di.providePort<TaskReadPort>(
    'taskReadPort',
    ctx.asFunction(({ tasksTaskService }: TasksCradle) => new TaskReadPortService(tasksTaskService)).singleton(),
  );
  ctx.di.providePort<TaskWritePort>(
    'taskWritePort',
    ctx
      .asFunction(
        ({ commandBus, emFactory, taskContextRegistry }: TasksCradle) =>
          new TaskWritePortService({
            commandBus,
            emFactory,
            contexts: taskContextRegistry,
            adminUsers: lazyPort<AdminUserReadPort>(ctx, 'adminUserReadPort'),
          }),
      )
      .singleton(),
  );
  // --- end of Published ports ---------------------------------------------------------
}

/**
 * The module's persisted entity classes, on the `./backend` subpath, as one
 * array and no named class export (D-168). The platform reads this array when
 * the package is installed; a missing array is answered with zero entities
 * registered and no error anywhere.
 *
 * One class, the whole schema of the module: `Task`, `@RuleScoped` — its
 * tenancy is its context's rule (research R-9).
 */
export const entities = [Task];

/**
 * The door to `tasks_number_seq`, published **by name** on `./backend`, as
 * CRM's `nextOpportunityNumber` is (`specs/143-crm-sales-opportunities/`
 * research N-DD1): a demo composition creating Tasks takes its numbers here, so
 * there is one statement of the format and one sequence. A function is not an
 * entity class, which is what D-168 bars from this door.
 */
export { nextTaskNumber } from './services/task-number.js';
