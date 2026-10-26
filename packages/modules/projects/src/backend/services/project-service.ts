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
  type UpdateProjectBody,
} from '@endora-commerce/contracts';
import type { CommandBus } from '@endora-commerce/platform/commands';
import { HttpError } from '@endora-commerce/platform/http';
import { randomUUID } from 'crypto';
import { enterStage, todayIn } from '../domain/deadline.js';
import { defaultLinearMoves } from '../domain/stage-graph.js';
import { Project } from '../entities/project.entity.js';
import { ProjectMember } from '../entities/project-member.entity.js';
import { ProjectMemberRole } from '../entities/project-member-role.entity.js';
import { ProjectOrganization } from '../entities/project-organization.entity.js';
import { ProjectStage } from '../entities/project-stage.entity.js';
import { ProjectStageEntry } from '../entities/project-stage-entry.entity.js';
import { ProjectStageMove } from '../entities/project-stage-move.entity.js';
import { ProjectViewer } from '../entities/project-viewer.entity.js';
import type { ProjectAccess } from './project-access.js';
import { nextProjectNumber } from './project-number.js';
import type { ProjectReadService } from './project-read-service.js';

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
 * What this file does not do yet, each named by the story that brings it:
 * creating from a Template (User Story 3), setting visibility and listed
 * people on an existing Project (User Story 5), Custom Field values (User
 * Story 9), refusing to remove an Organization a linked record belongs to and
 * deleting a Project's Tasks with it (User Stories 6 and 2). The first three
 * are refused with 422 rather than silently dropped.
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
    if (body.templateId) throw notYet('Creating a project from a template', 'User Story 3');
    if (body.customFieldValues && Object.keys(body.customFieldValues).length > 0) {
      throw notYet('Custom field values on a project', 'User Story 9');
    }
    const stages = body.stages ?? [];
    if (stages.length === 0) {
      throw new HttpError(422, ERROR_CODES.VALIDATION_FAILED, 'A project needs at least one stage.');
    }
    await this.#assertOrganizations(body.organizationIds);
    const members = body.members ?? [];
    await this.#assertMembers(members, new Map());
    const viewerIds = body.viewerIds ?? [];
    await this.#assertAdmins(viewerIds, 'A listed person must be an active administrator.');
    await this.#assertRolesExist(stages.flatMap((stage) => stage.responsibleRoleIds ?? []));
    const today = todayIn(await this.deps.read.timeZone());

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
          description: body.description ?? '',
          valueAmount: body.value?.amount ?? null,
          valueCurrency: body.value?.currency ?? null,
          ...(body.startOn ? { startOn: body.startOn } : { startOn: today }),
          visibility: body.visibility ?? 'inherit',
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
        Object.assign(first, enterStage({ ...first, startedOn: null, deadlineOn: null }, today));
        await em.flush();
        for (const move of defaultLinearMoves(rows)) em.create(ProjectStageMove, { projectId: id, ...move });
        for (const organizationId of body.organizationIds) em.create(ProjectOrganization, { projectId: id, organizationId });
        const memberRows = members.map((member) =>
          em.create(ProjectMember, { projectId: id, adminUserId: member.adminUserId }),
        );
        for (const adminUserId of viewerIds) em.create(ProjectViewer, { projectId: id, adminUserId });
        em.create(ProjectStageEntry, {
          projectId: id,
          kind: 'enter',
          fromStageId: null,
          toStageId: first.id,
          fromStageName: null,
          toStageName: first.name,
          actorAdminUserId: actor.actorAdminUserId,
        });
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
          },
        };
      },
      event: (projectId) => {
        const payload: ProjectCreatedEvent = {
          eventId: randomUUID(),
          occurredAt: new Date().toISOString(),
          projectId,
          templateId: null,
        };
        return { eventName: PROJECTS_EVENTS.PROJECT_CREATED, payload };
      },
    });
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
   * on the Projects that use it (US4 sc.2), it is only not handed out again.
   */
  async #assertMembers(members: readonly ProjectMemberInput[], heldRoles: Map<string, Set<string>>): Promise<void> {
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
        if (archived.get(roleId) && !heldRoles.get(member.adminUserId)?.has(roleId)) {
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
