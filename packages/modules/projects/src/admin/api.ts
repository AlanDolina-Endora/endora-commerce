import { apiClient } from '@endora-commerce/admin-kit/lib';
import type {
  CloseProjectBody,
  CreateProjectBody,
  CreateProjectStageBody,
  ProjectDetail,
  ProjectListResponse,
  ProjectLossReason,
  ProjectMoveResult,
  ProjectRole,
  ProjectStage,
  ProjectStageEntry,
  ProjectStageMove,
  ProjectState,
  SetProjectMovesResult,
  UpdateProjectStageBody,
} from '@endora-commerce/contracts';

/**
 * The HTTP calls of the Projects admin screens
 * (`specs/163-projects-and-tasks/contracts/admin-api.md` §2.1, §2.2, §2.5).
 *
 * Every shape is `@endora-commerce/contracts`' — the schemas the backend
 * validates with — so a screen and a route cannot disagree about a field
 * without one of them failing to compile. Successful answers are `{ data }`
 * envelopes, except the list, which answers `{ items, nextCursor, total }`.
 *
 * Every write that changes where a Project is — a move, a close, a reopen —
 * names the `version` it was read at; the server answers 409 `PROJECT_CHANGED`
 * when somebody else changed the Project in between, and nothing is written.
 */

const BASE = '/api/v1/admin/projects';

export type ProjectSort = 'createdAt' | 'value' | 'deadline';

export interface ProjectListParams {
  q?: string;
  state?: readonly ProjectState[];
  organizationId?: string;
  /** An administrator's id, or `me`. */
  memberId?: string;
  sort?: ProjectSort;
  order?: 'asc' | 'desc';
  cursor?: string;
  limit?: number;
}

function listQuery(params: ProjectListParams): string {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  for (const state of params.state ?? []) qs.append('state', state);
  if (params.organizationId) qs.set('organizationId', params.organizationId);
  if (params.memberId) qs.set('memberId', params.memberId);
  if (params.sort) qs.set('sort', params.sort);
  if (params.order) qs.set('order', params.order);
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.limit) qs.set('limit', String(params.limit));
  const tail = qs.toString();
  return tail ? `?${tail}` : '';
}

function data<T>(promise: Promise<{ data: T }>): Promise<T> {
  return promise.then((envelope) => envelope.data);
}

export const projectsApi = {
  // --- §2.1 Projects -------------------------------------------------------

  listProjects(params: ProjectListParams = {}): Promise<ProjectListResponse> {
    return apiClient.get<ProjectListResponse>(`${BASE}${listQuery(params)}`);
  },

  getProject(id: string): Promise<ProjectDetail> {
    return data(apiClient.get<{ data: ProjectDetail }>(`${BASE}/${id}`));
  },

  createProject(body: CreateProjectBody): Promise<ProjectDetail> {
    return data(apiClient.post<{ data: ProjectDetail }>(BASE, body));
  },

  // --- §2.2 Stages and moves -----------------------------------------------

  createStage(projectId: string, body: CreateProjectStageBody): Promise<ProjectStage> {
    return data(apiClient.post<{ data: ProjectStage }>(`${BASE}/${projectId}/stages`, body));
  },

  updateStage(projectId: string, stageId: string, body: UpdateProjectStageBody): Promise<ProjectStage> {
    return data(apiClient.patch<{ data: ProjectStage }>(`${BASE}/${projectId}/stages/${stageId}`, body));
  },

  deleteStage(projectId: string, stageId: string): Promise<void> {
    return apiClient.delete<void>(`${BASE}/${projectId}/stages/${stageId}`);
  },

  /** Every Stage id of the Project, in the new order; answers the Project. */
  reorderStages(projectId: string, stageIds: readonly string[]): Promise<ProjectDetail> {
    return data(apiClient.put<{ data: ProjectDetail }>(`${BASE}/${projectId}/stages/order`, { stageIds }));
  },

  /** The whole workflow, replaced. */
  setMoves(projectId: string, moves: readonly ProjectStageMove[]): Promise<SetProjectMovesResult> {
    return data(apiClient.put<{ data: SetProjectMovesResult }>(`${BASE}/${projectId}/moves`, { moves }));
  },

  move(projectId: string, toStageId: string, version: number): Promise<ProjectMoveResult> {
    return data(apiClient.post<{ data: ProjectMoveResult }>(`${BASE}/${projectId}/move`, { toStageId, version }));
  },

  close(projectId: string, body: CloseProjectBody): Promise<ProjectDetail> {
    return data(apiClient.post<{ data: ProjectDetail }>(`${BASE}/${projectId}/close`, body));
  },

  reopen(projectId: string, version: number): Promise<ProjectDetail> {
    return data(apiClient.post<{ data: ProjectDetail }>(`${BASE}/${projectId}/reopen`, { version }));
  },

  stageHistory(projectId: string): Promise<ProjectStageEntry[]> {
    return data(apiClient.get<{ data: ProjectStageEntry[] }>(`${BASE}/${projectId}/stage-history`));
  },

  // --- §2.5 Configuration (reads) ------------------------------------------

  /**
   * The Project Roles, each with a `label` in the reader's language. `active`
   * leaves archived Roles out — what a picker offers; a Project's screen asks
   * for all of them, because it still shows the ones it uses.
   */
  listRoles(options: { active?: boolean } = {}): Promise<ProjectRole[]> {
    return data(apiClient.get<{ data: ProjectRole[] }>(`${BASE}/roles${options.active ? '?active=true' : ''}`));
  },

  listLossReasons(options: { active?: boolean } = {}): Promise<ProjectLossReason[]> {
    return data(
      apiClient.get<{ data: ProjectLossReason[] }>(`${BASE}/loss-reasons${options.active ? '?active=true' : ''}`),
    );
  },
};
