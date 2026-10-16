import {
  AdminSearchCapabilitySchema,
  AdminSearchConfigurationViewSchema,
  AdminSearchResponseSchema,
  type AdminSearchCapability,
  type AdminSearchConfigurationView,
  type AdminSearchResponse,
  type SupportedAdminLanguage,
  type UpdateAdminSearchConfigurationRequest,
} from '@endora-commerce/contracts';
import { apiClient } from '@endora-commerce/admin-kit/lib';

/**
 * `admin_search`'s screens' reads and writes (`specs/150-admin-global-search/`
 * contracts/admin-search-api.md), every answer parsed with the contract it
 * was sent under.
 */
const BASE = '/api/v1/admin/global-search';

export async function getConfiguration(language: SupportedAdminLanguage): Promise<AdminSearchConfigurationView> {
  const res = await apiClient.get<{ data: unknown }>(`${BASE}/configuration?language=${encodeURIComponent(language)}`);
  return AdminSearchConfigurationViewSchema.parse(res.data);
}

export async function putConfiguration(
  language: SupportedAdminLanguage,
  request: UpdateAdminSearchConfigurationRequest,
): Promise<AdminSearchConfigurationView> {
  const res = await apiClient.put<{ data: unknown }>(
    `${BASE}/configuration?language=${encodeURIComponent(language)}`,
    request,
  );
  return AdminSearchConfigurationViewSchema.parse(res.data);
}

export async function getCapability(language: SupportedAdminLanguage): Promise<AdminSearchCapability> {
  const res = await apiClient.get<{ data: unknown }>(`${BASE}/capability?language=${encodeURIComponent(language)}`);
  return AdminSearchCapabilitySchema.parse(res.data);
}

export async function searchRecords(
  query: { q: string; language: SupportedAdminLanguage; limit: number; entityType?: string | null },
  signal?: AbortSignal,
): Promise<AdminSearchResponse> {
  const params = new URLSearchParams({ q: query.q, language: query.language, limit: String(query.limit) });
  if (query.entityType) params.set('entityTypes', query.entityType);
  const res = await apiClient.get<unknown>(`${BASE}?${params.toString()}`, signal ? { signal } : {});
  return AdminSearchResponseSchema.parse(res);
}
