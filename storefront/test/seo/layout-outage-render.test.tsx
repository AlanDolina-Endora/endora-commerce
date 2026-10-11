import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { ReactElement } from 'react';

/**
 * The outage shell, rendered (`specs/144-seo-search-engine-robots/`, FR-012).
 *
 * `layout-robots.test.ts` reads the layout's source and holds its *shape*: a
 * robots element in every document, none in `metadata`. Shape cannot say
 * whether the element appears when it should, so this renders the branch of
 * the root layout that can be rendered without a backend — the shell it
 * returns when the reachability gate rewrote the request — with and without a
 * channel default.
 *
 * The shop branch is not rendered here: it needs the dictionary, the megamenu,
 * the cart and six analytics configs, and it is measured on a built storefront
 * instead (`test/conformance/robots-directive.spec.ts`).
 */

const requestHeaders = new Map<string, string>();

vi.mock('next/headers', () => ({
  headers: async () => ({ get: (name: string) => requestHeaders.get(name.toLowerCase()) ?? null }),
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}));
vi.mock('../../app/globals.css', () => ({}));

async function renderOutageShell(headers: Record<string, string>): Promise<string> {
  requestHeaders.clear();
  requestHeaders.set('x-backend-unreachable', '1');
  for (const [name, value] of Object.entries(headers)) requestHeaders.set(name, value);
  const { default: RootLayout } = await import('../../app/layout');
  return renderToString(
    (await RootLayout({ children: <p>notice</p> })) as ReactElement,
  );
}

const robotsMetas = (html: string): string[] =>
  [...html.matchAll(/<meta name="robots" content="([^"]*)"\s*\/?>/g)].map((m) => m[1] ?? '');

describe('the outage shell', () => {
  beforeEach(() => {
    requestHeaders.clear();
  });

  it.each(['noindex', 'nofollow', 'noindex, nofollow'])(
    'carries the channel default %s as a robots element',
    async (directive) => {
      const html = await renderOutageShell({ 'x-robots-default': directive });
      expect(html).toContain('notice');
      expect(robotsMetas(html)).toEqual([directive]);
    },
  );

  it('carries no robots element of its own when the channel has no default', async () => {
    const html = await renderOutageShell({});
    expect(html).toContain('notice');
    expect(robotsMetas(html)).toEqual([]);
  });

  it('renders nothing for a header value that is not one of the three directives', async () => {
    const html = await renderOutageShell({ 'x-robots-default': 'index, follow' });
    expect(robotsMetas(html)).toEqual([]);
  });
});
