import { apiClient } from '@endora-commerce/admin-kit/lib';
import type {
  CreateTaskBody,
  RecordHistoryPage,
  TaskAssigneeOption,
  TaskDetail,
  TaskListResponse,
  TaskStatusChangeResult,
  TaskSummary,
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

export const tasksApi = {
  listTasks(params: TaskListParams = {}): Promise<TaskListResponse> {
    return apiClient.get<TaskListResponse>(`${BASE}${listQuery(params)}`);
  },

  /** The caller's open Tasks, by due date, undated last. */
  myTasks(): Promise<TaskSummary[]> {
    return data(apiClient.get<{ data: TaskSummary[] }>(`${BASE}/mine`));
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

  deleteTask(id: string): Promise<void> {
    return apiClient.delete<void>(`${BASE}/${id}`);
  },

  /** Active administrators by name or e-mail — `tasks:write`, the assignee picker's source. */
  assignees(q: string): Promise<TaskAssigneeOption[]> {
    const tail = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
    return data(apiClient.get<{ data: TaskAssigneeOption[] }>(`${BASE}/lookups/assignees${tail}`));
  },

  history(id: string, cursor?: string): Promise<RecordHistoryPage> {
    return apiClient.get<RecordHistoryPage>(`${BASE}/${id}/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
  },
};
