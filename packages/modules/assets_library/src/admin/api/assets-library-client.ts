// Typed admin client for the Assets Library — feature 013 / US1.
//
// Wraps the shared `apiClient` with strong response types inferred from
// `@endora-commerce/contracts/assets-library`. Components consume this rather than
// touching `apiClient` directly.

import { ApiError, apiBaseUrl, apiClient } from '@endora-commerce/admin-kit/lib';
import type {
  AssetDetail,
  AssetFolder,
  AssetSummary,
  CreateFolderRequest,
  DeleteFolderRequest,
  ListAssetsResponse,
  ListFoldersResponse,
  PatchAssetRequest,
  PatchFolderRequest,
  RestorePreviousAssetVersionRequest,
  StorageStateResponse,
} from '@endora-commerce/contracts';

export type { AssetSummary, AssetDetail, AssetFolder };

export const assetsLibraryClient = {
  async listAssets(query: {
    folderId?: string | null;
    q?: string;
    mime?: string;
    visibility?: 'public' | 'private';
    cursor?: string;
    limit?: number;
  }): Promise<ListAssetsResponse> {
    const params = new URLSearchParams();
    if (query.folderId !== undefined && query.folderId !== null) {
      params.set('folderId', query.folderId);
    }
    if (query.q) params.set('q', query.q);
    if (query.mime) params.set('mime', query.mime);
    if (query.visibility) params.set('visibility', query.visibility);
    if (query.cursor) params.set('cursor', query.cursor);
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    const qs = params.toString();
    return apiClient.get<ListAssetsResponse>(
      `/api/v1/admin/assets${qs ? `?${qs}` : ''}`,
    );
  },

  async getAsset(id: string): Promise<AssetDetail> {
    const out = await apiClient.get<{ data: AssetDetail }>(
      `/api/v1/admin/assets/${id}`,
    );
    return out.data;
  },

  async getAssetUrl(id: string): Promise<{ url: string; expiresAt: string | null }> {
    const out = await apiClient.get<{ data: { url: string; expiresAt: string | null } }>(
      `/api/v1/admin/assets/${id}/url`,
    );
    return out.data;
  },

  async patchAsset(id: string, patch: PatchAssetRequest): Promise<AssetDetail> {
    const out = await apiClient.patch<{ data: AssetDetail }>(
      `/api/v1/admin/assets/${id}`,
      patch,
    );
    return out.data;
  },

  async softDeleteAsset(id: string): Promise<void> {
    await apiClient.delete(`/api/v1/admin/assets/${id}`);
  },

  async restoreAsset(id: string): Promise<AssetDetail> {
    const out = await apiClient.post<{ data: AssetDetail }>(
      `/api/v1/admin/assets/${id}/restore`,
      {},
    );
    return out.data;
  },

  async moveAsset(id: string, folderId: string | null): Promise<AssetDetail> {
    const out = await apiClient.post<{ data: AssetDetail }>(
      `/api/v1/admin/assets/${id}/move`,
      { folderId },
    );
    return out.data;
  },

  // — Stable URLs: replace, previous version, permalink (feature 156) ------

  /**
   * Replace the file in place. Multipart, so it goes through `fetch` over the
   * published origin as the kit's upload does; `expectedContentVersion` is sent
   * before the file part. A refusal is thrown as the kit's `ApiError`, so the
   * drawer reads its code and details as it does for every other request.
   */
  async replaceAsset(id: string, file: File, expectedContentVersion: string): Promise<AssetDetail> {
    const fd = new FormData();
    fd.append('expectedContentVersion', expectedContentVersion);
    fd.append('file', file, file.name);
    const r = await fetch(`${apiBaseUrl.replace(/\/+$/, '')}/api/v1/admin/assets/${id}/replace`, {
      method: 'POST',
      credentials: 'include',
      body: fd,
    });
    if (!r.ok) {
      const text = await r.text();
      let envelope: unknown = null;
      try {
        envelope = JSON.parse(text);
      } catch {
        envelope = null;
      }
      if (envelope && typeof envelope === 'object' && 'error' in envelope) {
        throw new ApiError(r.status, envelope as ConstructorParameters<typeof ApiError>[1]);
      }
      throw new Error(`Replace failed (${r.status}): ${text}`);
    }
    return ((await r.json()) as { data: AssetDetail }).data;
  },

  async restorePreviousVersion(
    id: string,
    versions: RestorePreviousAssetVersionRequest,
  ): Promise<AssetDetail> {
    const out = await apiClient.post<{ data: AssetDetail }>(
      `/api/v1/admin/assets/${id}/previous-version/restore`,
      versions,
    );
    return out.data;
  },

  async setPermalink(
    id: string,
    permalink: string,
    options?: { confirmReuse?: boolean },
  ): Promise<AssetDetail> {
    const out = await apiClient.put<{ data: AssetDetail }>(`/api/v1/admin/assets/${id}/permalink`, {
      permalink,
      ...(options?.confirmReuse ? { confirmReuse: true } : {}),
    });
    return out.data;
  },

  async removePermalink(id: string): Promise<AssetDetail> {
    const out = await apiClient.delete<{ data: AssetDetail }>(`/api/v1/admin/assets/${id}/permalink`);
    return out.data;
  },

  /** How long a replaced file stays restorable, as the retention sweep reads it. */
  async getRetentionDays(): Promise<number> {
    const out = await apiClient.get<StorageStateResponse>('/api/v1/admin/assets/storage/state');
    return out.data.retentionDays;
  },

  // — Folders --------------------------------------------------------------

  async listFolders(): Promise<AssetFolder[]> {
    const out = await apiClient.get<ListFoldersResponse>(
      '/api/v1/admin/assets/folders',
    );
    return out.data;
  },

  async createFolder(req: CreateFolderRequest): Promise<AssetFolder> {
    const out = await apiClient.post<{ data: AssetFolder }>(
      '/api/v1/admin/assets/folders',
      req,
    );
    return out.data;
  },

  async patchFolder(id: string, req: PatchFolderRequest): Promise<AssetFolder> {
    const out = await apiClient.patch<{ data: AssetFolder }>(
      `/api/v1/admin/assets/folders/${id}`,
      req,
    );
    return out.data;
  },

  async deleteFolder(
    id: string,
    req: DeleteFolderRequest,
  ): Promise<{ deletedFolderId: string; softDeletedAssetIds?: string[] }> {
    const out = await apiClient.delete<{
      data: { deletedFolderId: string; softDeletedAssetIds?: string[] };
    }>(`/api/v1/admin/assets/folders/${id}`, {
      body: JSON.stringify(req),
      headers: { 'content-type': 'application/json' },
    });
    return out.data;
  },
};
