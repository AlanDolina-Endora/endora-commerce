import type {
  PriceMatrixAttributeTarget,
  PriceMatrixEntry,
  PriceMatrixEntryInput,
  PriceMatrixEntryPatch,
  PriceMatrixListResponse,
  PriceMatrixSelectionKind,
} from '@endora-commerce/contracts';
import { apiClient } from '@endora-commerce/admin-kit/lib';

/**
 * Typed calls for the *Price matrix* tab (feature 148,
 * `contracts/admin-price-matrix-api.md`). `lang` is the admin's language; the
 * server uses it only to pick display labels.
 */

const base = (priceListId: string): string =>
  `/api/v1/admin/price-lists-engine/${encodeURIComponent(priceListId)}/matrix`;

export interface MatrixListFilter {
  page: number;
  pageSize: number;
  selectionKind?: PriceMatrixSelectionKind | undefined;
  /** A uuid, `'none'` for not organization-specific, or absent for all. */
  organizationId?: string | undefined;
}

export async function listMatrixEntries(
  priceListId: string,
  filter: MatrixListFilter,
  lang: string | null,
): Promise<PriceMatrixListResponse['data']> {
  const query = new URLSearchParams({ page: String(filter.page), pageSize: String(filter.pageSize) });
  if (filter.selectionKind) query.set('selectionKind', filter.selectionKind);
  if (filter.organizationId) query.set('organizationId', filter.organizationId);
  if (lang) query.set('lang', lang);
  const res = await apiClient.get<PriceMatrixListResponse>(`${base(priceListId)}?${query.toString()}`);
  return res.data;
}

export async function createMatrixEntry(
  priceListId: string,
  body: PriceMatrixEntryInput,
): Promise<PriceMatrixEntry> {
  const res = await apiClient.post<{ data: PriceMatrixEntry }>(base(priceListId), body);
  return res.data;
}

export async function updateMatrixEntry(
  priceListId: string,
  entryId: string,
  patch: PriceMatrixEntryPatch,
): Promise<PriceMatrixEntry> {
  const res = await apiClient.patch<{ data: PriceMatrixEntry }>(
    `${base(priceListId)}/${encodeURIComponent(entryId)}`,
    patch,
  );
  return res.data;
}

export async function deleteMatrixEntry(priceListId: string, entryId: string): Promise<void> {
  await apiClient.delete(`${base(priceListId)}/${encodeURIComponent(entryId)}`);
}

export async function listMatrixAttributes(lang: string | null): Promise<PriceMatrixAttributeTarget[]> {
  const query = lang ? `?lang=${encodeURIComponent(lang)}` : '';
  const res = await apiClient.get<{ data: { items: PriceMatrixAttributeTarget[] } }>(
    `/api/v1/admin/pricing/rule-targets/attributes${query}`,
  );
  return res.data.items;
}

export interface RuleTargetCategory {
  id: string;
  slug: string;
  name: Record<string, string>;
  parentCategoryId: string | null;
  sortOrder: number;
}

export async function listRuleTargetCategories(): Promise<RuleTargetCategory[]> {
  const res = await apiClient.get<{ data: { items: RuleTargetCategory[] } }>(
    '/api/v1/admin/pricing/rule-targets/categories',
  );
  return res.data.items;
}

export interface RuleTargetOrganization {
  id: string;
  name: string;
  taxId: string;
}

export async function searchRuleTargetOrganizations(search: string): Promise<RuleTargetOrganization[]> {
  const query = new URLSearchParams({ limit: '50' });
  if (search.trim()) query.set('search', search.trim());
  const res = await apiClient.get<{ data: { items: RuleTargetOrganization[] } }>(
    `/api/v1/admin/pricing/rule-targets/organizations?${query.toString()}`,
  );
  return res.data.items;
}

export async function listRuleTargetCurrencies(): Promise<string[]> {
  const res = await apiClient.get<{ data: { items: Array<{ code: string }> } }>(
    '/api/v1/admin/pricing/rule-targets/currencies',
  );
  return res.data.items.map((c) => c.code);
}
