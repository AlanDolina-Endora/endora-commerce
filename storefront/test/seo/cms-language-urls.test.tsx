import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CmsResolvedPage } from '@endora-commerce/contracts';

/**
 * A CMS page's address per language on the storefront
 * (`specs/163-page-builder-marketing-pages/` R24, issue #521).
 *
 * - `?lang=` is the language a link asked for, as on a product page: it
 *   overrides the reader's language for this page alone.
 * - The backend answers the page at its address in the served language
 *   (`path`) and the URL built for it (`url`); a request under another address
 *   — the slug of the language the reader switched away from — answers a
 *   permanent redirect to that URL.
 * - The canonical is `url`, and the languages are `hreflang` alternates.
 */

const state: { page: CmsResolvedPage | null; langOverrides: Array<string | null | undefined> } = {
  page: null,
  langOverrides: [],
};
const redirects: string[] = [];

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  permanentRedirect: (url: string) => {
    redirects.push(url);
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock('../../lib/server-context', () => ({
  getServerContext: async (input?: { langOverride?: string | null }) => {
    state.langOverrides.push(input?.langOverride);
    return { ctx: { locale: 'pl-PL', salesChannelCode: 'web' }, locale: 'pl-PL' };
  },
}));
vi.mock('../../lib/api/cms', () => ({
  getCmsPageBySlug: async () => state.page,
  normalizeCmsUrlPath: (path: string) => path.replace(/^\/+|\/+$/g, ''),
}));
vi.mock('../../lib/api/homepage', () => ({
  getHomepageConfig: async () => ({ cmsPageSlug: null }),
}));
vi.mock('../../components/CmsPageRenderer', () => ({
  CmsPageRenderer: () => <div data-testid="page-body" />,
}));
vi.mock('../../components/seo/OrganizationJsonLd', () => ({
  OrganizationJsonLd: () => null,
}));

const route = await import('../../app/(content)/[...slug]/page');
const CmsContentPage = route.default;

function page(overrides: Partial<CmsResolvedPage> = {}): CmsResolvedPage {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'about-us',
    path: 'o-nas',
    url: '/o-nas?lang=pl-PL',
    alternates: [
      { language: 'en-US', url: '/about-us' },
      { language: 'pl-PL', url: '/o-nas?lang=pl-PL' },
    ],
    name: 'O nas',
    language: 'pl-PL',
    meta: { title: null, description: null, keywords: null },
    content: { data: { root: { props: {} }, content: [] } },
    embeds: { blocks: {}, templates: {} },
    assets: {},
    breadcrumbs: { visible: true, scheme: 'light', trail: [] },
    share: { imageUrl: null },
    languages: ['en-US', 'pl-PL'],
    ...overrides,
  };
}

async function render(segments: string[], lang?: string): Promise<string> {
  return renderToString(
    await CmsContentPage({
      params: Promise.resolve({ slug: segments }),
      searchParams: Promise.resolve(lang ? { lang } : {}),
    }),
  );
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://shop.example.com');
});

afterEach(() => {
  vi.unstubAllEnvs();
  state.page = null;
  state.langOverrides.length = 0;
  redirects.length = 0;
});

describe('a CMS page in several languages', () => {
  it('renders at its address in the served language, named in it', async () => {
    state.page = page();
    const html = await render(['o-nas'], 'pl-PL');
    expect(redirects).toEqual([]);
    expect(html).toContain('O nas');
    // WCAG 3.1.2: `<html lang>` is the cookie's; the page marks the language it is written in.
    expect(html).toContain('lang="pl-PL"');
  });

  it('passes ?lang= on as the language of this page alone', async () => {
    state.page = page();
    await render(['o-nas'], 'pl-PL');
    expect(state.langOverrides).toEqual(['pl-PL']);
  });

  it('ignores a ?lang= that is not a language code', async () => {
    state.page = page();
    await render(['o-nas'], '../../etc');
    expect(state.langOverrides).toEqual([null]);
  });

  it('redirects the slug of another language permanently to the URL of the served one', async () => {
    state.page = page();
    await expect(render(['about-us'])).rejects.toThrow('NEXT_REDIRECT');
    expect(redirects).toEqual(['/o-nas?lang=pl-PL']);
  });

  it('declares the served language URL canonical and every language as an hreflang alternate', async () => {
    state.page = page();
    const metadata = await route.generateMetadata({
      params: Promise.resolve({ slug: ['o-nas'] }),
      searchParams: Promise.resolve({ lang: 'pl-PL' }),
    });
    expect(metadata.alternates).toEqual({
      canonical: '/o-nas?lang=pl-PL',
      languages: { 'en-US': '/about-us', 'pl-PL': '/o-nas?lang=pl-PL' },
    });
    expect(metadata.openGraph).toMatchObject({ url: '/o-nas?lang=pl-PL' });
    expect(metadata.title).toBe('O nas');
  });

  it('declares no alternates for a page in one language', async () => {
    state.page = page({ alternates: [{ language: 'pl-PL', url: '/o-nas?lang=pl-PL' }], languages: ['pl-PL'] });
    const metadata = await route.generateMetadata({ params: Promise.resolve({ slug: ['o-nas'] }) });
    expect(metadata.alternates).toEqual({ canonical: '/o-nas?lang=pl-PL' });
  });
});
