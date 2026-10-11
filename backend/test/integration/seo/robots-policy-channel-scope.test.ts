import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { systemDefaultSalesChannel } from '../../helpers/sales-channel-fixtures.js';

/**
 * The default robots policy is per sales channel (Constitution XII;
 * `specs/144-seo-search-engine-robots/` FR-002, FR-005).
 *
 * The failure this file exists to refuse is one channel's `noindex` being
 * served for another: a shop taken out of search because a neighbouring
 * channel is a staging copy, or — the direction that motivated the feature — a
 * demo left indexable because its policy was answered from a channel that has
 * none. So every case names two channels and asserts on both.
 */
describe('default robots policy — sales-channel scope', () => {
  let h: BackendServerHandle;
  let systemDefault: string;
  const admin = { b2b_session: 'stub-admin-session' };
  const A = 'pl_retail';
  const B = 'pl_b2b_vip';
  const SETTING = '/api/v1/admin/settings/seo.default_robots';

  beforeAll(async () => {
    h = await setupBackendServer();
    systemDefault = (await systemDefaultSalesChannel(h.em())).code;
    // The cases below are only about isolation if the three channels are three.
    expect(new Set([A, B, systemDefault]).size).toBe(3);
  });

  afterEach(async () => {
    for (const url of [
      `${SETTING}/values?salesChannelCodes=${A},${B},${systemDefault}`,
      `${SETTING}/values`,
    ]) {
      const res = await h.app.inject({ method: 'DELETE', url, cookies: admin });
      expect(res.statusCode, res.body).toBe(200);
    }
  });

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  const storeFor = async (channels: readonly string[] | 'all', value: string): Promise<void> => {
    const res = await h.app.inject({
      method: 'PUT',
      url: `${SETTING}/value`,
      cookies: admin,
      payload:
        channels === 'all'
          ? { scope: 'all', value }
          : { scope: 'subset', salesChannelCodes: channels, value },
    });
    expect(res.statusCode, res.body).toBe(200);
  };

  const policyFor = async (channel: string | null): Promise<unknown> => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/api/v1/storefront/seo/robots-policy',
      ...(channel !== null ? { headers: { 'x-sales-channel': channel } } : {}),
    });
    expect(res.statusCode, res.body).toBe(200);
    return (res.json() as { data: unknown }).data;
  };

  it('answers each channel its own value and never a neighbour’s', async () => {
    await storeFor([A], 'NOINDEX, NOFOLLOW');

    expect(await policyFor(A)).toEqual({ index: false, follow: false });
    expect(await policyFor(B)).toEqual({ index: true, follow: true });
  });

  it('answers the system-default channel when the request names none — not an aggregate', async () => {
    // Two channels restricted, the system default left alone: a request with no
    // channel is that channel's, so it is not restricted. An implementation that
    // answered "the most restrictive value any channel holds" fails here.
    await storeFor([A, B], 'NOINDEX, NOFOLLOW');
    expect(await policyFor(null)).toEqual({ index: true, follow: true });
    expect(await policyFor(systemDefault)).toEqual({ index: true, follow: true });

    // And the other direction: the system default restricted, differently from
    // its neighbours, is what a request with no channel gets.
    await storeFor([systemDefault], 'NOINDEX, FOLLOW');
    expect(await policyFor(null)).toEqual({ index: false, follow: true });
    expect(await policyFor(A)).toEqual({ index: false, follow: false });
  });

  it('lets a channel value override the all-channels value, and inherit it again after a reset', async () => {
    await storeFor('all', 'INDEX, NOFOLLOW');
    await storeFor([A], 'NOINDEX, FOLLOW');

    expect(await policyFor(A)).toEqual({ index: false, follow: true });
    expect(await policyFor(B)).toEqual({ index: true, follow: false });

    const reset = await h.app.inject({
      method: 'DELETE',
      url: `${SETTING}/values?salesChannelCodes=${A}`,
      cookies: admin,
    });
    expect(reset.statusCode, reset.body).toBe(200);

    expect(await policyFor(A)).toEqual({ index: true, follow: false });
    expect(await policyFor(B)).toEqual({ index: true, follow: false });
  });

  it('lets a channel stay indexable while every other channel is taken out of search', async () => {
    await storeFor('all', 'NOINDEX, NOFOLLOW');
    await storeFor([A], 'INDEX, FOLLOW');

    expect(await policyFor(A)).toEqual({ index: true, follow: true });
    expect(await policyFor(B)).toEqual({ index: false, follow: false });
    expect(await policyFor(null)).toEqual({ index: false, follow: false });
  });
});
