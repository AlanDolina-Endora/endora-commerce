import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encodeCursor } from '@endora-commerce/platform/http';
import {
  priceWalkCorpus,
} from '../../helpers/price-walk-corpus.js';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';

/**
 * Review 3 of release 0.108.0, part A — a price-sorted walk pages through the
 * catalogue to its end, whatever happens to its price order on the way.
 *
 * Keyset pagination over a live price promises nothing about a product whose
 * price changes during the walk: it may be met twice or not at all, as on any
 * keyset walk over a mutable key. Every other product is met exactly once —
 * when the price order goes missing midway, when a page runs out of its scan
 * budget, on a channel that publishes no prices, and on a cursor issued before
 * any of that happened.
 */
describe('a price-sorted walk meets every product once and ends', () => {
  let h: BackendServerHandle;
  let w: ReturnType<typeof priceWalkCorpus>;

  beforeAll(async () => {
    h = await setupBackendServer();
    w = priceWalkCorpus(h);
    await w.init();
  }, 60_000);

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  // ---- a malformed cursor is discarded, never a 500 ---------------------------

  const someId = '00000000-0000-4000-8000-000000000001';
  const at = '2026-03-01T00:00:00.000Z';

  it.each([
    ['a priced cursor with a malformed amount', { stream: 'priced', amount: 'abc', productId: someId }],
    ['a priced cursor with an old-format amount', { stream: 'priced', amount: '100.00001', productId: someId }],
    ['a priced cursor with a numeric amount', { stream: 'priced', amount: 100, productId: someId }],
    ['a priced cursor with a malformed product id', { stream: 'priced', amount: '100.0000', productId: 'nope' }],
    ['a tail cursor with a malformed date', { stream: 'tail', createdAt: 'yesterday', id: someId }],
    ['a tail cursor with a malformed id', { stream: 'tail', createdAt: at, id: 'nope' }],
    ['a rest cursor with a malformed amount', { stream: 'rest', amount: '1e5', productId: someId, after: { createdAt: at, id: someId } }],
    ['a rest cursor with no position', { stream: 'rest', amount: '100.0000', productId: someId, after: null }],
    ['a rest cursor with a malformed position', { stream: 'rest', amount: '100.0000', productId: someId, after: { createdAt: 'x', id: someId } }],
    ['a rest cursor with a malformed position id', { stream: 'rest', amount: '100.0000', productId: someId, after: { createdAt: at, id: 'nope' } }],
    ['an unordered cursor wrapping garbage', { stream: 'unordered', cursor: 'not-a-cursor' }],
    ['an unordered cursor wrapping a number', { stream: 'unordered', cursor: 7 }],
  ])('%s is discarded: the first page, not a 500', async (_name, payload) => {
    await w.seed(w.priced(4, (i) => ({ price: `${100 + i}.00`, age: i })));
    const first = await w.page('&limit=2&sort=price');
    const again = await w.page(`&limit=2&sort=price&cursor=${encodeURIComponent(encodeCursor(JSON.stringify(payload)))}`);
    expect(again.data.map((d) => d.sku)).toEqual(first.data.map((d) => d.sku));
  });

  it('a default-listing cursor with a malformed id is discarded too: the first page, not a 500', async () => {
    await w.seed(w.priced(4, (i) => ({ price: `${100 + i}.00`, age: i })));
    const first = await w.page('&limit=2');
    const again = await w.page(`&limit=2&cursor=${encodeURIComponent(encodeCursor(JSON.stringify({ createdAt: at, id: 'nope' })))}`);
    expect(again.data.map((d) => d.sku)).toEqual(first.data.map((d) => d.sku));
  });
});
