import { apiClient } from '@endora-commerce/admin-kit/lib';
import type {
  CloseProjectBody,
  CreateProjectBody,
  CreateProjectRoleBody,
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
  ProjectTasksResponse,
  ProjectTemplateBody,
  ProjectTemplateDetail,
  ProjectTemplateSummary,
  MaterializeStageTasksResult,
  SetProjectMovesResult,
  StageTaskDefinition,
  TaskSummary,
  UpdateProjectRoleBody,
  UpdateProjectStageBody,
} from '@endora-commerce/contracts';

/**
 * The HTTP calls of the Projects admin screens
 * (`specs/163-projects-and-tasks/contracts/admin-api.md` §2.1, §2.2, §2.5 — Templates included).
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

/**
 * The Tasks module's own create route. A Project's Task is created there, not
 * through a Projects route: it names the Project and one of its Stages as its
 * context, and the Tasks module asks this one whether the caller may see them.
 */
const TASKS_BASE = '/api/v1/admin/tasks';

export type ProjectSort = 'createdAt' | 'value' | 'deadline';

/** The two configuration dictionaries, by their path segment. Both have one shape (`ProjectRole`). */
export type ProjectDictionaryKind = 'roles' | 'loss-reasons';

export interface ProjectListParams {
  q?: string;
  state?: readonly ProjectState[];
  organizationId?: string;
  /** An administrator's id, or `me`. */
  memberId?: string;
  /** Projects in which some Member holds this Project Role. */
  roleId?: string;
  /** Projects created from this Template. */
  templateId?: string;
  /** The current Stage's name, case-insensitive. */
  stageName?: string;
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
  if (params.roleId) qs.set('roleId', params.roleId);
  if (params.templateId) qs.set('templateId', params.templateId);
  if (params.stageName) qs.set('stageName', params.stageName);
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

  /** 409 `PROJECT_HAS_LINKS` while records are linked; the Project's Tasks go with it. */
  deleteProject(id: string): Promise<void> {
    return apiClient.delete<void>(`${BASE}/${id}`);
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

  /** The Tasks a Stage creates on entry, the whole list replaced; answers the Stage. */
  setStageTasks(projectId: string, stageId: string, tasks: readonly StageTaskDefinition[]): Promise<ProjectStage> {
    return data(apiClient.put<{ data: ProjectStage }>(`${BASE}/${projectId}/stages/${stageId}/tasks`, { tasks }));
  },

  /**
   * Create a Stage's Tasks again after creating them failed on entry
   * (`tasksMaterializeFailed`); 409 `PROJECT_STAGE_TASKS_NOT_RETRYABLE` otherwise.
   */
  retryStageTasks(projectId: string, stageId: string): Promise<MaterializeStageTasksResult> {
    return data(
      apiClient.post<{ data: MaterializeStageTasksResult }>(`${BASE}/${projectId}/stages/${stageId}/materialize-tasks`),
    );
  },

  /** The Project's Tasks by Stage; `tasksAvailable: false` while Tasks is off or unreadable for the caller. */
  projectTasks(projectId: string): Promise<ProjectTasksResponse> {
    return data(apiClient.get<{ data: ProjectTasksResponse }>(`${BASE}/${projectId}/tasks`));
  },

  /** A new Task in one of the Project's Stages. */
  addStageTask(projectId: string, stageId: string, title: string): Promise<TaskSummary> {
    return data(
      apiClient.post<{ data: TaskSummary }>(TASKS_BASE, {
        title,
        context: { contextType: 'project', contextId: projectId, contextGroupId: stageId },
      }),
    );
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

  // --- §2.5 Project Roles and loss reasons — writes (User Story 4) -----------

  /** `kind` is the dictionary's path segment; every write is `projects:configure`. */
  createDictionaryEntry(kind: ProjectDictionaryKind, body: CreateProjectRoleBody): Promise<ProjectRole> {
    return data(apiClient.post<{ data: ProjectRole }>(`${BASE}/${kind}`, body));
  },

  updateDictionaryEntry(kind: ProjectDictionaryKind, id: string, body: UpdateProjectRoleBody): Promise<ProjectRole> {
    return data(apiClient.patch<{ data: ProjectRole }>(`${BASE}/${kind}/${id}`, body));
  },

  archiveDictionaryEntry(kind: ProjectDictionaryKind, id: string): Promise<ProjectRole> {
    return data(apiClient.post<{ data: ProjectRole }>(`${BASE}/${kind}/${id}/archive`));
  },

  restoreDictionaryEntry(kind: ProjectDictionaryKind, id: string): Promise<ProjectRole> {
    return data(apiClient.post<{ data: ProjectRole }>(`${BASE}/${kind}/${id}/restore`));
  },

  /** 409 for a built-in row or one a Project or Template uses. */
  deleteDictionaryEntry(kind: ProjectDictionaryKind, id: string): Promise<void> {
    return apiClient.delete<void>(`${BASE}/${kind}/${id}`);
  },

  // --- §2.5 Templates (User Story 3) -----------------------------------------

  /** `active` leaves archived Templates out — what the create screen offers. */
  listTemplates(options: { active?: boolean } = {}): Promise<ProjectTemplateSummary[]> {
    return data(
      apiClient.get<{ data: ProjectTemplateSummary[] }>(`${BASE}/templates${options.active ? '?active=true' : ''}`),
    );
  },

  getTemplate(id: string): Promise<ProjectTemplateDetail> {
    return data(apiClient.get<{ data: ProjectTemplateDetail }>(`${BASE}/templates/${id}`));
  },

  createTemplate(body: ProjectTemplateBody): Promise<ProjectTemplateDetail> {
    return data(apiClient.post<{ data: ProjectTemplateDetail }>(`${BASE}/templates`, body));
  },

  /** The whole Template replaced in one request. */
  saveTemplate(id: string, body: ProjectTemplateBody): Promise<ProjectTemplateDetail> {
    return data(apiClient.put<{ data: ProjectTemplateDetail }>(`${BASE}/templates/${id}`, body));
  },

  duplicateTemplate(id: string): Promise<ProjectTemplateDetail> {
    return data(apiClient.post<{ data: ProjectTemplateDetail }>(`${BASE}/templates/${id}/duplicate`));
  },

  archiveTemplate(id: string): Promise<ProjectTemplateDetail> {
    return data(apiClient.post<{ data: ProjectTemplateDetail }>(`${BASE}/templates/${id}/archive`));
  },

  restoreTemplate(id: string): Promise<ProjectTemplateDetail> {
    return data(apiClient.post<{ data: ProjectTemplateDetail }>(`${BASE}/templates/${id}/restore`));
  },
};
