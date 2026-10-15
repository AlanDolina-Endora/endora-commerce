// `apiClient` comes through the kit's published `lib` barrel, as `ProductPicker.tsx`
// does: `vi.mock` keys on a resolved module id, and the barrel is the only spelling
// an admin test outside this package can name.
import { apiClient } from '../../lib/index.js';
import type { ProductBrowserItem, ProductBrowserType } from './types.js';

export type ProductBrowserStatusFilter = 'all' | 'active' | 'draft' | 'inactive';

export interface ProductBrowserQuery {
  /** Zero-based. */
  page: number;
  pageSize: number;
  status: ProductBrowserStatusFilter;
  type: ProductBrowserType | null;
  q: string;
}

export interface ProductBrowserCounts {
  all: number;
  active: number;
  draft: number;
  inactive: number;
}

export interface ProductBrowserPage {
  rows: ProductBrowserItem[];
  total: number;
  counts: ProductBrowserCounts;
}

interface AdminProductListResponse {
  data: Array<ProductBrowserItem & Record<string, unknown>>;
  pagination: { page: number; pageSize: number; total: number };
  counts: ProductBrowserCounts;
}

const PRODUCTS_PATH = '/api/v1/admin/catalog/products';

/**
 * The list request, in the order contract B1 fixes:
 * `includeArchived=1&page&pageSize[&status][&type][&q]`. `includeArchived` is always
 * sent so the Inactive tab is reachable on every host, as on the Products list.
 */
export function buildProductBrowserPath(query: ProductBrowserQuery): string {
  const params = new URLSearchParams();
  params.set('includeArchived', '1');
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  if (query.status !== 'all') params.set('status', query.status);
  if (query.type !== null) params.set('type', query.type);
  const trimmed = query.q.trim();
  if (trimmed.length > 0) params.set('q', trimmed);
  return `${PRODUCTS_PATH}?${params.toString()}`;
}

/** One page of the list, projected onto `ProductBrowserItem`. */
export async function fetchProductBrowserPage(query: ProductBrowserQuery): Promise<ProductBrowserPage> {
  const res = await apiClient.get<AdminProductListResponse>(buildProductBrowserPath(query));
  return {
    rows: res.data.map((p) => ({
      id: p.id,
      sku: p.sku,
      slug: p.slug,
      name: p.name,
      status: p.status,
      type: p.type,
    })),
    total: res.pagination.total,
    counts: res.counts,
  };
}
