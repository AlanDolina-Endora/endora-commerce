import { apiClient } from '@endora-commerce/admin-kit/lib';

/**
 * Resolve the names of a price list's roster products (feature 145, R-9).
 *
 * `POST /api/v1/admin/catalog/products/batch-by-id` caps one request at 500 ids,
 * so the roster is cut into chunks of {@link ROSTER_NAMES_CHUNK}, each asked for
 * as `page: 0, pageSize: 500` (one page holds the whole chunk), and at most
 * {@link ROSTER_NAMES_CONCURRENCY} requests are in flight at a time — across every
 * request one resolver serves. The answers are merged into one map. An id the lookup does not return — or whose chunk
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

export interface RosterNameResolverOptions {
  /** Receives each answered chunk's products. Not called after `dispose`. */
  onFound: (found: Map<string, RosterProductSummary>) => void;
  post?: RosterNamesPost | undefined;
}

export interface RosterNameResolver {
  /**
   * Ask for the names of `ids`. An id already asked for — in flight, waiting, or
   * answered — is skipped, so overlapping requests never ask twice; the ids of a
   * chunk that failed may be asked for again by a later request. Resolves once this
   * request's own chunks have settled.
   */
  request: (ids: readonly string[]) => Promise<void>;
  /** Stop: nothing waiting is sent and no answer is delivered. */
  dispose: () => void;
}

interface Chunk {
  ids: string[];
  done: () => void;
}

/**
 * One resolver per roster screen: every request shares the same queue and the
 * same {@link ROSTER_NAMES_CONCURRENCY} request slots, so a roster that changes
 * while names are still loading neither exceeds the cap nor re-asks for ids already
 * asked for, and a request overtaken by a newer one still delivers what it fetched.
 */
export function createRosterNameResolver(options: RosterNameResolverOptions): RosterNameResolver {
  const post = options.post ?? defaultPost;
  const asked = new Set<string>();
  const waiting: Chunk[] = [];
  let inFlight = 0;
  let disposed = false;

  function pump(): void {
    while (!disposed && inFlight < ROSTER_NAMES_CONCURRENCY && waiting.length > 0) {
      const chunk = waiting.shift()!;
      inFlight += 1;
      post(BATCH_BY_ID_PATH, { ids: chunk.ids, page: 0, pageSize: ROSTER_NAMES_CHUNK }).then(
        (res) => {
          if (!disposed) options.onFound(new Map(res.data.map((p) => [p.id, p])));
        },
        () => {
          // The chunk's ids stay absent (the roster shows their id prefix) and may
          // be asked for again.
          for (const id of chunk.ids) asked.delete(id);
        },
      ).finally(() => {
        inFlight -= 1;
        chunk.done();
        pump();
      });
    }
  }

  return {
    request(ids) {
      if (disposed) return Promise.resolve();
      const fresh = ids.filter((id) => !asked.has(id));
      for (const id of fresh) asked.add(id);
      const settled: Promise<void>[] = [];
      for (let i = 0; i < fresh.length; i += ROSTER_NAMES_CHUNK) {
        const chunkIds = fresh.slice(i, i + ROSTER_NAMES_CHUNK);
        settled.push(new Promise<void>((done) => waiting.push({ ids: chunkIds, done })));
      }
      pump();
      return Promise.all(settled).then(() => undefined);
    },
    dispose() {
      disposed = true;
      for (const chunk of waiting.splice(0)) chunk.done();
    },
  };
}

/** Every name of one roster, in one call — a resolver used once. */
export async function fetchRosterProductNames(
  ids: readonly string[],
  post: RosterNamesPost = defaultPost,
): Promise<Map<string, RosterProductSummary>> {
  const result = new Map<string, RosterProductSummary>();
  const resolver = createRosterNameResolver({
    post,
    onFound: (found) => {
      for (const [id, p] of found) result.set(id, p);
    },
  });
  await resolver.request(ids);
  return result;
}
