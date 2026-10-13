import { describe, expect, it } from 'vitest';
import {
  ROSTER_NAMES_CHUNK,
  fetchRosterProductNames,
  type RosterNamesPost,
} from '../../../../packages/modules/price_lists/src/admin/lib/roster-product-names';

/**
 * Feature 145, User Story 4 (SC-003, research.md R-9): the price-list roster
 * resolves its product names through `POST …/catalog/products/batch-by-id`,
 * which caps one request at 500 ids — so a roster of any size is cut into
 * chunks of at most 500, at most two of them in flight at a time, and the
 * answers are merged into one map. An id the lookup does not return stays
 * absent, which is what lets the screen fall back to the id prefix.
 */

const PATH = '/api/v1/admin/catalog/products/batch-by-id';

const ids = (n: number, prefix = 'p'): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(4, '0')}`);

function summary(id: string): { id: string; sku: string; name: Record<string, string> } {
  return { id, sku: `SKU-${id}`, name: { 'en-US': `Name ${id}` } };
}

interface Call {
  path: string;
  body: { ids: string[]; page: number; pageSize: number };
  resolve: () => void;
  reject: (err: unknown) => void;
}

/** A transport whose answers the test releases by hand, to observe how many are in flight. */
function deferredPost(answer: (ids: string[]) => string[] = (x) => x): {
  post: RosterNamesPost;
  calls: Call[];
  inFlight: () => number;
  maxInFlight: () => number;
} {
  const calls: Call[] = [];
  let open = 0;
  let max = 0;
  const post: RosterNamesPost = (path, body) =>
    new Promise((resolve, reject) => {
      open += 1;
      max = Math.max(max, open);
      calls.push({
        path,
        body,
        resolve: () => {
          open -= 1;
          resolve({ data: answer(body.ids).map(summary) });
        },
        reject: (err) => {
          open -= 1;
          reject(err);
        },
      });
    });
  return { post, calls, inFlight: () => open, maxInFlight: () => max };
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('fetchRosterProductNames', () => {
  it('asks for nothing when the roster is empty', async () => {
    const t = deferredPost();
    await expect(fetchRosterProductNames([], t.post)).resolves.toEqual(new Map());
    expect(t.calls).toHaveLength(0);
  });

  it('sends one request of page 0 / pageSize 500 for a roster under the cap', async () => {
    const t = deferredPost();
    const all = ids(20);
    const done = fetchRosterProductNames(all, t.post);
    await flush();
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]!.path).toBe(PATH);
    expect(t.calls[0]!.body).toEqual({ ids: all, page: 0, pageSize: 500 });
    t.calls[0]!.resolve();
    const map = await done;
    expect(map.size).toBe(20);
    expect(map.get('p0007')).toEqual(summary('p0007'));
  });

  it('cuts 1 200 ids into chunks of at most 500, with at most two requests in flight, and merges them', async () => {
    expect(ROSTER_NAMES_CHUNK).toBe(500);
    const t = deferredPost();
    const all = ids(1200);
    const done = fetchRosterProductNames(all, t.post);

    await flush();
    expect(t.calls).toHaveLength(2);
    expect(t.inFlight()).toBe(2);

    t.calls[0]!.resolve();
    await flush();
    expect(t.calls).toHaveLength(3);
    expect(t.inFlight()).toBe(2);

    t.calls[1]!.resolve();
    t.calls[2]!.resolve();
    const map = await done;

    expect(t.maxInFlight()).toBe(2);
    expect(t.calls.map((c) => c.body.ids.length)).toEqual([500, 500, 200]);
    expect(t.calls.flatMap((c) => c.body.ids)).toEqual(all);
    expect(map.size).toBe(1200);
    expect(map.get('p1199')?.sku).toBe('SKU-p1199');
  });

  it('leaves out an id the lookup does not return, and the ids of a chunk that failed', async () => {
    const t = deferredPost((chunk) => chunk.filter((id) => id !== 'p0003'));
    const all = ids(700);
    const done = fetchRosterProductNames(all, t.post);
    await flush();
    t.calls[0]!.resolve();
    t.calls[1]!.reject(new Error('network'));
    const map = await done;

    expect(map.has('p0003')).toBe(false);
    expect(map.has('p0004')).toBe(true);
    expect(map.has('p0500')).toBe(false);
    expect(map.size).toBe(499);
  });
});
