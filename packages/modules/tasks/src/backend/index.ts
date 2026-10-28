import type { EntityManager } from '@mikro-orm/postgresql';
import {
  TaskTimeZoneSchema,
  type AdminI18nTranslatePort,
  type AdminNotificationRecordPort,
  type AdminSearchProviderRegistryPort,
  type AdminUserReadPort,
  type AuditReferenceRegistryPort,
  type PermissionReadPort,
  type TaskReadPort,
  type TaskWritePort,
} from '@endora-commerce/contracts';
import type { CommandBus } from '@endora-commerce/platform/commands';
import {
  effectiveState,
  lazyPort,
  type AuditPort,
  type ModuleContext,
  type RequireAdminFactory,
  type SettingsReadPort,
} from '@endora-commerce/platform/kernel';
import { createTaskAdminSearchProvider } from './admin-search-provider.js';
import { Task } from './entities/task.entity.js';
import { TaskAssignee } from './entities/task-assignee.entity.js';
import { TaskAttachment } from './entities/task-attachment.entity.js';
import { TaskComment } from './entities/task-comment.entity.js';
import { TaskDigestSubscription } from './entities/task-digest-subscription.entity.js';
import { TaskListSavedView } from './entities/task-list-saved-view.entity.js';
import { TaskPriority } from './entities/task-priority.entity.js';
import { TaskRecordLink } from './entities/task-record-link.entity.js';
import { TaskReference } from './entities/task-reference.entity.js';
import { TaskRelation } from './entities/task-relation.entity.js';
import { TaskReminder } from './entities/task-reminder.entity.js';
import { TaskReminderDelivery } from './entities/task-reminder-delivery.entity.js';
import { TaskStatus } from './entities/task-status.entity.js';
import { TaskStatusTransition } from './entities/task-status-transition.entity.js';
import { TaskTag } from './entities/task-tag.entity.js';
import { TaskTagAssignment } from './entities/task-tag-assignment.entity.js';
import { registerTaskRoutes } from './routes/routes.tasks.js';
import { registerTaskWorkflowRoutes } from './routes/routes.workflow.js';
import { actingAdminUserId, TaskAccess } from './services/task-access.js';
import { registerTaskAuditReferences } from './services/task-audit-references.js';
import { TaskContextRegistry } from './services/task-context-registry.js';
import { TaskHistoryService } from './services/task-history-service.js';
import { createTaskNotifier, type TaskNotifier } from './services/task-notifier.js';
import { TaskReadPortService } from './services/task-read-port.js';
import { TaskService } from './services/task-service.js';
import { isSystemActor, TaskVisibility } from './services/task-visibility.js';
import { TaskWorkflowRead } from './services/task-workflow-read.js';
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
  readonly auditLogService: AuditPort;
  readonly taskContextRegistry: TaskContextRegistry;
  readonly tasksVisibility: TaskVisibility;
  readonly tasksAccess: TaskAccess;
  readonly tasksWorkflowRead: TaskWorkflowRead;
  readonly tasksNotifier: TaskNotifier;
  readonly tasksTaskService: TaskService;
  readonly tasksHistoryService: TaskHistoryService;
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
  // list, count and read by id asks it, under the caller's own context. It
  // also carries the draft/private rule (`specs/165-task-management/` R-3):
  // who the caller is and whether they hold `tasks:see_private`, asked of
  // `admin_roles`' `permissionService` per call, never for the system.
  // `TaskAccess` is how a route obtains one Task, and what it may do with it.
  ctx.di.register({
    taskContextRegistry: ctx
      .asFunction(() => new TaskContextRegistry((moduleId) => effectiveState.isPresent(moduleId)))
      .singleton(),
    tasksVisibility: ctx
      .asFunction(({ taskContextRegistry }: TasksCradle) => {
        // The published read port plus the capability check `hasPermission`,
        // which the container entry carries beside it (Projects' precedent).
        const permissions = lazyPort<
          PermissionReadPort & { hasPermission(adminUserId: string, permission: string): Promise<boolean> }
        >(ctx, 'permissionService');
        return new TaskVisibility({
          contributors: () => taskContextRegistry.present(),
          isSystemActor,
          viewer: async () => {
            const adminUserId = actingAdminUserId();
            if (adminUserId === null) return { adminUserId: null, seePrivate: false };
            return { adminUserId, seePrivate: await permissions.hasPermission(adminUserId, 'tasks:see_private') };
          },
        });
      })
      .singleton(),
    tasksAccess: ctx
      .asFunction(
        ({ emFactory, tasksVisibility, taskContextRegistry }: TasksCradle) =>
          new TaskAccess({ emFactory, visibility: tasksVisibility, contexts: taskContextRegistry }),
      )
      .singleton(),
    // The workflow and the priority list — global configuration (R-1, R-9).
    tasksWorkflowRead: ctx.asFunction(({ emFactory }: TasksCradle) => new TaskWorkflowRead(emFactory)).singleton(),
  });
  // --- end of Context ----------------------------------------------------------

  // --- Tasks (User Story 2) -----------------------------------------------------
  // The list, My Tasks, one Task, and its writes — every write a Command of
  // `task-commands.ts` (Constitution XIII). `admin_users`' read port names an
  // assignee and a creator; `_i18n`'s resolver words a context its owner did
  // not describe. Both are resolved lazily, per call, never captured.
  //
  // The bell is `admin_notifications`', which an operator may switch off. This
  // module degrades without it (the manifest's `degrades-without` edge): the
  // notifier decides that module's presence before it asks, so an assignment
  // succeeds either way and nothing here catches a refusal.
  ctx.di.register({
    tasksNotifier: ctx
      .asFunction(() => createTaskNotifier(lazyPort<AdminNotificationRecordPort>(ctx, 'adminNotificationRecordPort')))
      .singleton(),
    tasksTaskService: ctx
      .asFunction(
        ({
          emFactory,
          commandBus,
          tasksVisibility,
          tasksAccess,
          tasksWorkflowRead,
          taskContextRegistry,
          tasksNotifier,
        }: TasksCradle) => {
          const i18n = lazyPort<AdminI18nTranslatePort>(ctx, 'adminI18nService');
          const settings = lazyPort<SettingsReadPort>(ctx, 'settingsReadPort');
          return new TaskService({
            emFactory,
            commandBus,
            visibility: tasksVisibility,
            access: tasksAccess,
            workflow: tasksWorkflowRead,
            contexts: taskContextRegistry,
            adminUsers: lazyPort<AdminUserReadPort>(ctx, 'adminUserReadPort'),
            permissions: lazyPort<PermissionReadPort>(ctx, 'permissionService'),
            notifier: tasksNotifier,
            // `tasks.time_zone` (R-17): read per call, so an operator's change
            // is seen by the next request.
            timeZone: () => settings.get('tasks.time_zone', null, TaskTimeZoneSchema.shape.timeZone),
            translate: (key, language) => i18n.translate('tasks', key, language),
          });
        },
      )
      .singleton(),
    // The audit log is the history (`task-history-service.ts`).
    // `auditLogService` is a platform service, not a module's port.
    tasksHistoryService: ctx
      .asFunction(
        ({ tasksTaskService, auditLogService, tasksVisibility }: TasksCradle) =>
          new TaskHistoryService({
            tasks: tasksTaskService,
            visibility: tasksVisibility,
            auditLog: auditLogService,
            adminUsers: lazyPort<AdminUserReadPort>(ctx, 'adminUserReadPort'),
          }),
      )
      .singleton(),
  });
  ctx.routes(async (app) => {
    const cradle = ctx.cradle<TasksCradle>();
    await registerTaskRoutes(app, {
      taskService: cradle.tasksTaskService,
      historyService: cradle.tasksHistoryService,
      requireAdmin: cradle.requireAdmin,
    });
    await registerTaskWorkflowRoutes(app, { taskService: cradle.tasksTaskService, requireAdmin: cradle.requireAdmin });
  });
  /**
   * The audit-reference resolver — a **contribution** hook. It pushes an inert
   * resolver into `auditReferenceRegistry`, an ungated registry `audit_logs`
   * owns, and carries no presence probe: the registry's own enumeration policy
   * skips this entry while the module is absent, and a probe here would make
   * that survive a reactivation until the next restart.
   */
  ctx.onBoot(() => {
    registerTaskAuditReferences(
      lazyPort<AuditReferenceRegistryPort>(ctx, 'auditReferenceRegistry'),
      () => ctx.cradle<TasksCradle>().tasksTaskService,
    );
  });
  /**
   * The Task record type for admin global search (`contracts/admin-surfaces.md`
   * §6) — a **contribution** hook: it pushes an inert provider into
   * `admin_search`'s ungated registry and does nothing else, so it carries no
   * presence probe. The registry leaves it out at enumeration while this module
   * is switched off, and switching it back on needs no restart.
   */
  ctx.onBoot(() => {
    lazyPort<AdminSearchProviderRegistryPort>(ctx, 'adminSearchProviderRegistry').register(
      createTaskAdminSearchProvider({
        search: (query) => ctx.cradle<TasksCradle>().tasksTaskService.searchForAdmin(query),
        statusLabel: (code, language) => ctx.cradle<TasksCradle>().tasksTaskService.statusLabel(code, language),
      }),
    );
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
        ({ commandBus, emFactory, taskContextRegistry, tasksWorkflowRead }: TasksCradle) =>
          new TaskWritePortService({
            commandBus,
            emFactory,
            contexts: taskContextRegistry,
            adminUsers: lazyPort<AdminUserReadPort>(ctx, 'adminUserReadPort'),
            workflow: tasksWorkflowRead,
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
 * `Task` and the nine tables that hang off it are `@RuleScoped` — their
 * tenancy is the Task's context rule (163 research R-9), read only through
 * `TaskVisibility` (165 research R-21). The workflow, priorities and tags are
 * `@GlobalEntity` configuration; saved views and digest subscriptions are
 * `@GlobalEntity` per-administrator rows.
 */
export const entities = [
  Task,
  TaskAssignee,
  TaskTagAssignment,
  TaskComment,
  TaskReference,
  TaskAttachment,
  TaskRecordLink,
  TaskRelation,
  TaskReminder,
  TaskReminderDelivery,
  TaskStatus,
  TaskStatusTransition,
  TaskPriority,
  TaskTag,
  TaskListSavedView,
  TaskDigestSubscription,
];

/**
 * The door to `tasks_number_seq`, published **by name** on `./backend`, as
 * CRM's `nextOpportunityNumber` is (`specs/143-crm-sales-opportunities/`
 * research N-DD1): a demo composition creating Tasks takes its numbers here, so
 * there is one statement of the format and one sequence. A function is not an
 * entity class, which is what D-168 bars from this door.
 */
export { nextTaskNumber } from './services/task-number.js';
