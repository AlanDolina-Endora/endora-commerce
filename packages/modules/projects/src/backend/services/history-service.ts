import {
  ERROR_CODES,
  type AdminUserReadPort,
  type RecordHistoryPage,
  type RecordHistoryQuery,
  type RecordReference,
} from '@endora-commerce/contracts';
import { HttpError } from '@endora-commerce/platform/http';
import type { AuditPort } from '@endora-commerce/platform/kernel';
import type { ProjectAccess } from './project-access.js';
import type { ProjectReferenceService } from './reference-service.js';

/** The object type every Command about a Project, or anything hanging on it, is recorded under. */
export const PROJECT_AUDIT_OBJECT_TYPE = 'project';

/** The most the audit port answers in one read (`AuditPort.query`), whatever is asked. */
const AUDIT_QUERY_CAP = 500;

/**
 * How far back a history reaches: one entry fewer than the cap, so a read that
 * comes back full proves an earlier entry exists and the last page says so
 * (`truncated`) — CRM's `opportunity-history-service.ts`, the model.
 */
export const PROJECT_HISTORY_REACH = AUDIT_QUERY_CAP - 1;

/** The audited keys that hold a text which may carry reference tokens. */
const TEXT_FIELDS = ['description'] as const;

/** The texts of one audited state. */
export function auditedTexts(state: unknown): string[] {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) return [];
  return TEXT_FIELDS.map((field) => (state as Record<string, unknown>)[field]).filter(
    (value): value is string => typeof value === 'string' && value !== '',
  );
}

/**
 * An audited state as the reader may see it: without `customFieldValues` for a
 * reader who may not read custom fields (`custom_fields:read`, User Story 9).
 * The audit entry itself is never rewritten.
 */
export function visibleAuditState(state: unknown, mayReadCustomFields: boolean): unknown {
  if (mayReadCustomFields || state === null || typeof state !== 'object' || Array.isArray(state)) return state;
  if (!Object.hasOwn(state, 'customFieldValues')) return state;
  const { customFieldValues: _hidden, ...rest } = state as Record<string, unknown>;
  return rest;
}

export function encodeHistoryCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), 'utf8').toString('base64url');
}

export function decodeHistoryCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { o?: unknown };
    if (typeof parsed.o === 'number' && Number.isInteger(parsed.o) && parsed.o >= 0) return parsed.o;
  } catch {
    // Falls through: a cursor this service did not issue is a malformed request.
  }
  throw new HttpError(400, ERROR_CODES.VALIDATION_FAILED, 'The cursor is not one this history issued.');
}

export interface ProjectHistoryServiceDeps {
  access: Pick<ProjectAccess, 'loadVisible'>;
  /** The kernel's audit port — a platform service. */
  auditLog: Pick<AuditPort, 'query'>;
  /** `admin_users`' read port — lazy, resolved per call. */
  adminUsers: AdminUserReadPort;
  references: Pick<ProjectReferenceService, 'resolveMany'>;
  /** Whether the reader holds `custom_fields:read`. */
  mayReadCustomFields: () => Promise<boolean>;
}

/**
 * `GET /projects/:id/history` (FR-028; `contracts/admin-api.md` §2.4) — **the
 * audit log is the history**: every write about a Project is a Command recorded
 * against `project` and its id, in the transaction of the write.
 *
 * The Project is loaded through `ProjectAccess` first — invisible, out of reach
 * and missing are the same 404 — and only then are the entries of that id read.
 * Served to `projects:read`, not `audit_log:read`. Newest first, cursor-paged,
 * reaching back {@link PROJECT_HISTORY_REACH} entries; the last page says when
 * it was cut. What the tokens of an audited text name is resolved for the
 * reader (no Project Command audits a text today — notes and messages are
 * recorded by length — so this is the standard, ready); custom-field values
 * are served only to a reader holding `custom_fields:read`.
 */
export class ProjectHistoryService {
  constructor(private readonly deps: ProjectHistoryServiceDeps) {}

  async list(projectId: string, query: RecordHistoryQuery): Promise<RecordHistoryPage> {
    const offset = decodeHistoryCursor(query.cursor);
    const project = await this.deps.access.loadVisible(projectId);

    const read = await this.deps.auditLog.query({
      objectType: PROJECT_AUDIT_OBJECT_TYPE,
      objectId: project.id,
      limit: Math.min(offset + query.limit + 1, AUDIT_QUERY_CAP),
    });
    const entries = read.slice(0, PROJECT_HISTORY_REACH);
    const page = entries.slice(offset, offset + query.limit);
    const hasMore = entries.length > offset + query.limit;
    const truncated = !hasMore && read.length > PROJECT_HISTORY_REACH;

    const actorIds = [
      ...new Set(page.map((entry) => entry.actorAdminUserId).filter((id): id is string => Boolean(id))),
    ];
    const actors = actorIds.length > 0 ? await this.deps.adminUsers.findByIds(actorIds) : [];
    const names = new Map(
      actors.map((admin) => [admin.id, `${admin.firstName} ${admin.lastName}`.trim() || admin.email]),
    );

    const texts = page.map((entry) =>
      [...auditedTexts(entry.stateBefore), ...auditedTexts(entry.stateAfter)].join('\n'),
    );
    const resolved = await this.deps.references.resolveMany(texts);
    const referencesOf = (index: number): RecordReference[] => resolved[index] ?? [];
    const mayReadCustomFields = page.length > 0 ? await this.deps.mayReadCustomFields() : true;

    return {
      data: page.map((entry, index) => {
        const actorId = entry.actorAdminUserId ?? null;
        return {
          id: entry.id,
          actedAt: entry.actedAt.toISOString(),
          action: entry.action,
          actor:
            actorId === null
              ? { kind: 'system', id: null, name: null }
              : { kind: 'admin', id: actorId, name: names.get(actorId) ?? null },
          before: visibleAuditState(entry.stateBefore ?? null, mayReadCustomFields),
          after: visibleAuditState(entry.stateAfter ?? null, mayReadCustomFields),
          references: referencesOf(index),
        };
      }),
      pagination: {
        cursor: hasMore ? encodeHistoryCursor(offset + query.limit) : null,
        hasMore,
        limit: query.limit,
      },
      truncated,
    };
  }
}
