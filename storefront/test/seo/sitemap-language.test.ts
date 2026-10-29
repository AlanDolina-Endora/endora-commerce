import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChannelUrlLanguage } from '@endora-commerce/contracts';

/**
 * Feature 167 (US5, FR-032) — the storefront's own sitemap lists every page under each
 * channel language's prefix (none for the unprefixed default), products on their key
 * in that language, CMS pages only in the languages they have content in, and never a
 * `?lang=`.
 */

const plEn = (on: boolean): ChannelUrlLanguage[] => [
  { languageCode: 'pl-PL', prefix: 'pl', prefixed: on, isDefault: true },
  { languageCode: 'en-US', prefix: 'en', prefixed: true, isDefault: false },
];
const state: { languages: ChannelUrlLanguage[] } = { languages: plEn(true) };

vi.mock('../../lib/server-context', () => ({
  getServerContext: async () => ({
    ctx: { locale: 'pl-PL' },
    anonymousAccess: true,
    urlState: { languages: state.languages, aliases: [], current: 'pl-PL' },
  }),
}));
vi.mock('../../lib/api/catalog', () => ({
  // The product's key in the language the listing is asked in.
  listProducts: async (_query: unknown, ctx: { locale?: string }) => ({
    data: [{ slug: ctx.locale === 'en-US' ? 'drill' : 'wiertarka' }],
    pagination: { cursor: null, hasMore: false, limit: 100 },
  }),
  getCategoryTree: async () => [{ slug: 'narzedzia', children: [] }],
}));
vi.mock('../../lib/api/blog', () => ({ getBlogIndex: async () => null }));
vi.mock('../../lib/api/cms', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api/cms')>()),
  getCmsPageIndex: async () => ({
    pages: [
      { slug: 'o-nas', path: 'o-nas', updatedAt: '2026-10-29T00:00:00.000Z', languages: ['pl-PL'] },
      { slug: 'faq', path: 'faq', updatedAt: '2026-10-29T00:00:00.000Z' },
    ],
  }),
}));
vi.mock('../../lib/api/homepage', () => ({ getHomepageConfig: async () => ({ cmsPageSlug: null }) }));

const ORIGIN = 'https://shop.example.com';

async function urls(): Promise<string[]> {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', ORIGIN);
  const { default: sitemap } = await import('../../app/sitemap');
  return (await sitemap()).map((entry) => entry.url.replace(ORIGIN, ''));
}

beforeEach(() => {
  state.languages = plEn(true);
});

describe('the storefront sitemap per language', () => {
  it('setting on: every URL under its language prefix, products on their key in that language', async () => {
    const list = await urls();
    expect(list).toEqual(expect.arrayContaining(['/pl', '/en', '/pl/catalog', '/en/catalog']));
    expect(list).toEqual(expect.arrayContaining(['/pl/p/wiertarka', '/en/p/drill']));
    expect(list).not.toContain('/en/p/wiertarka');
    expect(list).toEqual(expect.arrayContaining(['/pl/c/narzedzia', '/en/c/narzedzia']));
    // A CMS page only in the languages it has content in; one that names none in every one.
    expect(list).toContain('/pl/o-nas');
    expect(list).not.toContain('/en/o-nas');
    expect(list).toEqual(expect.arrayContaining(['/pl/faq', '/en/faq']));
    expect(list.filter((url) => url.includes('lang='))).toEqual([]);
  });

  it('setting off: the default language unprefixed, the others prefixed', async () => {
    state.languages = plEn(false);
    const list = await urls();
    expect(list).toEqual(expect.arrayContaining(['/', '/en', '/catalog', '/en/catalog', '/p/wiertarka', '/en/p/drill']));
    expect(list).not.toContain('/pl/catalog');
  });
});
