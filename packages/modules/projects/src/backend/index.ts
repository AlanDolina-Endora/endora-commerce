import type { EntityManager } from '@mikro-orm/postgresql';
import type {
  AdminTenantScopePort,
  AdminUserReadPort,
  OrganizationDetailsPort,
  PermissionReadPort,
} from '@endora-commerce/contracts';
import {
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
import { ProjectAccess } from './services/project-access.js';
import { ProjectReadService } from './services/project-read-service.js';

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
  readonly requireAdmin: RequireAdminFactory;
  readonly projectsAccess: ProjectAccess;
  readonly projectsReadService: ProjectReadService;
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
  ctx.routes(async (app) => {
    const cradle = ctx.cradle<ProjectsCradle>();
    await registerProjectRoutes(app, {
      projectReadService: cradle.projectsReadService,
      requireAdmin: cradle.requireAdmin,
    });
  });
  // --- end of Projects -------------------------------------------------------------
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
