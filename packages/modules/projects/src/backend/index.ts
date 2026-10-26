import type { EntityManager } from '@mikro-orm/postgresql';
import type {
  AdminTenantScopePort,
  AdminUserReadPort,
  OrganizationDetailsPort,
  PermissionReadPort,
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
import { registerProjectRoutes } from './routes/routes.projects.js';
import { registerStageRoutes } from './routes/routes.stages.js';
import { MoveService } from './services/move-service.js';
import { ProjectAccess } from './services/project-access.js';
import { ProjectReadService } from './services/project-read-service.js';
import { ProjectService } from './services/project-service.js';
import { ProjectStageGuardRegistry } from './services/project-stage-guard-registry.js';
import { StageService } from './services/stage-service.js';

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
}

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
            permissions: lazyPort<PermissionReadPort>(ctx, 'permissionService'),
            tenantScopes: lazyPort<AdminTenantScopePort>(ctx, 'adminTenantScopePort'),
            adminUsers: lazyPort<AdminUserReadPort>(ctx, 'adminUserReadPort'),
            settings: lazyPort<SettingsReadPort>(ctx, 'settingsReadPort'),
          }),
      )
      .singleton(),
  });
  // --- end of Access -----------------------------------------------------------

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

  // --- Projects (writes, User Story 1) -----------------------------------------------
  // Create, edit and delete a Project, its Organizations and its Members. Every
  // write is a Command (Constitution XIII) and starts from `ProjectAccess`.
  ctx.di.register({
    projectsService: ctx
      .asFunction(
        ({ emFactory, commandBus, projectsAccess, projectsReadService }: ProjectsCradle) =>
          new ProjectService({
            emFactory,
            commandBus,
            access: projectsAccess,
            read: projectsReadService,
            organizations: lazyPort<OrganizationDetailsPort>(ctx, 'organizationDetailsPort'),
            adminUsers: lazyPort<AdminUserReadPort>(ctx, 'adminUserReadPort'),
          }),
      )
      .singleton(),
  });
  // --- end of Projects (writes) ------------------------------------------------------

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
        ({ emFactory, commandBus, projectsAccess, projectsReadService }: ProjectsCradle) =>
          new StageService({ emFactory, commandBus, access: projectsAccess, read: projectsReadService }),
      )
      .singleton(),
    projectsMoveService: ctx
      .asFunction(
        ({ emFactory, commandBus, projectsAccess, projectsReadService, projectStageGuardRegistry }: ProjectsCradle) =>
          new MoveService({
            emFactory,
            commandBus,
            access: projectsAccess,
            read: projectsReadService,
            guards: projectStageGuardRegistry,
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
