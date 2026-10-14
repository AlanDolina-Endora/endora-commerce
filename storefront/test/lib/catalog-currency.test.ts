import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProductBySlug, getProductLinks, listProducts } from '../../lib/api/catalog';
import type { RequestContext } from '../../lib/api/client';

/**
 * Issue #249 (3) — the catalogue reads carry the currency the shopper chose.
 *
 * The header switcher stores the choice in the `currency` cookie and
 * `getServerContext()` puts it on `ctx.currency`, but nothing in
 * `lib/api/catalog` read it: listings, the product page and the link strips —
 * and the CMS catalogue blocks, which read through the same functions — were
 * priced in the channel's default whatever the shopper picked, while the
 * resolved-price surfaces already followed the switcher.
 *
 * As a query parameter rather than a header, deliberately: the Data Cache keys
 * a `fetch` by its URL, so a EUR page and a PLN page are two entries rather
 * than whichever was asked first, and a visitor with no choice keeps hitting
 * the URL — and the entry — it hit before.
 */

const originalFetch = globalThis.fetch;
let urls: string[] = [];

function stubFetch(body: unknown): void {
  urls = [];
  globalThis.fetch = vi.fn(async (url: unknown) => {
    urls.push(String(url));
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const LISTING = { data: [], pagination: { limit: 4, cursor: null, hasMore: false } };
const WITH_EUR: RequestContext = { salesChannelCode: 'pl_retail', locale: 'en-US', currency: 'EUR' };
const NO_CHOICE: RequestContext = { salesChannelCode: 'pl_retail', locale: 'en-US' };

function currencyOf(url: string | undefined): string | null {
  return new URL(url ?? '', 'http://storefront.test').searchParams.get('currency');
}

describe('catalogue reads and the selected currency', () => {
  it('a listing carries it', async () => {
    stubFetch(LISTING);
    await listProducts({ limit: 4, categorySlug: 'tools' }, WITH_EUR);

    expect(currencyOf(urls[0])).toBe('EUR');
    // Alongside the parameters that were already there, not instead of them.
    expect(new URL(urls[0]!).searchParams.get('filter[category]')).toBe('tools');
  });

  it('the product page carries it', async () => {
    stubFetch({ data: { id: 'p1' } });
    await getProductBySlug('widget', WITH_EUR);

    expect(currencyOf(urls[0])).toBe('EUR');
  });

  it('a link strip carries it', async () => {
    stubFetch({ data: [] });
    await getProductLinks('widget', 'cross_sell', WITH_EUR);

    expect(currencyOf(urls[0])).toBe('EUR');
    expect(new URL(urls[0]!).searchParams.get('kind')).toBe('cross_sell');
  });

  it('a visitor who chose nothing asks exactly the URL they asked before', async () => {
    stubFetch(LISTING);
    await listProducts({ limit: 4 }, NO_CHOICE);
    stubFetch({ data: { id: 'p1' } });
    await getProductBySlug('widget', NO_CHOICE);

    expect(urls[0]).not.toContain('currency=');
    expect(urls[0]!.endsWith('/api/v1/catalog/products/widget')).toBe(true);
  });

  it('a cookie value that is not a currency code is not forwarded', async () => {
    // The backend refuses a malformed `?currency=` with a 400; a tampered or
    // corrupted cookie must not turn every catalogue page into an error.
    stubFetch(LISTING);
    await listProducts({ limit: 4 }, { ...NO_CHOICE, currency: 'EURO' });

    expect(currencyOf(urls[0])).toBeNull();
  });
});
