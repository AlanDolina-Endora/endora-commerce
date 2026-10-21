import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import { PricingCache } from '../../../../packages/modules/price_lists/src/backend/services/pricing-cache.js';
import { PricingGeneration } from '../../../../packages/modules/price_lists/src/backend/services/pricing-generation.js';

/**
 * D-287 P0 — the pricing cache across processes, over a real Redis.
 *
 * Two `PricingCache` + `PricingGeneration` pairs stand for two API replicas.
 * Before the generation channel existed, a price write on replica A cleared A's
 * LRU only, and B served the old price for up to the 60 s TTL
 * (`specs/pricing/read-paths-and-performance.md` §2.4: "multi-replica cache
 * behaviour" was not measured anywhere). A bump on A must empty B.
 */

const KEY = {
  productId: 'p1',
  variantId: null,
  quantity: 1,
  currencyCode: 'PLN',
  salesChannelId: 'ch',
  organizationId: null,
  customerGroupId: null,
};

async function eventually(check: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('PricingGeneration — a bump on one process empties every other process', () => {
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  let publisherA: Redis;
  let publisherB: Redis;
  let subscriberA: Redis;
  let subscriberB: Redis;

  beforeAll(() => {
    publisherA = new Redis(redisUrl, { maxRetriesPerRequest: null });
    publisherB = new Redis(redisUrl, { maxRetriesPerRequest: null });
    subscriberA = new Redis(redisUrl, { maxRetriesPerRequest: null });
    subscriberB = new Redis(redisUrl, { maxRetriesPerRequest: null });
  });

  afterAll(async () => {
    for (const subscriber of [subscriberA, subscriberB]) {
      subscriber.removeAllListeners('message');
      await subscriber.unsubscribe();
    }
    for (const client of [publisherA, publisherB, subscriberA, subscriberB]) client.disconnect();
  });

  it('replica B drops its cached prices when replica A bumps', async () => {
    const cacheA = new PricingCache<string>();
    const cacheB = new PricingCache<string>();
    const replicaA = new PricingGeneration(cacheA, publisherA);
    const replicaB = new PricingGeneration(cacheB, publisherB);
    await replicaA.start(subscriberA);
    await replicaB.start(subscriberB);

    cacheA.set(KEY, 'A-old');
    cacheB.set(KEY, 'B-old');

    await replicaA.bump();

    // The writer's own process is clear before `bump` returns.
    expect(cacheA.get(KEY)).toBeUndefined();
    await eventually(() => cacheB.stats().size === 0);
    expect(cacheB.get(KEY)).toBeUndefined();
  });
});
