import type { EntityManager } from '@mikro-orm/postgresql';
import type {
  AdminI18nTranslatePort,
  AdminTenantScopePort,
  AdminUserReadPort,
  OrganizationDetailsPort,
  SettingWriteValidatorRegistryPort,
  TaskContextRegistryPort,
  TaskReadPort,
  TaskWritePort,
} from '@endora-commerce/contracts';
import type { CommandBus } from '@endora-commerce/platform/commands';
import {
  effectiveState,
  lazyPort,
  type ModuleContext,
  type RequireAdminFactory,
  type SettingsReadPort,
} from '@endora-commerce/platform/kernel';
import { Project } from './entities/project.entity.js';
import { ProjectAttachment } from './entities/project-attachment.entity.js';
import { ProjectComment } from './entities/project-comment.entity.js';
import { ProjectLink } from './entities/project-link.entity.js';
import { ProjectLossReason } from './entities/project-loss-reason.entity.js';
import { ProjectMember } from './entities/project-member.entity.js';
import { ProjectMemberRole } from './entities/project-member-role.entity.js';
import { ProjectMessageRead } from './entities/project-message-read.entity.js';
import { ProjectMessageReadBaseline } from './entities/project-message-read-baseline.entity.js';
import { ProjectOrganization } from './entities/project-organization.entity.js';
import { ProjectReference } from './entities/project-reference.entity.js';
import { ProjectRole } from './entities/project-role.entity.js';
import { ProjectStage } from './entities/project-stage.entity.js';
import { ProjectStageAlertDelivery } from './entities/project-stage-alert-delivery.entity.js';
import { ProjectStageEntry } from './entities/project-stage-entry.entity.js';
import { ProjectStageMove } from './entities/project-stage-move.entity.js';
import { ProjectStageTask } from './entities/project-stage-task.entity.js';
import { ProjectTemplate } from './entities/project-template.entity.js';
import { ProjectTemplateRole } from './entities/project-template-role.entity.js';
import { ProjectTemplateStage } from './entities/project-template-stage.entity.js';
import { ProjectTemplateStageMove } from './entities/project-template-stage-move.entity.js';
import { ProjectTemplateStageTask } from './entities/project-template-stage-task.entity.js';
import { ProjectViewer } from './entities/project-viewer.entity.js';
import { registerDictionaryRoutes } from './routes/routes.dictionaries.js';
import { registerLookupRoutes } from './routes/routes.lookups.js';
import { registerProjectRoutes } from './routes/routes.projects.js';
import { registerStageTaskRoutes } from './routes/routes.stage-tasks.js';
import { registerStageRoutes } from './routes/routes.stages.js';
import { registerTemplateRoutes } from './routes/routes.templates.js';
import { createAlertsTimeZoneValidator } from './services/alerts-time-zone-validator.js';
import type { DictionaryService } from './services/dictionary-service.js';
import { ProjectLookupService } from './services/lookup-service.js';
import { createLossReasonService } from './services/loss-reason-service.js';
import { MoveService } from './services/move-service.js';
import { ProjectAccess, type ProjectAccessDeps } from './services/project-access.js';
import { ProjectReadService } from './services/project-read-service.js';
import { ProjectService } from './services/project-service.js';
import { ProjectStageGuardRegistry } from './services/project-stage-guard-registry.js';
import type { ProjectTasks } from './services/project-tasks.js';
import { createRoleService } from './services/role-service.js';
import { StageService } from './services/stage-service.js';
import { StageTaskService } from './services/stage-task-service.js';
import { createProjectTaskContext } from './services/task-context-descriptor.js';
import { TemplateService } from './services/template-service.js';

/**
 * `projects` — composed by the kernel container.
 *
 * **One file, deliberately** (CRM `research.md` N-6): `check:port-dependencies`
 * reads a module's registrations from the file that exports `registerModule`
 * and from no other, so every registration, route, subscriber and boot hook of
 * this module is written here, one delimited section per area, and a story adds
 * a section rather than a file.
 */

/** What this module reads from the container: the platform's services and its own. */
interface ProjectsCradle {
  readonly emFactory: () => EntityManager;
  readonly commandBus: CommandBus;
  readonly requireAdmin: RequireAdminFactory;
  readonly projectsAccess: ProjectAccess;
  readonly projectsReadService: ProjectReadService;
  readonly projectsService: ProjectService;
  readonly projectsStageService: StageService;
  readonly projectsMoveService: MoveService;
  readonly projectStageGuardRegistry: ProjectStageGuardRegistry;
  readonly projectsTasks: ProjectTasks;
  readonly projectsStageTaskService: StageTaskService;
  readonly projectsTemplateService: TemplateService;
  readonly projectsTranslate: ProjectsTranslate;
  readonly projectsRoleService: DictionaryService;
  readonly projectsLossReasonService: DictionaryService;
  readonly projectsLookupService: ProjectLookupService;
}

/** `_i18n`'s resolver over this module's own bundles. */
type ProjectsTranslate = (
  key: string,
  language: Parameters<AdminI18nTranslatePort['translate']>[2],
  params?: Record<string, string | number>,
) => Promise<string>;

export function registerModule(ctx: ModuleContext): void {
  // --- Access (research R-2, R-3) --------------------------------------------
  // The module's only read path to a Project: every Project-owned entity is
  // `@RuleScoped` with no ORM filter behind it, so every list, count and read
  // by id composes this service's predicate or starts from a Project it
  // returned (`project-access-seam.test.ts`). The ports it asks — permissions,
  // another administrator's reach, administrators, settings — are resolved
  // lazily, per call, and never captured in this singleton.
  ctx.di.register({
    projectsAccess: ctx
      .asFunction(
        ({ emFactory }: ProjectsCradle) =>
          new ProjectAccess({
            emFactory,
            permissions: lazyPort<ProjectAccessDeps['permissions']>(ctx, 'permissionService'),
            tenantScopes: lazyPort<AdminTenantScopePort>(ctx, 'adminTenantScopePort'),
            adminUsers: lazyPort<AdminUserReadPort>(ctx, 'adminUserReadPort'),
            settings: lazyPort<SettingsReadPort>(ctx, 'settingsReadPort'),
          }),
      )
      .singleton(),
  });
  // --- end of Access -----------------------------------------------------------

  // --- Wording (research R-7, R-8) ---------------------------------------------
  // What this module stores as a key and words per reader — a Stage Task's
  // responsible-Role note, a duplicated Template's name — through `_i18n`'s
  // resolver, resolved lazily, per call.
  ctx.di.register({
    projectsTranslate: ctx
      .asFunction((): ProjectsTranslate => {
        const i18n = lazyPort<AdminI18nTranslatePort>(ctx, 'adminI18nService');
        return (key, language, params) => i18n.translate('projects', key, language, params);
      })
      .singleton(),
  });
  // --- end of Wording ------------------------------------------------------------

  // --- Projects (read side) ------------------------------------------------------
  ctx.di.register({
    projectsReadService: ctx
      .asFunction(
        ({ emFactory, projectsAccess }: ProjectsCradle) =>
          new ProjectReadService({
            emFactory,
            access: projectsAccess,
            organizations: lazyPort<OrganizationDetailsPort>(ctx, 'organizationDetailsPort'),
            adminUsers: lazyPort<AdminUserReadPort>(ctx, 'adminUserReadPort'),
            settings: lazyPort<SettingsReadPort>(ctx, 'settingsReadPort'),
          }),
      )
      .singleton(),
  });
  // --- end of Projects (read side) -------------------------------------------------

  // --- Tasks (User Story 2, research R-8, R-9) ---------------------------------------
  // The Tasks module is optional (FR-040): Projects only *degrades* without it
  // (the manifest's `degrades-without` edges on both ports). Every caller asks
  // `present()` first and only then calls a port, so a switched-off Tasks
  // module is a decision, never a caught refusal.
  ctx.di.register({
    projectsTasks: ctx
      .asFunction(
        (): ProjectTasks => ({
          present: () => effectiveState.isPresent('tasks'),
          read: lazyPort<TaskReadPort>(ctx, 'taskReadPort'),
          write: lazyPort<TaskWritePort>(ctx, 'taskWritePort'),
        }),
      )
      .singleton(),
  });
  /**
   * The `project` Task context — a **contribution** hook. It pushes an inert
   * descriptor into `taskContextRegistry`, an ungated registry `tasks` owns,
   * and carries no presence probe: the registry enumerates only descriptors
   * whose owner is effectively present, so Project Tasks are hidden while
   * Projects is off and back without a restart when it is on. In an instance
   * without `tasks` the push is dropped by the platform.
   */
  ctx.onBoot(() => {
    lazyPort<TaskContextRegistryPort>(ctx, 'taskContextRegistry').register(
      createProjectTaskContext({
        access: ctx.cradle<ProjectsCradle>().projectsAccess,
        emFactory: ctx.cradle<ProjectsCradle>().emFactory,
        translate: ctx.cradle<ProjectsCradle>().projectsTranslate,
      }),
    );
  });
  // --- end of Tasks ------------------------------------------------------------------

  // --- Settings ----------------------------------------------------------------------
  /**
   * `projects.alerts_time_zone` must be a zone the runtime knows (pulled
   * forward from T118) — a **contribution** hook into `settings`' validator
   * registry, which filters contributors by presence when it is read.
   */
  ctx.onBoot(() => {
    lazyPort<SettingWriteValidatorRegistryPort>(ctx, 'settingWriteValidatorRegistry').register(
      createAlertsTimeZoneValidator(),
    );
  });
  // --- end of Settings ---------------------------------------------------------------

  // --- Projects (writes, User Story 1) -----------------------------------------------
  // Create, edit and delete a Project, its Organizations and its Members. Every
  // write is a Command (Constitution XIII) and starts from `ProjectAccess`.
  ctx.di.register({
    projectsService: ctx
      .asFunction(
        ({
          emFactory,
          commandBus,
          projectsAccess,
          projectsReadService,
          projectsTasks,
          projectsTemplateService,
          projectsStageTaskService,
        }: ProjectsCradle) =>
          new ProjectService({
            emFactory,
            commandBus,
            access: projectsAccess,
            read: projectsReadService,
            organizations: lazyPort<OrganizationDetailsPort>(ctx, 'organizationDetailsPort'),
            adminUsers: lazyPort<AdminUserReadPort>(ctx, 'adminUserReadPort'),
            tasks: projectsTasks,
            templates: projectsTemplateService,
            stageTasks: projectsStageTaskService,
          }),
      )
      .singleton(),
  });
  // --- end of Projects (writes) ------------------------------------------------------

  // --- Templates (User Story 3, research R-7) ------------------------------------------
  // Platform-wide configuration, copied into a Project when one is created
  // from it — never referenced — so nothing here reads a Project.
  ctx.di.register({
    projectsTemplateService: ctx
      .asFunction(
        ({ emFactory, commandBus, projectsTranslate }: ProjectsCradle) =>
          new TemplateService({ emFactory, commandBus, translate: projectsTranslate }),
      )
      .singleton(),
  });
  // --- end of Templates ----------------------------------------------------------------

  // --- Project Roles and loss reasons (User Story 4) --------------------------------------
  // Platform-wide configuration. A Role is a label a Member holds — it grants
  // no permission (FR-009); nothing here touches `admin_roles`.
  ctx.di.register({
    projectsRoleService: ctx
      .asFunction(({ emFactory, commandBus }: ProjectsCradle) => createRoleService({ emFactory, commandBus }))
      .singleton(),
    projectsLossReasonService: ctx
      .asFunction(({ emFactory, commandBus }: ProjectsCradle) => createLossReasonService({ emFactory, commandBus }))
      .singleton(),
  });
  // --- end of Project Roles and loss reasons ------------------------------------------------

  // --- Lookups (User Story 5) ------------------------------------------------------------
  // What the screens' pickers choose from — Organizations, Members, listed
  // people — read through their owners' ports and gated by this module's own
  // codes, so running Projects needs no other module's permission (the CRM
  // precedent). Organizations are narrowed to the caller's reach here.
  ctx.di.register({
    projectsLookupService: ctx
      .asFunction(
        () =>
          new ProjectLookupService({
            organizations: lazyPort<OrganizationDetailsPort>(ctx, 'organizationDetailsPort'),
            adminUsers: lazyPort<AdminUserReadPort>(ctx, 'adminUserReadPort'),
          }),
      )
      .singleton(),
  });
  // --- end of Lookups ---------------------------------------------------------------------

  // --- Stages, workflow and walking a Project (User Story 1) -------------------------
  // The guard registry is a **contribution seam** (research R-6): other modules
  // and deployments push a guard into it from a contribution-only boot hook,
  // so it is registered ungated (`ctx.di.register`, never `providePort`) — a
  // boot hook that resolved a gated name would stop the backend from starting
  // whenever this module was switched off. Nothing reads it while the module is
  // off: its only reader is the move service, reached through this module's
  // gated routes.
  //
  // Enumeration policy: a guard whose owner module is not effectively present
  // is skipped at dispatch. `effectiveState` is the kernel's one answer to "is
  // this module present", on both axes.
  ctx.di.register({
    projectStageGuardRegistry: ctx
      .asFunction(() => new ProjectStageGuardRegistry((moduleId) => effectiveState.isPresent(moduleId)))
      .singleton(),
    projectsStageService: ctx
      .asFunction(
        ({ emFactory, commandBus, projectsAccess, projectsReadService, projectsTasks }: ProjectsCradle) =>
          new StageService({
            emFactory,
            commandBus,
            access: projectsAccess,
            read: projectsReadService,
            tasks: projectsTasks,
          }),
      )
      .singleton(),
    // Stage Tasks and the completion gate (User Story 2, R-7, R-8).
    projectsStageTaskService: ctx
      .asFunction(
        ({ emFactory, commandBus, projectsAccess, projectsReadService, projectsTasks }: ProjectsCradle) =>
          new StageTaskService({
            emFactory,
            commandBus,
            access: projectsAccess,
            read: projectsReadService,
            tasks: projectsTasks,
            adminUsers: lazyPort<AdminUserReadPort>(ctx, 'adminUserReadPort'),
          }),
      )
      .singleton(),
    projectsMoveService: ctx
      .asFunction(
        ({
          emFactory,
          commandBus,
          projectsAccess,
          projectsReadService,
          projectStageGuardRegistry,
          projectsStageTaskService,
          projectsTasks,
        }: ProjectsCradle) =>
          new MoveService({
            emFactory,
            commandBus,
            access: projectsAccess,
            read: projectsReadService,
            guards: projectStageGuardRegistry,
            stageTasks: projectsStageTaskService,
            tasks: projectsTasks,
          }),
      )
      .singleton(),
  });
  // --- end of Stages -----------------------------------------------------------------

  // --- Routes ------------------------------------------------------------------------
  ctx.routes(async (app) => {
    const cradle = ctx.cradle<ProjectsCradle>();
    await registerProjectRoutes(app, {
      projectReadService: cradle.projectsReadService,
      projectService: cradle.projectsService,
      requireAdmin: cradle.requireAdmin,
    });
    await registerStageRoutes(app, {
      projectReadService: cradle.projectsReadService,
      stageService: cradle.projectsStageService,
      moveService: cradle.projectsMoveService,
      requireAdmin: cradle.requireAdmin,
    });
    await registerStageTaskRoutes(app, {
      stageTaskService: cradle.projectsStageTaskService,
      requireAdmin: cradle.requireAdmin,
    });
    await registerTemplateRoutes(app, {
      templateService: cradle.projectsTemplateService,
      requireAdmin: cradle.requireAdmin,
    });
    await registerLookupRoutes(app, {
      lookupService: cradle.projectsLookupService,
      access: cradle.projectsAccess,
      requireAdmin: cradle.requireAdmin,
    });
    await registerDictionaryRoutes(app, {
      roleService: cradle.projectsRoleService,
      lossReasonService: cradle.projectsLossReasonService,
      requireAdmin: cradle.requireAdmin,
    });
  });
  // --- end of Routes -----------------------------------------------------------------
}

/**
 * The module's persisted entity classes, on the `./backend` subpath, as one
 * array and no named class export (D-168). The platform reads this array when
 * the package is installed; a missing array is answered with zero entities
 * registered and no error anywhere.
 *
 * Twenty-three classes, the whole schema of the module
 * (`specs/163-projects-and-tasks/data-model.md` §2): the configuration is
 * `@GlobalEntity`, everything a Project owns is `@RuleScoped` and read only
 * through `ProjectAccess`.
 */
export const entities = [
  // Configuration (`@GlobalEntity`).
  ProjectRole,
  ProjectLossReason,
  ProjectTemplate,
  ProjectTemplateRole,
  ProjectTemplateStage,
  ProjectTemplateStageTask,
  ProjectTemplateStageMove,
  ProjectMessageReadBaseline,
  // A Project and what it owns (`@RuleScoped`).
  Project,
  ProjectOrganization,
  ProjectMember,
  ProjectMemberRole,
  ProjectViewer,
  ProjectStage,
  ProjectStageTask,
  ProjectStageMove,
  ProjectStageEntry,
  ProjectLink,
  ProjectComment,
  ProjectMessageRead,
  ProjectReference,
  ProjectAttachment,
  ProjectStageAlertDelivery,
];
