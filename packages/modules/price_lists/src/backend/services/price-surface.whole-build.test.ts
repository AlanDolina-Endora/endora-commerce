import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EntityManager } from '@mikro-orm/postgresql';
import { BUILD_CHUNK, PriceSurface } from './price-surface.js';
import type { BookPricing } from './book-pricing.js';
import type { PricingProfile, ProfileVectorEntry } from './pricing-profile.js';
import type { PricedProductRef } from './pricing-service.interface.js';

/**
 * Issue #416 — a whole build of a profile, as the worker's pass runs it.
 *
 * Profiled on the SC-005 fixture at 201 profiles (262.7 s), the catalogue was
 * read through `catalog`'s port once per whole build of a profile that may
 * price every product — 21 reads of 50 000 products, 79.4 s — and each chunk's
 * insert waited for its resolution and the next resolution for the insert.
 * Now a pass reads the catalogue at most once, and a build resolves the next
 * chunk while the previous one is written. What must not move with that:
 *
 * - a pass's catalogue read comes after the pass read its work, so a product
 *   change committed before the pass is in it, and one committed during the
 *   pass is a mark the next pass does (`contracts/price-surface.md` §4);
 * - a build that fails — a write or a resolution, in any chunk — swaps nothing:
 *   the profile keeps serving the generation it had and keeps its mark (§3);
 * - a failure of one chunk while another is in flight is the build's failure,
 *   never an unhandled rejection.
 */

interface FakeProfile {
  id: string;
  key: string;
  vector: ProfileVectorEntry[];
  state: 'building' | 'ready';
  stale: boolean;
  generation: number;
}

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => unhandled.push(reason);

beforeEach(() => {
  unhandled.length = 0;
  process.on('unhandledRejection', onUnhandled);
});
afterEach(() => {
  process.off('unhandledRejection', onUnhandled);
});

function harness(options: {
  products: number;
  buyers: number;
  failInsert?: number;
  failResolve?: number;
}) {
  const log: string[] = [];
  const reads = { catalogue: 0, inserts: 0, resolutions: 0 };
  const everyone: FakeProfile = { id: 'e', key: 'key-e', vector: [], state: 'building', stale: false, generation: 0 };
  const buyers: FakeProfile[] = Array.from({ length: options.buyers }, (_, i) => ({
    id: `b${i}`,
    key: `key-b${i}`,
    vector: [{ bookId: `book-${i}`, audienceKind: 'organizations', depth: 0 }],
    state: 'building',
    stale: false,
    generation: 0,
  }));
  const all = [everyone, ...buyers];
  const byKey = (key: unknown) => all.find((p) => p.key === key);
  const byId = (id: unknown) => all.find((p) => p.id === id);
  const catalogue: PricedProductRef[] = Array.from({ length: options.products }, (_, i) => ({ id: `p${i}`, attributeValues: {} }));

  const execute = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    if (/where f\."state" = 'building' or f\."stale"/.test(sql)) {
      log.push('due');
      return all
        .filter((p) => p.state === 'building' || p.stale)
        .map((p) => ({
          id: p.id,
          sales_channel_id: 'ch',
          currency_code: 'PLN',
          precedence_version: 1,
          book_vector: p.vector,
          state: p.state,
          stale: p.stale,
          marked_at: null,
          marks: null,
        }));
    }
    if (/^select "id", "state", "serving_generation", "revision" from "price_profiles"/.test(sql.trim())) {
      const p = byKey(params[3]);
      return p ? [{ id: p.id, state: p.state, serving_generation: p.generation, revision: 0 }] : [];
    }
    if (/^insert into "price_profiles"/.test(sql.trim())) return [];
    if (/select distinct "product_id", "category_id", "attribute_key"/.test(sql)) {
      // Every buyer book holds one all-products row: its whole build resolves the catalogue.
      return [{ product_id: null, category_id: null, attribute_key: null }];
    }
    if (/pg_advisory_xact_lock/.test(sql)) return [];
    if (/^select "state", "stale", "serving_generation", "marked_at"::text/.test(sql.trim())) {
      const p = byId(params[0])!;
      return [{ state: p.state, stale: p.stale, serving_generation: p.generation, marked_at: null }];
    }
    if (/^select "serving_generation", "revision" from "price_profiles"/.test(sql.trim())) {
      return [{ serving_generation: byId(params[0])!.generation, revision: 0 }];
    }
    if (/^insert into "price_profile_prices"/.test(sql.trim())) {
      reads.inserts += 1;
      const n = reads.inserts;
      log.push(`insert:start:${n}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (options.failInsert === n) {
        log.push(`insert:fail:${n}`);
        throw new Error(`insert ${n} failed`);
      }
      log.push(`insert:end:${n}`);
      return [];
    }
    if (/from "price_profile_prices"/.test(sql) && /^select/.test(sql.trim())) return [];
    if (/^delete from "price_profile_prices"/.test(sql.trim())) return [];
    if (/from "pg_class"/.test(sql)) return [{ reltuples: 1_000_000 }];
    if (/^analyze/.test(sql.trim())) return [];
    if (/^update "price_profiles"\s+set "state" = 'ready'/.test(sql.trim())) {
      const p = byId(params[2])!;
      log.push(`swap:${p.id}`);
      p.state = 'ready';
      p.generation = Number(params[0]);
      // `"stale" and "marked_at" is distinct from <the pass's>`: no write marked it since.
      p.stale = false;
      return [];
    }
    if (/delete from "price_profile_stale_products"/.test(sql)) return [];
    throw new Error(`unexpected statement: ${sql}`);
  };
  const em = {
    execute,
    transactional: async <T>(work: (em: unknown) => Promise<T>) => work(em),
  };

  const books = {
    profileFromVector: async (input: { channelId: string; currencyCode: string; precedenceVersion: number; vector: ProfileVectorEntry[] }) =>
      ({
        key: input.vector.length === 0 ? 'key-e' : `key-b${input.vector[0]!.bookId.slice('book-'.length)}`,
        channelId: input.channelId,
        currencyCode: input.currencyCode,
        precedenceVersion: input.precedenceVersion,
        vector: input.vector,
        books: input.vector.map((v) => ({ id: v.bookId, name: v.bookId, type: 'regular', isSystem: false, priority: 0, audience: { kind: 'organizations', depth: 0 } })),
      }) as unknown as PricingProfile,
    resolveProfileListing: async (products: readonly PricedProductRef[]) => {
      reads.resolutions += 1;
      const n = reads.resolutions;
      log.push(`resolve:start:${n}`);
      await new Promise((resolve) => setTimeout(resolve, 1));
      if (options.failResolve === n) {
        log.push(`resolve:fail:${n}`);
        throw new Error(`resolution ${n} failed`);
      }
      log.push(`resolve:end:${n}`);
      return new Map(
        products.map((p) => [
          p.id,
          { resolution: { price: { amount: '10.0000', source: 'base', compareAt: null } }, maxAmount: null, variesByVariant: false },
        ]),
      );
    },
  } as unknown as BookPricing;

  const surface = new PriceSurface({
    emFactory: () => em as unknown as EntityManager,
    books,
    listProducts: async () => {
      reads.catalogue += 1;
      log.push('catalogue');
      return catalogue;
    },
    productsByIds: async (ids) => catalogue.filter((p) => ids.includes(p.id)),
    categories: {
      listProductIdsInCategory: async () => [],
      listProductIdsInSubtree: async () => [],
      listAssignmentsForProducts: async () => [],
    },
    bookChannels: async () => ['ch'],
  });
  return { surface, reads, log, everyone, buyers };
}

describe('PriceSurface — a whole build (issue #416)', () => {
  it('a pass reads the catalogue once, after it read its work, however many profiles price every product', async () => {
    const { surface, reads, log, everyone, buyers } = harness({ products: 3, buyers: 3 });
    expect(await surface.rebuildStale()).toBe(4);
    expect(reads.catalogue).toBe(1);
    expect(log.indexOf('catalogue')).toBeGreaterThan(log.indexOf('due'));
    expect([everyone, ...buyers].every((p) => p.state === 'ready' && p.generation === 1)).toBe(true);
  });

  it('each pass reads the catalogue afresh', async () => {
    const { surface, reads, everyone } = harness({ products: 3, buyers: 1 });
    await surface.rebuildStale();
    everyone.stale = true;
    await surface.rebuildStale();
    expect(reads.catalogue).toBe(2);
  });

  it('the next chunk is resolved while the previous one is written', async () => {
    const { surface, log } = harness({ products: BUILD_CHUNK * 3, buyers: 0 });
    await surface.rebuildStale();
    // The second resolution starts before the first insert has ended.
    expect(log.indexOf('resolve:start:2')).toBeLessThan(log.indexOf('insert:end:1'));
    expect(log.filter((l) => l.startsWith('insert:end')).length).toBe(3);
    expect(log.filter((l) => l !== 'due').at(-1)).toBe('swap:e');
  });

  it('a write failing in a later chunk swaps nothing: the profile keeps what it served', async () => {
    const { surface, log, everyone } = harness({ products: BUILD_CHUNK * 3, buyers: 0, failInsert: 2 });
    await expect(surface.rebuildStale()).rejects.toThrow('insert 2 failed');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(log.some((l) => l.startsWith('swap:'))).toBe(false);
    expect(everyone).toMatchObject({ state: 'building', generation: 0 });
    expect(unhandled).toEqual([]);
  });

  it('a resolution failing while a chunk is being written swaps nothing, and leaves no unhandled rejection', async () => {
    const { surface, log, everyone } = harness({ products: BUILD_CHUNK * 3, buyers: 0, failResolve: 2, failInsert: 1 });
    await expect(surface.rebuildStale()).rejects.toThrow(/failed/);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(log.some((l) => l.startsWith('swap:'))).toBe(false);
    expect(everyone).toMatchObject({ state: 'building', generation: 0 });
    expect(unhandled).toEqual([]);
  });
});
