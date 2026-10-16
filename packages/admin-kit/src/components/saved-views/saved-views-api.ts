import type {
  SavedListView,
  SavedListViewDeleteResponse,
  SavedListViewListResponse,
  SavedListViewResponse,
} from '@endora-commerce/contracts';
// Through the kit's `lib` barrel rather than `../../lib/api-client.js`: the
// barrel is the one spelling a test outside the package can replace.
import { ApiError, apiClient } from '../../lib/index.js';
import type { SavedViewState } from './SavedViewsControl.js';

/**
 * The three saved-view requests the kit's control makes (feature 147,
 * `specs/147-saved-views/contracts/saved-list-views-api.md` §2). The endpoint
 * is the caller's — a list page knows its own URL; the kit knows none
 * (research R-3). There is deliberately no update request: the UI neither
 * renames nor re-shares a view (FR-008).
 */

export interface SavedViewCreateBody extends SavedViewState {
  name: string;
  shared: boolean;
}

export async function listSavedViews(endpoint: string): Promise<SavedListView[]> {
  const response = await apiClient.get<SavedListViewListResponse>(endpoint);
  return response.data;
}

export async function createSavedView(endpoint: string, body: SavedViewCreateBody): Promise<SavedListView> {
  const response = await apiClient.post<SavedListViewResponse>(endpoint, body);
  return response.data;
}

export async function deleteSavedView(endpoint: string, id: string): Promise<void> {
  await apiClient.delete<SavedListViewDeleteResponse>(`${endpoint}/${encodeURIComponent(id)}`);
}

/** The server's translated sentence when there is one, else the caller's fallback. */
export function requestErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.envelope.error.message : fallback;
}

export function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

/**
 * A 409 on create: the name is taken (a race the client check could not see).
 * By status, not code — each list mints its own `*_SAVED_VIEW_NAME_TAKEN`.
 */
export function isConflict(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409;
}
