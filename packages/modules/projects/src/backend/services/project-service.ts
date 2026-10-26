import { LockMode } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import {
  ERROR_CODES,
  PROJECTS_EVENTS,
  type AdminUserReadPort,
  type CreateProjectBody,
  type OrganizationDetailsPort,
  type ProjectCreatedEvent,
  type ProjectDetail,
  type ProjectMemberInput,
  type ProjectStageInput,
  type UpdateProjectBody,
} from '@endora-commerce/contracts';
import type { CommandBus } from '@endora-commerce/platform/commands';
import { HttpError } from '@endora-commerce/platform/http';
import { randomUUID } from 'crypto';
import { enterStage, todayIn } from '../domain/deadline.js';
import { defaultLinearMoves, type StageMoveDef } from '../domain/stage-graph.js';
import { Project } from '../entities/project.entity.js';
import { ProjectMember } from '../entities/project-member.entity.js';
import { ProjectMemberRole } from '../entities/project-member-role.entity.js';
import { ProjectOrganization } from '../entities/project-organization.entity.js';
import { ProjectStage } from '../entities/project-stage.entity.js';
import { ProjectStageEntry } from '../entities/project-stage-entry.entity.js';
import { ProjectStageMove } from '../entities/project-stage-move.entity.js';
import { ProjectStageTask } from '../entities/project-stage-task.entity.js';
import { ProjectViewer } from '../entities/project-viewer.entity.js';
import type { ProjectAccess } from './project-access.js';
import { nextProjectNumber } from './project-number.js';
import type { ProjectReadService } from './project-read-service.js';
import { PROJECT_TASK_CONTEXT_TYPE, type ProjectTasks } from './project-tasks.js';
import type { StageEntryPlan, StageTaskService } from './stage-task-service.js';
import { templateNotFound, type TemplateGraph, type TemplateService } from './template-service.js';

/**
 * A Project's own writes (`contracts/admin-api.md` §2.1, `data-model.md`
 * §2.4): create, edit, delete, its Organizations and its Members — each a
 * Command (Constitution XIII), one audit row per Command, `objectType:
 * 'project'`.
 *
 * Every write but creation starts from `ProjectAccess.loadVisible`, so a
 * Project the caller may not see answers 404 like a missing one; inside the
 * Command the Project row is locked and everything else is read by its id.
 * Every refusal happens before anything is written.
 *
 * **From a Template** (User Story 3, research R-7) a Project is given a copy
 * of the Template's Stages, workflow, gates, alerts, Stage Task definitions
 * and default description — its own rows, never a reference — and names the
 * Template as provenance. The body's own fields win; its `stages` are refused
 * beside a Template (the Template's are what is copied, edited afterwards on
 * the Project). A Role of the Template may be given to a Member even when it
 * has been archived since (spec edge case).
 *
 * **The first Stage** is entered by the create Command, which decides its
 * Stage Tasks as a move does (`stage-task-service.ts`): created after the
 * commit while Tasks is on, marked skipped while it is off.
 *
 * What this file does not do yet, each named by the story that brings it:
 * setting visibility and listed people on an existing Project (User Story 5),
 * Custom Field values (User Story 9), refusing to remove an Organization a
 * linked record belongs to (User Story 6). The first two are refused with 422
 * rather than silently dropped.
 */

export interface ProjectServiceDeps {
  emFactory: () => EntityManager;
  commandBus: CommandBus;
  access: ProjectAccess;
  read: ProjectReadService;
  /** `organizations`' read port — lazy, resolved per call. */
  organizations: OrganizationDetailsPort;
  /** `admin_users`' read port — lazy, resolved per call. */
  adminUsers: AdminUserReadPort;
  tasks: ProjectTasks;
  /** The Template a Project is created from (User Story 3). */
  templates: TemplateService;
  /** The first Stage's Stage Tasks, decided in the create Command and created after it. */
  stageTasks: StageTaskService;
}

export function projectChanged(): HttpError {
  return new HttpError(409, ERROR_CODES.PROJECT_CHANGED, 'The project changed since it was read. Reload it and try again.');
}

function notYet(what: string, story: string): HttpError {
  return new HttpError(422, ERROR_CODES.VALIDATION_FAILED, `${what} is not available yet (${story}).`);
}

function memberInvalid(message: string): HttpError {
  return new HttpError(422, ERROR_CODES.PROJECT_MEMBER_INVALID, message);
}

/** Lock a Project's row for the rest of the Command — writes on one Project run one at a time. */
export async function lockProject(em: EntityManager, id: string): Promise<Project> {
  const project = await em.findOne(Project, { id }, { lockMode: LockMode.PESSIMISTIC_WRITE });
  // `loadVisible` found it a moment ago; a delete in between is a change too.
  if (!project) throw projectChanged();
  return project;
}

/** The audit snapshot of a Project — no description text (the audit trail is not tenant-scoped). */
function snapshot(project: Project): Record<string, unknown> {
  return {
    number: project.number,
    title: project.title,
    state: project.state,
    valueAmount: project.valueAmount ?? null,
    valueCurrency: project.valueCurrency ?? null,
    startOn: project.startOn ?? null,
    visibility: project.visibility,
    descriptionLength: project.description.length,
    version: project.version,
  };
}

export class ProjectService {
  constructor(private readonly deps: ProjectServiceDeps) {}

  /** `POST /projects` — the Project in its first Stage, with Organizations, Members and workflow. */
  async create(body: CreateProjectBody, language: string): Promise<ProjectDetail> {
    if (body.customFieldValues && Object.keys(body.customFieldValues).length > 0) {
      throw notYet('Custom field values on a project', 'User Story 9');
    }
    let template: TemplateGraph | null = null;
    if (body.templateId) {
      if (body.stages) {
        throw new HttpError(
          422,
          ERROR_CODES.VALIDATION_FAILED,
          'A project created from a template takes the template’s stages; change them on the project afterwards.',
        );
      }
      template = await this.deps.templates.forCopy(body.templateId);
      if (!template) throw templateNotFound(422);
    }
    const stages: StageToCreate[] = template
      ? stagesFromTemplate(template)
      : (body.stages ?? []).map((stage) => ({ ...stage, tasks: [] }));
    if (stages.length === 0) {
      throw new HttpError(422, ERROR_CODES.VALIDATION_FAILED, 'A project needs at least one stage.');
    }
    await this.#assertOrganizations(body.organizationIds);
    const members = body.members ?? [];
    await this.#assertMembers(members, new Map(), new Set(template?.roleIds ?? []));
    const viewerIds = body.viewerIds ?? [];
    await this.#assertAdmins(viewerIds, 'A listed person must be an active administrator.');
    await this.#assertRolesExist(stages.flatMap((stage) => stage.responsibleRoleIds ?? []));
    const today = todayIn(await this.deps.read.timeZone());
    const tasksPresent = this.deps.tasks.present();
    let plan: StageEntryPlan = { materialize: false, notes: [] };
    let entryId = '';
    let firstStageId = '';

    const id = randomUUID();
    await this.deps.commandBus.run({
      action: 'projects.project.create',
      objectType: 'project',
      objectId: id,
      run: async ({ em, actor }) => {
        if (actor.actorAdminUserId === null) {
          // `created_by_admin_user_id` is not null: a Project is somebody's.
          throw new Error('projects: a Project is created by an administrator; the ambient actor is none.');
        }
        const project = em.create(Project, {
          id,
          number: await nextProjectNumber(em),
          title: body.title,
          description: body.description ?? template?.description ?? '',
          valueAmount: body.value?.amount ?? null,
          valueCurrency: body.value?.currency ?? null,
          ...(body.startOn ? { startOn: body.startOn } : { startOn: today }),
          visibility: body.visibility ?? 'inherit',
          templateId: template?.id ?? null,
          createdByAdminUserId: actor.actorAdminUserId,
        });
        // Flushed in the order of the foreign keys: these entities hold each
        // other's ids as values, not relations, so the unit of work cannot
        // order the inserts itself. The Project first, its Stages next, then
        // what refers to them, and the Project points at its first Stage last:
        // the current-Stage key is checked per statement, the "open Project
        // has a Stage" trigger at commit.
        await em.flush();
        const rows = stages.map((stage, index) =>
          em.create(ProjectStage, {
            projectId: id,
            name: stage.name,
            color: stage.color,
            position: index + 1,
            plannedDurationDays: stage.plannedDurationDays ?? 0,
            responsibleRoleIds: stage.responsibleRoleIds ?? [],
            alertOffsetsDays: stage.alertOffsetsDays ?? [],
            completionGate: stage.completionGate ?? false,
            completionPermitted: stage.completionPermitted ?? index === stages.length - 1,
          }),
        );
        const first = rows[0]!;
        firstStageId = first.id;
        Object.assign(first, enterStage({ ...first, startedOn: null, deadlineOn: null }, today));
        await em.flush();
        const moves = template ? copiedMoves(template, rows) : defaultLinearMoves(rows);
        for (const move of moves) em.create(ProjectStageMove, { projectId: id, ...move });
        stages.forEach((stage, index) => {
          stage.tasks.forEach((task, at) =>
            em.create(ProjectStageTask, {
              stageId: rows[index]!.id,
              title: task.title,
              description: task.description,
              responsibleRoleId: task.responsibleRoleId,
              dueOffsetDays: task.dueOffsetDays,
              position: at + 1,
            }),
          );
        });
        for (const organizationId of body.organizationIds) em.create(ProjectOrganization, { projectId: id, organizationId });
        const memberRows = members.map((member) =>
          em.create(ProjectMember, { projectId: id, adminUserId: member.adminUserId }),
        );
        for (const adminUserId of viewerIds) em.create(ProjectViewer, { projectId: id, adminUserId });
        await em.flush();
        plan = await this.deps.stageTasks.planEntry(em as EntityManager, first, tasksPresent);
        const entry = em.create(ProjectStageEntry, {
          projectId: id,
          kind: 'enter',
          fromStageId: null,
          toStageId: first.id,
          fromStageName: null,
          toStageName: first.name,
          notes: plan.notes,
          actorAdminUserId: actor.actorAdminUserId,
        });
        entryId = entry.id;
        await em.flush();
        members.forEach((member, index) => {
          for (const roleId of member.roleIds) em.create(ProjectMemberRole, { memberId: memberRows[index]!.id, roleId });
        });
        project.currentStageId = first.id;
        return {
          result: id,
          after: {
            ...snapshot(project),
            organizationIds: body.organizationIds,
            members: members.map((m) => ({ adminUserId: m.adminUserId, roleIds: m.roleIds })),
            viewerIds,
            stages: rows.map((stage) => stage.name),
            templateId: template?.id ?? null,
          },
        };
      },
      event: (projectId) => {
        const payload: ProjectCreatedEvent = {
          eventId: randomUUID(),
          occurredAt: new Date().toISOString(),
          projectId,
          templateId: template?.id ?? null,
        };
        return { eventName: PROJECTS_EVENTS.PROJECT_CREATED, payload };
      },
    });
    if (plan.materialize) await this.deps.stageTasks.materializeAfterCommit(id, firstStageId, entryId);
    return this.deps.read.afterWrite(id, language);
  }

  /** `PATCH /projects/:id` — title, description, value and start date, against `version`. */
  async update(id: string, body: UpdateProjectBody, language: string): Promise<ProjectDetail> {
    if (body.visibility !== undefined || body.viewerIds !== undefined) {
      throw notYet('Changing who sees a project', 'User Story 5');
    }
    if (body.customFieldValues && Object.keys(body.customFieldValues).length > 0) {
      throw notYet('Custom field values on a project', 'User Story 9');
    }
    const visible = await this.deps.access.loadVisible(id);
    if (visible.version !== body.version) throw projectChanged();
    await this.deps.commandBus.run({
      action: 'projects.project.update',
      objectType: 'project',
      objectId: visible.id,
      run: async ({ em }) => {
        const project = await lockProject(em, visible.id);
        if (project.version !== body.version) throw projectChanged();
        const before = snapshot(project);
        if (body.title !== undefined) project.title = body.title;
        if (body.description !== undefined) project.description = body.description;
        if (body.value !== undefined) {
          project.valueAmount = body.value?.amount ?? null;
          project.valueCurrency = body.value?.currency ?? null;
        }
        if (body.startOn !== undefined) project.startOn = body.startOn;
        project.version += 1;
        return { result: null, before, after: snapshot(project) };
      },
    });
    return this.deps.read.afterWrite(visible.id, language);
  }

  /** `DELETE /projects/:id` — refused while records are linked (FR-021). */
  async delete(id: string): Promise<void> {
    const visible = await this.deps.access.loadVisible(id);
    await this.deps.commandBus.run({
      action: 'projects.project.delete',
      objectType: 'project',
      objectId: visible.id,
      run: async ({ em }) => {
        const project = await lockProject(em, visible.id);
        const links = (await em.execute(
          `select count(*)::int as "n" from "project_links" l where l."project_id" = ?`,
          [project.id],
        )) as Array<{ n: number }>;
        if (Number(links[0]?.n ?? 0) > 0) {
          throw new HttpError(409, ERROR_CODES.PROJECT_HAS_LINKS, 'Unlink the records of this project before deleting it.');
        }
        const before = snapshot(project);
        // Its Stages, Members, history and everything else it owns go with it
        // (`on delete cascade`).
        em.remove(project);
        return { result: null, before, after: null };
      },
    });
    // Its Tasks go with it too (spec edge case) — after the commit, through
    // the Tasks module's own Commands. With Tasks off they stay, belonging to
    // a Project nobody can see, and so are hidden by the Tasks module.
    if (this.deps.tasks.present()) {
      await this.deps.tasks.write.deleteInContext({ contextType: PROJECT_TASK_CONTEXT_TYPE, contextId: visible.id });
    }
  }

  /**
   * `PUT /projects/:id/organizations` — the whole set. One Command per
   * Organization added or removed, so the trail names each; every refusal is
   * checked before the first.
   */
  async setOrganizations(id: string, organizationIds: readonly string[], language: string): Promise<ProjectDetail> {
    const visible = await this.deps.access.loadVisible(id);
    const current = (
      (await this.deps.emFactory().execute(
        `select po."organization_id" from "project_organizations" po where po."project_id" = ?`,
        [visible.id],
      )) as Array<{ organization_id: string }>
    ).map((row) => row.organization_id);
    const added = organizationIds.filter((orgId) => !current.includes(orgId));
    const removed = current.filter((orgId) => !organizationIds.includes(orgId));
    await this.#assertOrganizations(added);

    for (const organizationId of added) {
      await this.deps.commandBus.run({
        action: 'projects.project.organization_add',
        objectType: 'project',
        objectId: visible.id,
        run: async ({ em }) => {
          await lockProject(em, visible.id);
          const inserted = (await em.execute(
            `insert into "project_organizations" ("project_id", "organization_id") values (?, ?)
             on conflict do nothing returning "organization_id"`,
            [visible.id, organizationId],
          )) as unknown[];
          if (inserted.length === 0) return { result: null, skipAudit: true };
          return { result: null, before: null, after: { organizationId } };
        },
      });
    }
    for (const organizationId of removed) {
      await this.deps.commandBus.run({
        action: 'projects.project.organization_remove',
        objectType: 'project',
        objectId: visible.id,
        run: async ({ em }) => {
          await lockProject(em, visible.id);
          const deleted = await em.nativeDelete(ProjectOrganization, { projectId: visible.id, organizationId });
          if (deleted === 0) return { result: null, skipAudit: true };
          return { result: null, before: { organizationId }, after: null };
        },
      });
    }
    return this.deps.read.afterWrite(visible.id, language);
  }

  /** `PUT /projects/:id/members` — the whole set, Members and their Roles, in one Command. */
  async setMembers(id: string, members: readonly ProjectMemberInput[], language: string): Promise<ProjectDetail> {
    const visible = await this.deps.access.loadVisible(id);
    const em = this.deps.emFactory();
    const held = (await em.execute(
      `select pm."admin_user_id", pmr."role_id" from "project_members" pm
         join "project_member_roles" pmr on pmr."member_id" = pm."id"
        where pm."project_id" = ?`,
      [visible.id],
    )) as Array<{ admin_user_id: string; role_id: string }>;
    const heldRoles = new Map<string, Set<string>>();
    for (const row of held) {
      heldRoles.set(row.admin_user_id, (heldRoles.get(row.admin_user_id) ?? new Set()).add(row.role_id));
    }
    await this.#assertMembers(members, heldRoles);

    await this.deps.commandBus.run({
      action: 'projects.project.member_set',
      objectType: 'project',
      objectId: visible.id,
      run: async ({ em: tx }) => {
        await lockProject(tx, visible.id);
        const rows = (await tx.execute(
          `select pm."id", pm."admin_user_id", coalesce(array_agg(pmr."role_id") filter (where pmr."role_id" is not null), '{}') as "role_ids"
             from "project_members" pm left join "project_member_roles" pmr on pmr."member_id" = pm."id"
            where pm."project_id" = ? group by pm."id", pm."admin_user_id"`,
          [visible.id],
        )) as Array<{ id: string; admin_user_id: string; role_ids: string[] | string }>;
        const before = rows.map((row) => ({
          adminUserId: row.admin_user_id,
          roleIds: (Array.isArray(row.role_ids) ? row.role_ids : String(row.role_ids).replace(/^\{|\}$/g, '').split(',')).filter(Boolean).sort(),
        }));
        const wanted = new Map(members.map((member) => [member.adminUserId, member.roleIds]));
        for (const row of rows) {
          if (!wanted.has(row.admin_user_id)) {
            await tx.nativeDelete(ProjectMember, { id: row.id });
            continue;
          }
          await tx.nativeDelete(ProjectMemberRole, { memberId: row.id });
          for (const roleId of wanted.get(row.admin_user_id)!) tx.create(ProjectMemberRole, { memberId: row.id, roleId });
          wanted.delete(row.admin_user_id);
        }
        const added = [...wanted].map(([adminUserId, roleIds]) => ({
          member: tx.create(ProjectMember, { projectId: visible.id, adminUserId }),
          roleIds,
        }));
        // A Member's row before its Roles' (see `create`).
        await tx.flush();
        for (const { member, roleIds } of added) {
          for (const roleId of roleIds) tx.create(ProjectMemberRole, { memberId: member.id, roleId });
        }
        return {
          result: null,
          before: { members: before },
          after: { members: members.map((m) => ({ adminUserId: m.adminUserId, roleIds: [...m.roleIds].sort() })) },
        };
      },
    });
    return this.deps.read.afterWrite(visible.id, language);
  }

  /**
   * Each Organization exists and is in the caller's reach (FR-004). The two are
   * one refusal: telling them apart would confirm an Organization exists to
   * somebody who may not see it.
   */
  async #assertOrganizations(organizationIds: readonly string[]): Promise<void> {
    if (organizationIds.length === 0) return;
    const outOfScope = () =>
      new HttpError(
        422,
        ERROR_CODES.PROJECT_ORGANIZATION_OUT_OF_SCOPE,
        'An organization of this project is not available to you.',
      );
    if (organizationIds.some((orgId) => !this.deps.access.isOrgInScope(orgId))) throw outOfScope();
    const found = await this.deps.organizations.findByIds(organizationIds);
    if (found.length !== new Set(organizationIds).size) throw outOfScope();
  }

  /** Every id names an active administrator. */
  async #assertAdmins(adminUserIds: readonly string[], message: string): Promise<void> {
    const ids = [...new Set(adminUserIds)];
    if (ids.length === 0) return;
    const found = await this.deps.adminUsers.findByIds(ids, { activeOnly: true });
    const active = new Set(found.filter((a) => a.status === 'active' && a.deletedAt === null).map((a) => a.id));
    if (ids.some((adminUserId) => !active.has(adminUserId))) throw memberInvalid(message);
  }

  /**
   * Members are active administrators, and each Role exists and is not
   * archived — unless the Member already holds it here: an archived Role stays
   * on the Projects that use it (US4 sc.2), it is only not handed out again —
   * or the Template the Project is created from names it (spec edge case "A
   * Template whose Role has been archived").
   */
  async #assertMembers(
    members: readonly ProjectMemberInput[],
    heldRoles: Map<string, Set<string>>,
    templateRoles: ReadonlySet<string> = new Set(),
  ): Promise<void> {
    await this.#assertAdmins(
      members.map((member) => member.adminUserId),
      'A member must be an active administrator.',
    );
    const roleIds = [...new Set(members.flatMap((member) => member.roleIds))];
    if (roleIds.length === 0) return;
    const rows = (await this.deps.emFactory().execute(
      `select r."id", r."archived_at" from "project_roles" r where r."id" = any(?::uuid[])`,
      [`{${roleIds.join(',')}}`],
    )) as Array<{ id: string; archived_at: Date | null }>;
    const archived = new Map(rows.map((row) => [row.id, row.archived_at !== null]));
    for (const member of members) {
      for (const roleId of member.roleIds) {
        if (!archived.has(roleId)) throw memberInvalid('A project role does not exist.');
        if (archived.get(roleId) && !heldRoles.get(member.adminUserId)?.has(roleId) && !templateRoles.has(roleId)) {
          throw memberInvalid('An archived project role is not handed out again.');
        }
      }
    }
  }

  /** The responsible Roles of a Stage exist. */
  async #assertRolesExist(roleIds: readonly string[]): Promise<void> {
    await assertRolesExist(this.deps.emFactory(), roleIds);
  }
}

/** Every id names a Project Role (archived ones included — a Stage may keep one). */
export async function assertRolesExist(em: EntityManager, roleIds: readonly string[]): Promise<void> {
  const ids = [...new Set(roleIds)];
  if (ids.length === 0) return;
  const rows = (await em.execute(`select r."id" from "project_roles" r where r."id" = any(?::uuid[])`, [
    `{${ids.join(',')}}`,
  ])) as Array<{ id: string }>;
  if (rows.length !== ids.length) {
    throw new HttpError(422, ERROR_CODES.VALIDATION_FAILED, 'A responsible role is not a project role.');
  }
}

/** A Stage the create Command writes, with the Stage Task definitions it is given. */
type StageToCreate = ProjectStageInput & { tasks: TemplateGraph['stages'][number]['tasks'] };

/** A Template's Stages as the Project's own (R-7): every attribute, explicit, and their Stage Tasks. */
function stagesFromTemplate(template: TemplateGraph): StageToCreate[] {
  return template.stages.map((stage) => ({
    name: stage.name,
    color: stage.color,
    plannedDurationDays: stage.plannedDurationDays,
    responsibleRoleIds: stage.responsibleRoleIds,
    alertOffsetsDays: stage.alertOffsetsDays,
    completionGate: stage.completionGate,
    completionPermitted: stage.completionPermitted,
    tasks: stage.tasks,
  }));
}

/** The Template's moves between the Project's copies of its Stages — the n-th Stage is the n-th copy. */
function copiedMoves(template: TemplateGraph, rows: readonly ProjectStage[]): StageMoveDef[] {
  const copyOf = new Map(template.stages.map((stage, index) => [stage.id, rows[index]!.id]));
  return template.moves
    .filter((move) => copyOf.has(move.fromStageId) && copyOf.has(move.toStageId))
    .map((move) => ({ fromStageId: copyOf.get(move.fromStageId)!, toStageId: copyOf.get(move.toStageId)! }));
}
