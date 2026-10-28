import { apiClient } from '@endora-commerce/admin-kit/lib';
import type {
  CreateTaskBody,
  CreateTaskStatusBody,
  SetTaskTransitionsBody,
  UpdateTaskStatusBody,
  RecordDocumentLookupResponse,
  RecordHistoryPage,
  TaskAssigneeOption,
  TaskAttachment,
  TaskBoard,
  TaskBoardCardConfig,
  TaskComment,
  TaskContextOption,
  TaskDeleteResult,
  TaskDetail,
  TaskLink,
  TaskLinkKind,
  TaskListResponse,
  TaskLookupOption,
  TaskPriorityConfig,
  TaskStatusChangeResult,
  TaskSummary,
  TaskTag,
  TaskWorkflow,
  UpdateTaskBody,
} from '@endora-commerce/contracts';

/**
 * The HTTP calls of the Tasks admin screens
 * (`specs/165-task-management/contracts/admin-api.md` §1, §4).
 *
 * Every shape is `@endora-commerce/contracts`' — the schemas the backend
 * validates with. Single records are `{ data }` envelopes; the list answers
 * `{ items, nextCursor }` and knows no total; the history is the shared
 * `RecordHistoryPage`.
 */

const BASE = '/api/v1/admin/tasks';
/** `catalog`'s own list — what `@@@` searches, offered to a holder of `catalog:read`. */
const PRODUCTS_BASE = '/api/v1/admin/catalog/products';

/** A Product as the `@@@` list offers it. */
export interface MentionableProduct {
  id: string;
  sku: string;
  name: Record<string, string>;
}

export interface TaskListParams {
  q?: string;
  /** Workflow status codes, any of. */
  status?: readonly string[];
  /** An administrator's id, `me` or `none`. */
  assignee?: string;
  overdue?: boolean;
  cursor?: string;
  limit?: number;
}

function listQuery(params: TaskListParams): string {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  for (const status of params.status ?? []) qs.append('status', status);
  if (params.assignee) qs.set('assignee', params.assignee);
  if (params.overdue) qs.set('overdue', 'true');
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.limit) qs.set('limit', String(params.limit));
  const tail = qs.toString();
  return tail ? `?${tail}` : '';
}

function data<T>(promise: Promise<{ data: T }>): Promise<T> {
  return promise.then((envelope) => envelope.data);
}

/** `?…` for a non-empty query, nothing for an empty one. */
function tail(query: URLSearchParams): string {
  const text = query.toString();
  return text ? `?${text}` : '';
}

export const tasksApi = {
  listTasks(params: TaskListParams = {}): Promise<TaskListResponse> {
    return apiClient.get<TaskListResponse>(`${BASE}${listQuery(params)}`);
  },

  /** `GET /tasks` with a query the screen built from its address (`lib/task-filters.ts`). */
  listTasksBy(query: URLSearchParams): Promise<TaskListResponse> {
    return apiClient.get<TaskListResponse>(`${BASE}${tail(query)}`);
  },

  /** The caller's open Tasks, by due date, undated last — narrowed by the list's filters. */
  myTasks(query: URLSearchParams = new URLSearchParams()): Promise<TaskSummary[]> {
    return data(apiClient.get<{ data: TaskSummary[] }>(`${BASE}/mine${tail(query)}`));
  },

  /** One column per status, each with its count and first cards (R-11) — `tasks:read`. */
  board(query: URLSearchParams): Promise<TaskBoard> {
    return data(apiClient.get<{ data: TaskBoard }>(`${BASE}/board${tail(query)}`));
  },

  /** What a board card shows, and what it could — `tasks:read`. */
  boardCardFields(): Promise<TaskBoardCardConfig> {
    return data(apiClient.get<{ data: TaskBoardCardConfig }>(`${BASE}/board/card-fields`));
  },

  /** `tasks:configure` — answers the configuration as it stands afterwards. */
  setBoardCardFields(fields: readonly string[]): Promise<TaskBoardCardConfig> {
    return data(apiClient.put<{ data: TaskBoardCardConfig }>(`${BASE}/board/card-fields`, { fields }));
  },

  getTask(id: string): Promise<TaskDetail> {
    return data(apiClient.get<{ data: TaskDetail }>(`${BASE}/${id}`));
  },

  createTask(body: CreateTaskBody): Promise<TaskDetail> {
    return data(apiClient.post<{ data: TaskDetail }>(BASE, body));
  },

  /** Any of the fields, at least one; answers the Task as it is now. A status is not one of them. */
  updateTask(id: string, body: UpdateTaskBody): Promise<TaskDetail> {
    return data(apiClient.patch<{ data: TaskDetail }>(`${BASE}/${id}`, body));
  },

  /** A move through the workflow, from the status the caller saw (409 when the Task left it). */
  changeStatus(id: string, from: string, to: string): Promise<TaskStatusChangeResult> {
    return data(apiClient.post<{ data: TaskStatusChangeResult }>(`${BASE}/${id}/status`, { from, to }));
  },

  /** The configured statuses, in order, and the moves between them — `tasks:read`. */
  workflow(): Promise<TaskWorkflow> {
    return data(apiClient.get<{ data: TaskWorkflow }>(`${BASE}/workflow`));
  },

  /** `tasks:configure` — each answers the whole workflow as it stands afterwards. */
  createStatus(body: CreateTaskStatusBody): Promise<TaskWorkflow> {
    return data(apiClient.post<{ data: TaskWorkflow }>(`${BASE}/statuses`, body));
  },

  updateStatus(code: string, body: UpdateTaskStatusBody): Promise<TaskWorkflow> {
    return data(apiClient.patch<{ data: TaskWorkflow }>(`${BASE}/statuses/${encodeURIComponent(code)}`, body));
  },

  /** Removes a status; `replacement` takes the Tasks in it (required while any are). */
  deleteStatus(code: string, replacement?: string): Promise<TaskWorkflow> {
    const tail = replacement ? `?replacement=${encodeURIComponent(replacement)}` : '';
    return data(apiClient.delete<{ data: TaskWorkflow }>(`${BASE}/statuses/${encodeURIComponent(code)}${tail}`));
  },

  /** A delta of moves: added, removed. */
  setTransitions(body: SetTaskTransitionsBody): Promise<TaskWorkflow> {
    return data(apiClient.put<{ data: TaskWorkflow }>(`${BASE}/transitions`, body));
  },

  /** Deletes a Task; its sub-tasks become top-level, and the answer says how many the caller may see. */
  deleteTask(id: string): Promise<TaskDeleteResult> {
    return data(apiClient.delete<{ data: TaskDeleteResult }>(`${BASE}/${id}`));
  },

  /** Relates two Tasks, shown on both — `tasks:write` on both; nothing changes when they already are. */
  relate(taskId: string, otherId: string): Promise<void> {
    return apiClient.put<void>(`${BASE}/${taskId}/relations/${otherId}`, {});
  },

  /** Removes the link between two related Tasks, from either side. */
  unrelate(taskId: string, otherId: string): Promise<void> {
    return apiClient.delete<void>(`${BASE}/${taskId}/relations/${otherId}`);
  },

  /** Links a record to a Task — `tasks:write` and the record's own read code; answers the link (new or already there). */
  addLink(taskId: string, kind: TaskLinkKind, id: string): Promise<TaskLink> {
    return data(apiClient.post<{ data: TaskLink }>(`${BASE}/${taskId}/links`, { kind, id }));
  },

  /** Removes a link — an unavailable one too. */
  removeLink(taskId: string, linkId: string): Promise<void> {
    return apiClient.delete<void>(`${BASE}/${taskId}/links/${linkId}`);
  },

  /** What a Task may be linked to, of one kind, by number — `tasks:write`; empty for a kind the caller may not link. */
  lookupRecords(kind: TaskLinkKind, query = ''): Promise<TaskLookupOption[]> {
    const qs = new URLSearchParams({ kind });
    if (query.trim()) qs.set('q', query.trim());
    return data(apiClient.get<{ data: TaskLookupOption[] }>(`${BASE}/lookups/records?${qs.toString()}`));
  },

  /** Where a Task may be placed — a record with its groups (a Project with its Stages) — `tasks:write`. */
  lookupContexts(query = ''): Promise<TaskContextOption[]> {
    const tail = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
    return data(apiClient.get<{ data: TaskContextOption[] }>(`${BASE}/lookups/contexts${tail}`));
  },

  /** Active administrators by name or e-mail — `tasks:write`, the assignee picker's source. */
  assignees(q: string): Promise<TaskAssigneeOption[]> {
    const tail = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
    return data(apiClient.get<{ data: TaskAssigneeOption[] }>(`${BASE}/lookups/assignees${tail}`));
  },

  /** The operator's priority list, most urgent first — `tasks:read`. */
  priorities(): Promise<TaskPriorityConfig[]> {
    return data(apiClient.get<{ data: TaskPriorityConfig[] }>(`${BASE}/priorities`));
  },

  /** The tag list, by name — `tasks:read`. A stable function: the kit's tag picker reads it once per mount. */
  listTags(): Promise<TaskTag[]> {
    return data(apiClient.get<{ data: TaskTag[] }>(`${BASE}/tags`));
  },

  /** Who a text of a Task may mention (`taskId` omitted on the create form). */
  lookupMentionable(taskId: string | null, query = ''): Promise<TaskAssigneeOption[]> {
    const qs = new URLSearchParams();
    if (taskId) qs.set('taskId', taskId);
    if (query.trim()) qs.set('q', query.trim());
    const tail = qs.toString();
    return data(apiClient.get<{ data: TaskAssigneeOption[] }>(`${BASE}/lookups/mentionable${tail ? `?${tail}` : ''}`));
  },

  /** The `@@` document list, grouped — `tasks:write`. */
  lookupDocuments(query = ''): Promise<RecordDocumentLookupResponse> {
    const tail = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
    return apiClient.get<RecordDocumentLookupResponse>(`${BASE}/lookups/documents${tail}`);
  },

  /** Products by name or SKU, for `@@@` — `catalog`'s own list, behind `catalog:read`. */
  searchProducts(query: string): Promise<MentionableProduct[]> {
    const qs = new URLSearchParams({ page: '0', pageSize: '20' });
    if (query.trim()) qs.set('q', query.trim());
    return data(apiClient.get<{ data: MentionableProduct[] }>(`${PRODUCTS_BASE}?${qs.toString()}`));
  },

  listAttachments(taskId: string): Promise<TaskAttachment[]> {
    return data(apiClient.get<{ data: TaskAttachment[] }>(`${BASE}/${taskId}/attachments`));
  },

  /** The Task's own upload (multipart) — `tasks:write`; posted by the kit's `uploadAttachment`. */
  attachmentUploadPath(taskId: string): string {
    return `${BASE}/${taskId}/attachments/upload`;
  },

  removeAttachment(taskId: string, attachmentId: string): Promise<void> {
    return apiClient.delete<void>(`${BASE}/${taskId}/attachments/${attachmentId}`);
  },

  /** The comment thread, oldest first, a deleted comment in its place — `tasks:read`. */
  listComments(taskId: string): Promise<TaskComment[]> {
    return data(apiClient.get<{ data: TaskComment[] }>(`${BASE}/${taskId}/comments`));
  },

  /** A new comment — `tasks:read`, on a Task the caller may see. */
  addComment(taskId: string, body: string): Promise<TaskComment> {
    return data(apiClient.post<{ data: TaskComment }>(`${BASE}/${taskId}/comments`, { body }));
  },

  /** Edit a comment — its author only. */
  updateComment(taskId: string, commentId: string, body: string): Promise<TaskComment> {
    return data(apiClient.patch<{ data: TaskComment }>(`${BASE}/${taskId}/comments/${commentId}`, { body }));
  },

  /** Delete a comment — its author only; it stays in the thread, marked. */
  removeComment(taskId: string, commentId: string): Promise<void> {
    return apiClient.delete<void>(`${BASE}/${taskId}/comments/${commentId}`);
  },

  history(id: string, cursor?: string): Promise<RecordHistoryPage> {
    return apiClient.get<RecordHistoryPage>(`${BASE}/${id}/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
  },
};
