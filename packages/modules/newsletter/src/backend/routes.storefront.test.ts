import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { registerNewsletterStorefrontRoutes, type NewsletterStorefrontDeps } from './routes.storefront.js';
import { NewsletterTokenHelper, clickDestinationHash } from './services/token.helper.js';
import type { NewsletterTrackingService } from './services/tracking.service.js';

/**
 * `GET /api/v1/newsletter/c/:token?u=<url>` — the click tracker. It redirects
 * only when the token verifies, and only to the `u` destination whose digest
 * the token was minted with.
 *
 * The instance raises `maxParamLength`: a signed click token is longer than
 * Fastify's default 100-character path-parameter limit, so under the default
 * the router answers 414 before this handler runs. These cases are about the
 * handler's decision, not the router's limit.
 */
const STOREFRONT = 'https://shop.test';
const DEAL = 'https://shop.test/deal?utm_source=newsletter';
const ELSEWHERE = 'https://elsewhere.example/';
const tokens = new NewsletterTokenHelper('click-route-secret');

interface RecordedClick {
  id: string;
  linkId: string | null;
  url: string | null;
}

let app: FastifyInstance | null = null;

async function appWith(clicks: RecordedClick[]): Promise<FastifyInstance> {
  const instance = Fastify({ maxParamLength: 1024 });
  const tracking = {
    recordOpen: async () => undefined,
    recordClick: async (id: string, linkId: string | null, url: string | null) => {
      clicks.push({ id, linkId, url });
    },
  } as unknown as NewsletterTrackingService;
  await registerNewsletterStorefrontRoutes(instance, {
    subscribers: {} as NewsletterStorefrontDeps['subscribers'],
    optIn: {} as NewsletterStorefrontDeps['optIn'],
    tokens,
    tracking,
    resolveChannelIdByCode: async () => null,
    resolveDefaultChannelId: async () => null,
    storefrontBaseUrl: STOREFRONT,
  });
  app = instance;
  return instance;
}

function clickUrl(token: string, u?: string): string {
  return `/api/v1/newsletter/c/${token}${u === undefined ? '' : `?u=${encodeURIComponent(u)}`}`;
}

afterEach(async () => {
  await app?.close();
  app = null;
});

describe('newsletter click tracker', () => {
  it('redirects to the destination bound to a valid token and records the click', async () => {
    const clicks: RecordedClick[] = [];
    const server = await appWith(clicks);
    const token = tokens.mint('click', { id: 'rec-1', linkId: 'cta', urlHash: clickDestinationHash(DEAL) }, 3600);
    const res = await server.inject({ method: 'GET', url: clickUrl(token, DEAL) });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(DEAL);
    expect(clicks).toEqual([{ id: 'rec-1', linkId: 'cta', url: DEAL }]);
  });

  it('sends a valid token with a different destination to the storefront home', async () => {
    const clicks: RecordedClick[] = [];
    const server = await appWith(clicks);
    const token = tokens.mint('click', { id: 'rec-1', urlHash: clickDestinationHash(DEAL) }, 3600);
    const res = await server.inject({ method: 'GET', url: clickUrl(token, ELSEWHERE) });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`${STOREFRONT}/`);
    expect(clicks).toEqual([{ id: 'rec-1', linkId: null, url: null }]);
  });

  it('answers 410 without redirecting when the token does not verify', async () => {
    const clicks: RecordedClick[] = [];
    const server = await appWith(clicks);
    const res = await server.inject({ method: 'GET', url: clickUrl('garbage', ELSEWHERE) });
    expect(res.statusCode).toBe(410);
    expect(res.headers.location).toBeUndefined();
    expect(clicks).toEqual([]);
  });

  it('answers 410 for a token minted for another purpose', async () => {
    const server = await appWith([]);
    const token = tokens.mint('open', { id: 'rec-1' }, 3600);
    const res = await server.inject({ method: 'GET', url: clickUrl(token, ELSEWHERE) });
    expect(res.statusCode).toBe(410);
  });

  it('sends a valid token that binds no destination to the storefront home, not to u', async () => {
    const clicks: RecordedClick[] = [];
    const server = await appWith(clicks);
    const token = tokens.mint('click', { id: 'rec-2', linkId: 'old' }, 3600);
    const res = await server.inject({ method: 'GET', url: clickUrl(token, ELSEWHERE) });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`${STOREFRONT}/`);
    expect(clicks).toEqual([{ id: 'rec-2', linkId: 'old', url: null }]);
  });

  it('does not redirect to a bound destination that is not http(s)', async () => {
    const server = await appWith([]);
    const script = 'javascript:alert(1)';
    const token = tokens.mint('click', { id: 'rec-3', urlHash: clickDestinationHash(script) }, 3600);
    const res = await server.inject({ method: 'GET', url: clickUrl(token, script) });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`${STOREFRONT}/`);
  });
});

describe('newsletter click tracker on a default router', () => {
  it('answers an unverifiable token 410 without redirecting', async () => {
    const instance = Fastify();
    await registerNewsletterStorefrontRoutes(instance, {
      subscribers: {} as NewsletterStorefrontDeps['subscribers'],
      optIn: {} as NewsletterStorefrontDeps['optIn'],
      tokens,
      tracking: { recordClick: async () => undefined } as unknown as NewsletterTrackingService,
      resolveChannelIdByCode: async () => null,
      resolveDefaultChannelId: async () => null,
      storefrontBaseUrl: STOREFRONT,
    });
    app = instance;
    const res = await instance.inject({ method: 'GET', url: clickUrl('garbage', ELSEWHERE) });
    expect(res.statusCode).toBe(410);
    expect(res.headers.location).toBeUndefined();
  });
});
