import { apiClient } from '@endora-commerce/admin-kit/lib';

/**
 * Resolve the names of a price list's roster products (feature 145, R-9).
 *
 * `POST /api/v1/admin/catalog/products/batch-by-id` caps one request at 500 ids,
 * so the roster is cut into chunks of {@link ROSTER_NAMES_CHUNK}, each asked for
 * as `page: 0, pageSize: 500` (one page holds the whole chunk), and at most
 * {@link ROSTER_NAMES_CONCURRENCY} requests are in flight at a time. The answers
 * are merged into one map. An id the lookup does not return — or whose chunk
 * failed — stays absent, so the caller falls back to the id prefix for it.
 */

export const ROSTER_NAMES_CHUNK = 500;
export const ROSTER_NAMES_CONCURRENCY = 2;

const BATCH_BY_ID_PATH = '/api/v1/admin/catalog/products/batch-by-id';

export interface RosterProductSummary {
  id: string;
  sku: string;
  name: Record<string, string>;
}

export type RosterNamesPost = (
  path: string,
  body: { ids: string[]; page: number; pageSize: number },
) => Promise<{ data: RosterProductSummary[] }>;

const defaultPost: RosterNamesPost = (path, body) =>
  apiClient.post<{ data: RosterProductSummary[] }>(path, body);

export async function fetchRosterProductNames(
  ids: readonly string[],
  post: RosterNamesPost = defaultPost,
): Promise<Map<string, RosterProductSummary>> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ROSTER_NAMES_CHUNK) {
    chunks.push(ids.slice(i, i + ROSTER_NAMES_CHUNK));
  }
  const result = new Map<string, RosterProductSummary>();
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < chunks.length) {
      const chunk = chunks[next]!;
      next += 1;
      try {
        const res = await post(BATCH_BY_ID_PATH, {
          ids: chunk,
          page: 0,
          pageSize: ROSTER_NAMES_CHUNK,
        });
        for (const p of res.data) result.set(p.id, p);
      } catch {
        // The chunk's ids stay absent: the roster shows their id prefix.
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(ROSTER_NAMES_CONCURRENCY, chunks.length) }, () => worker()),
  );
  return result;
}
