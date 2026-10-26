import type { EntityManager } from '@mikro-orm/postgresql';
import {
  ERROR_CODES,
  type AdminUserReadPort,
  type OrganizationDetailsPort,
  type ProjectListQuery,
  type ProjectListResponse,
  type ProjectSummary,
} from '@endora-commerce/contracts';
import { HttpError } from '@endora-commerce/platform/http';
import type { SettingsReadPort } from '@endora-commerce/platform/kernel';
import { z } from 'zod';
import {
  actingAdminUserId,
  isUuid,
  uuidArray,
  VISIBLE_PROJECT_COLUMNS,
  type ProjectAccess,
  type VisibleProjectRow,
} from './project-access.js';

/**
 * Projects — the read side of `specs/163-projects-and-tasks/contracts/admin-api.md`
 * §2.1 that the foundation phase needs: the list and one Project by id.
 *
 * **Every Project this file answers came through `ProjectAccess`**: the list
 * and its total compose `visibleProjectSql`, and the detail is
 * `loadVisible`. Stages, Organizations and Members are read only for the ids
 * of Projects those returned — which is why this file is on
 * `PROJECT_ACCESS_READERS`.
 *
 * The detail answers a {@link ProjectSummary} for now. The rest of
 * `ProjectDetail` — Stages, moves, Members, links, unread messages,
 * permissions — arrives with User Story 1, which writes them.
 */

export const PROJECTS_ALERTS_TIME_ZONE_SETTING = 'projects.alerts_time_zone';

/** The role whose holders the list names as Project Managers. */
const PROJECT_MANAGER_ROLE = 'project_manager';

const timeZoneSchema = z.string().min(1);

interface Cursor {
  at: string;
  id: string;
}

function encodeCursor(row: VisibleProjectRow): string {
  return Buffer.from(JSON.stringify({ a: row.cursor_at, i: row.id }), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined): Cursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { a?: unknown; i?: unknown };
    if (typeof parsed.a === 'string' && typeof parsed.i === 'string' && isUuid(parsed.i)) {
      return { at: parsed.a, id: parsed.i };
    }
  } catch {
    // Falls through to the refusal below: a cursor is opaque, and one this
    // service did not issue is a malformed request rather than "page one".
  }
  throw new HttpError(400, ERROR_CODES.VALIDATION_FAILED, 'The cursor is not one this list issued.');
}

function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

function personName(person: { firstName: string; lastName: string; email: string }): string {
  return `${person.firstName} ${person.lastName}`.trim() || person.email;
}

export interface ProjectReadServiceDeps {
  emFactory: () => EntityManager;
  access: ProjectAccess;
  /** `organizations`' read port — lazy, resolved per call. */
  organizations: OrganizationDetailsPort;
  /** `admin_users`' read port — lazy, resolved per call. */
  adminUsers: AdminUserReadPort;
  settings: SettingsReadPort;
}

interface CurrentStageRow {
  id: string;
  name: string;
  color: string;
  deadline_on: string | null;
  overdue: boolean;
}

export class ProjectReadService {
  constructor(private readonly deps: ProjectReadServiceDeps) {}

  /**
   * `GET /projects` — newest first on a keyset cursor `(created_at, id)`, with
   * the total the caller may see. Out of reach and invisible Projects are
   * excluded by `visibleProjectSql`, so a page, the next one and the total are
   * exact.
   */
  async list(query: ProjectListQuery): Promise<ProjectListResponse> {
    if (query.sort !== undefined && query.sort !== 'createdAt') {
      // Sorting by value or deadline is the list screen's (User Story 1); it
      // is refused rather than silently answered in another order.
      throw new HttpError(400, ERROR_CODES.VALIDATION_FAILED, `Sorting by ${query.sort} is not available yet.`);
    }
    const where: string[] = [];
    const params: unknown[] = [];
    const visible = await this.deps.access.visibleProjectSql();
    if (visible) {
      where.push(visible.sql);
      params.push(...visible.params);
    }
    if (query.state && query.state.length > 0) {
      where.push(`p."state" = any(?::text[])`);
      params.push(`{${query.state.join(',')}}`);
    }
    if (query.organizationId) {
      where.push(
        `exists (select 1 from "project_organizations" f_po where f_po."project_id" = p."id" and f_po."organization_id" = ?)`,
      );
      params.push(query.organizationId);
    }
    const memberId = query.memberId === 'me' ? actingAdminUserId() : (query.memberId ?? null);
    if (query.memberId !== undefined) {
      // "Me" is whoever asks; with no administrator behind the request nobody is.
      if (memberId === null) return { items: [], nextCursor: null, total: 0 };
      where.push(
        `exists (select 1 from "project_members" f_pm where f_pm."project_id" = p."id" and f_pm."admin_user_id" = ?)`,
      );
      params.push(memberId);
    }
    if (query.roleId) {
      where.push(
        `exists (select 1 from "project_members" f_rm join "project_member_roles" f_rr on f_rr."member_id" = f_rm."id"
                  where f_rm."project_id" = p."id" and f_rr."role_id" = ?)`,
      );
      params.push(query.roleId);
    }
    if (query.templateId) {
      where.push(`p."template_id" = ?`);
      params.push(query.templateId);
    }
    if (query.stageName) {
      where.push(
        `exists (select 1 from "project_stages" f_ps where f_ps."id" = p."current_stage_id"
                  and lower(trim(f_ps."name")) = lower(trim(?)))`,
      );
      params.push(query.stageName);
    }
    if (query.q) {
      const like = likePattern(query.q);
      where.push(`(p."title" ilike ? or p."number" ilike ?)`);
      params.push(like, like);
    }

    const em = this.deps.emFactory();
    const filtered = where.length > 0 ? `where ${where.join(' and ')}` : '';
    const counted = (await em.execute(`select count(*)::int as "n" from "projects" p ${filtered}`, params)) as Array<{
      n: number;
    }>;

    const order = query.order === 'asc' ? 'asc' : 'desc';
    const page = [...where];
    const pageParams = [...params];
    const after = decodeCursor(query.cursor);
    if (after) {
      page.push(`(p."created_at", p."id") ${order === 'desc' ? '<' : '>'} (?::timestamptz, ?::uuid)`);
      pageParams.push(after.at, after.id);
    }
    const rows = (await em.execute(
      `select ${VISIBLE_PROJECT_COLUMNS} from "projects" p
        ${page.length > 0 ? `where ${page.join(' and ')}` : ''}
        order by p."created_at" ${order}, p."id" ${order}
        limit ?`,
      [...pageParams, query.limit + 1],
    )) as VisibleProjectRow[];
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: await this.#summaries(items),
      nextCursor: hasMore ? encodeCursor(items[items.length - 1]!) : null,
      total: Number(counted[0]?.n ?? 0),
    };
  }

  /** `GET /projects/:id` — 404 `PROJECT_NOT_FOUND` for out of reach, invisible and missing alike. */
  async get(id: string): Promise<ProjectSummary> {
    const row = await this.deps.access.loadVisible(id);
    const [summary] = await this.#summaries([row]);
    return summary!;
  }

  /** Summaries of rows `ProjectAccess` let through — their children read by those ids only. */
  async #summaries(rows: readonly VisibleProjectRow[]): Promise<ProjectSummary[]> {
    if (rows.length === 0) return [];
    const em = this.deps.emFactory();
    const ids = uuidArray(rows.map((row) => row.id));
    const timeZone = await this.deps.settings.get(PROJECTS_ALERTS_TIME_ZONE_SETTING, null, timeZoneSchema);

    const [stages, organizationLinks, managers] = await Promise.all([
      em.execute(
        `select s."id", s."name", s."color", to_char(s."deadline_on", 'YYYY-MM-DD') as "deadline_on",
                (pr."state" = 'open' and s."deadline_on" is not null
                   and s."deadline_on" < (now() at time zone ?)::date) as "overdue"
           from "projects" pr join "project_stages" s on s."id" = pr."current_stage_id"
          where pr."id" = any(?::uuid[])`,
        [timeZone, ids],
      ) as Promise<CurrentStageRow[]>,
      em.execute(
        `select po."project_id", po."organization_id" from "project_organizations" po
          where po."project_id" = any(?::uuid[])`,
        [ids],
      ) as Promise<Array<{ project_id: string; organization_id: string }>>,
      em.execute(
        `select pm."project_id", pm."admin_user_id" from "project_members" pm
           join "project_member_roles" pmr on pmr."member_id" = pm."id"
           join "project_roles" r on r."id" = pmr."role_id"
          where pm."project_id" = any(?::uuid[]) and r."code" = ?
          order by pm."added_at", pm."id"`,
        [ids, PROJECT_MANAGER_ROLE],
      ) as Promise<Array<{ project_id: string; admin_user_id: string }>>,
    ]);

    const stageById = new Map(stages.map((stage) => [stage.id, stage]));
    const organizationIds = [...new Set(organizationLinks.map((link) => link.organization_id))];
    const managerIds = [...new Set(managers.map((manager) => manager.admin_user_id))];
    const [organizations, people] = await Promise.all([
      organizationIds.length > 0 ? this.deps.organizations.findByIds(organizationIds) : Promise.resolve([]),
      managerIds.length > 0 ? this.deps.adminUsers.findByIds(managerIds) : Promise.resolve([]),
    ]);
    const organizationName = new Map(organizations.map((organization) => [organization.id, organization.name]));
    const personById = new Map(people.map((person) => [person.id, person]));

    return rows.map((row) => {
      const stage = row.current_stage_id ? stageById.get(row.current_stage_id) : undefined;
      return {
        id: row.id,
        number: row.number,
        title: row.title,
        state: row.state,
        currentStage: stage
          ? { id: stage.id, name: stage.name, color: stage.color, deadlineOn: stage.deadline_on, overdue: stage.overdue }
          : null,
        organizations: organizationLinks
          .filter((link) => link.project_id === row.id)
          .map((link) => ({ id: link.organization_id, name: organizationName.get(link.organization_id) ?? '' }))
          .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
        value:
          row.value_amount !== null && row.value_currency !== null
            ? { amount: row.value_amount, currency: row.value_currency }
            : null,
        projectManagers: managers
          .filter((manager) => manager.project_id === row.id)
          .map((manager) => personById.get(manager.admin_user_id))
          .filter((person): person is NonNullable<typeof person> => person !== undefined)
          .map((person) => ({ id: person.id, name: personName(person) })),
        createdAt: new Date(row.created_at).toISOString(),
        closedAt: row.closed_at ? new Date(row.closed_at).toISOString() : null,
      };
    });
  }
}
