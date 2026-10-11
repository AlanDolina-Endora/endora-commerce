/* eslint-disable no-console -- a conformance run: stdout is its interface, and the line
   saying which channel was asked and what was expected is output, not a diagnostic. */
import { expect, test } from '@playwright/test';

import { ROBOTS_RESPONSE_HEADER, robotsDirective } from '../../lib/seo/robots-directive';
import { isRobotsPolicyResponse, type RobotsPolicyRead } from '../../lib/seo/crawler-policy';

/**
 * The default robots directive on **served** responses
 * (`specs/144-seo-search-engine-robots/contracts/crawler-policy.md` §6).
 *
 * The unit tests hold the decisions; this holds their effect, which exists only
 * on a built storefront: that the middleware's header reaches documents, the
 * sitemap and public files alike, and that the root layout's extra
 * `<meta name="robots">` reaches `<head>` beside a page's own.
 *
 * It asserts whatever the backend says the channel's policy **is** — it changes
 * no setting — so it is green on an untouched instance (no header, no extra
 * tag) and on a `noindex` one, and is worth running on both. It needs no
 * browser.
 *
 *     STOREFRONT_URL=http://127.0.0.1:3000 PUBLIC_API_BASE_URL=http://127.0.0.1:3001 \
 *       pnpm --filter storefront run conformance -- robots-directive
 *
 * **Run it against a steady state.** The storefront holds a channel's policy
 * for up to a minute, so within a minute of a change the two can legitimately
 * disagree and this fails. `SALES_CHANNEL_CODE` names the channel to ask as;
 * unset, it is the system-default channel.
 */

const STOREFRONT_URL = process.env['STOREFRONT_URL'] ?? 'http://127.0.0.1:3000';
const BACKEND_URL = process.env['PUBLIC_API_BASE_URL'] ?? 'http://127.0.0.1:3001';
const CHANNEL = process.env['SALES_CHANNEL_CODE'];
const CHANNEL_HEADERS: Record<string, string> =
  CHANNEL !== undefined && CHANNEL !== '' ? { 'x-sales-channel': CHANNEL } : {};

/** What the backend says, classified the way the storefront's reader classifies it. */
async function policyAccordingToBackend(): Promise<RobotsPolicyRead> {
  const response = await fetch(`${BACKEND_URL}/api/v1/storefront/seo/robots-policy`, {
    headers: CHANNEL_HEADERS,
  });
  if (response.status === 404) return { kind: 'none' };
  const body: unknown = await response.json().catch(() => null);
  if (response.status === 503) {
    const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
    if (code === 'MODULE_DISABLED') return { kind: 'none' };
  }
  expect(response.status, 'the policy endpoint must answer 200, 404 or MODULE_DISABLED').toBe(200);
  expect(isRobotsPolicyResponse(body), 'the policy endpoint must answer the contract').toBe(true);
  return { kind: 'value', value: (body as { data: { index: boolean; follow: boolean } }).data };
}

function robotsMetaContents(html: string): string[] {
  const head = html.slice(0, html.indexOf('</head>'));
  return [...head.matchAll(/<meta name="robots" content="([^"]*)"\s*\/?>/g)].map((m) => m[1] ?? '');
}

const served = (path: string): Promise<Response> =>
  fetch(`${STOREFRONT_URL}${path}`, { headers: CHANNEL_HEADERS, redirect: 'manual' });

test.describe('default robots directive on served responses', () => {
  let directive: string | null;

  test.beforeAll(async () => {
    directive = robotsDirective(await policyAccordingToBackend());
    console.log(`[robots-directive] channel=${CHANNEL ?? '(system default)'} expects=${directive ?? '(none)'}`);
  });

  for (const path of ['/', '/cart', '/sitemap.xml', '/service-worker.js', '/robots.txt']) {
    test(`${path} carries the header exactly when the policy restricts`, async () => {
      const response = await served(path);
      expect(response.status).toBeLessThan(400);
      expect(response.headers.get(ROBOTS_RESPONSE_HEADER)).toBe(directive);
    });
  }

  test('/cart keeps its own robots tag and gains the default beside it, in <head>', async () => {
    const tags = robotsMetaContents(await (await served('/cart')).text());
    // The page's own declaration is never replaced or suppressed.
    expect(tags).toContain('noindex, nofollow');
    expect(tags).toHaveLength(directive === null ? 1 : 2);
    if (directive !== null) expect(tags).toContain(directive);
  });

  test('/ carries the default as a tag exactly when the policy restricts', async () => {
    const tags = robotsMetaContents(await (await served('/')).text());
    if (directive === null) expect(tags).toEqual([]);
    else expect(tags).toEqual([directive]);
  });

  test('a client cannot supply the directive the layout renders', async () => {
    const response = await fetch(`${STOREFRONT_URL}/`, {
      headers: { ...CHANNEL_HEADERS, 'x-robots-default': 'noindex, nofollow' },
    });
    const tags = robotsMetaContents(await response.text());
    expect(tags).toEqual(directive === null ? [] : [directive]);
  });

  test('robots.txt is not changed by the policy: it never closes the whole site', async () => {
    // A crawler has to fetch a page to read that it must not be indexed.
    //
    // `?part=system` is the storefront's own rules, which is what this claim is
    // about. The whole file also carries whatever the channel's operator added
    // to it, and an operator may write any rule there — `Disallow: /` included.
    const body = await (await served('/robots.txt?part=system')).text();
    expect(body.split('\n').map((line) => line.trim())).not.toContain('Disallow: /');
    expect(body).toContain('Sitemap: ');
  });

  test('the build-generated files under /_next/static are exempt', async () => {
    const html = await (await served('/')).text();
    const asset = /\/_next\/static\/[^"]+\.(?:js|css)/.exec(html)?.[0];
    expect(asset, 'the home page must reference a build asset').toBeDefined();
    const response = await served(asset as string);
    expect(response.headers.get(ROBOTS_RESPONSE_HEADER)).toBeNull();
  });
});
