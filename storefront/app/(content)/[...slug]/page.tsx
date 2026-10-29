import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import type { CmsResolvedPage } from '@endora-commerce/contracts';
import { Breadcrumbs, type BreadcrumbCrumb } from '../../../components/Breadcrumbs';
import { CmsPageRenderer } from '../../../components/CmsPageRenderer';
import { OrganizationJsonLd } from '../../../components/seo/OrganizationJsonLd';
import { getCmsPageBySlug, normalizeCmsUrlPath } from '../../../lib/api/cms';
import { getHomepageConfig } from '../../../lib/api/homepage';
import { tForLocale } from '../../../lib/i18n/messages';
import { requestedLanguage } from '../../../lib/i18n/requested-language';
import { getServerContext } from '../../../lib/server-context';
import { cmsSocialMetadata } from '../../../lib/seo/cms-share-metadata';
import { canonicalPath } from '../../../lib/seo/route-seo';
import { cmsRenderLocation, type PageSearchParams } from '../../../lib/page-builder/render-location';
import { seo } from './seo';

interface PageProps {
  params: Promise<{ slug: string[] }>;
  /** `lang` — the language a link asked for (R24), as on a product page. */
  searchParams?: Promise<PageSearchParams & { lang?: string | string[] }>;
}

/**
 * A CMS page, at the one address it has
 * (`specs/105-cms-root-page-urls/contracts/cms-page-url.md` §1).
 *
 * The row is resolved through `GET /api/v1/cms/pages/by-slug`, carrying the
 * request's language, so the backend narrows the served language against the
 * page's own and the channel's default and returns exactly one (§3.1 — case 1
 * of `specs/094-translation-boundary/`, where the reader's language is
 * resolvable at the moment the response is composed).
 *
 * There is no second CMS route type and no second renderer: `/cms/{path}` is a
 * permanent redirect configured in `next.config.js`, and the page-builder tree
 * is rendered by `CmsPageRenderer` here exactly as it is on the home page.
 */

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const search = (await searchParams) ?? {};
  const path = normalizeCmsUrlPath(slug.join('/'));
  const { ctx } = await getServerContext({ langOverride: requestedLanguage(search.lang) });
  const page = await getCmsPageBySlug(path, ctx);
  if (!page) return { title: 'Not found', robots: { index: false, follow: false } };
  // R19D: the canonical address is the page's public path, which differs from
  // the request for the flat slug of a nested page (that request redirects).
  // R24: it is the backend's URL for the served language — the path in that
  // language, with `?lang=` when it is not the channel default; the fallback
  // covers an answer cached before the field existed.
  const canonical = page.url ?? canonicalPath(seo.route, { slug: publicPath(page, path).split('/') });
  const languages = hreflangAlternates(page);
  // Feature 163 (FR-033, FR-034): the sharing card — image, locale and its
  // alternates.
  const social = cmsSocialMetadata(page, canonical);
  return {
    title: social.title,
    description: page.meta.description ?? undefined,
    keywords: page.meta.keywords ?? undefined,
    // Indexable (FR-010/FR-012). R24: each language at its own URL, so the
    // languages are `hreflang` alternates — only when there are several.
    alternates: { canonical, ...(languages ? { languages } : {}) },
    openGraph: social.openGraph,
    twitter: social.twitter,
  };
}

export default async function CmsContentPage({ params, searchParams }: PageProps): Promise<ReactNode> {
  const { slug } = await params;
  const query = (await searchParams) ?? {};
  const path = normalizeCmsUrlPath(slug.join('/'));
  const { ctx, locale, modules } = await getServerContext({ langOverride: requestedLanguage(query.lang) });
  const t = tForLocale(locale);
  const [page, { cmsPageSlug }] = await Promise.all([
    getCmsPageBySlug(path, ctx),
    getHomepageConfig(ctx),
  ]);
  if (!page) notFound();

  // The page an operator selected as the home page is served at `/` and
  // nowhere else (contract §1.3): the row does not gain a second address, it
  // changes which one it has. Answered in the page component rather than in
  // `generateMetadata` (§2.2) — a redirect here discards the metadata result,
  // so there is one place and nothing to keep in sync. It is asked *after* the
  // row resolves, so a home-page setting naming a page this channel does not
  // publish still answers 404 rather than redirecting to a different document.
  //
  // **It reaches every consumer, and that took the deletion of a file three
  // directories up.** Until `specs/108-storefront-response-status/` the
  // response was `200` carrying `NEXT_REDIRECT;replace;/;308;` in the RSC
  // payload — no `Location`, no `Refresh`, no canonical — because
  // `app/loading.tsx` put every page inside a Suspense boundary and the shell
  // was flushed before this component resolved. There was nothing this line
  // could have been written differently to fix; the boundary is gone, and it
  // may not come back above a page that decides a status
  // (`check:storefront-indexability`'s `status-decision-under-a-boundary`).
  //
  // R19D: a nested page is the home page by its path or by its flat slug —
  // the setting names a slug, and the page may be asked for by its path.
  const canonical = publicPath(page, path);
  const flatSlugs = page.path && page.path !== page.slug ? [normalizeCmsUrlPath(page.slug)] : [];
  if (cmsPageSlug !== null && [path, canonical, ...flatSlugs].includes(normalizeCmsUrlPath(cmsPageSlug))) {
    permanentRedirect('/');
  }

  // R19D (T285): one address per page. The flat slug of a page served under
  // its parent's path still resolves, and answers a permanent redirect to it.
  // R24: one address per page *and language* — the slug of another language
  // (a reader who switched language) answers a redirect to the served one's
  // URL, which the backend built, `?lang=` included.
  if (canonical !== path) permanentRedirect(page.url ?? `/${canonical}`);

  // Feature 163 (FR-030, FR-031): Home › the ancestors the backend resolved for
  // this channel › the page. An ancestor this channel does not serve arrives
  // with `slug: null` and renders as text. `?? DEFAULT_BREADCRUMBS` covers an
  // answer cached before the field existed — today's trail, shown and light.
  const breadcrumbs = page.breadcrumbs ?? DEFAULT_BREADCRUMBS;
  const crumbs: BreadcrumbCrumb[] = [
    { href: '/', label: t('nav.home') },
    // R19D: an ancestor links to its public path; `?? crumb.slug` covers an
    // answer cached before the field existed.
    ...breadcrumbs.trail.map((crumb) => {
      const target = crumb.path ?? crumb.slug;
      return { href: target !== null ? `/${normalizeCmsUrlPath(target)}` : null, label: crumb.name };
    }),
    { href: `/${path}`, label: page.name },
  ];

  // R24 — `?lang=` writes this page in the override's language, which the root
  // layout's `<html lang>` does not know (L-1), so the page marks its own
  // content's language (WCAG 3.1.2), as the product page does (T155, B3).
  // `contents`: the wrapper draws no box, so the sections lay out as before.
  return (
    <div lang={page.language} className="contents">
      {/* Feature 163 (FR-035): the organisation's data on every CMS page, not only on `/`. */}
      <OrganizationJsonLd ctx={ctx} />
      {breadcrumbs.visible && breadcrumbs.overlay === true ? (
        // R21H (T355): the trail over the first section — a zero-height layer
        // holding it absolutely in the brand container, so nothing below moves
        // down and no band is painted; the scheme binds its colours (dark for a
        // light trail on a dark hero). The space it needs is the first
        // section's own top padding, which the editor sets.
        <div data-cmsb-scheme={breadcrumbs.scheme} data-breadcrumbs-overlay="" className="relative z-20 h-0">
          <div className="absolute inset-x-0 top-0 mx-auto max-w-[var(--cmsb-container,1360px)] px-[var(--cmsb-gutter,24px)] pt-[24px] max-md:pt-[16px]">
            <Breadcrumbs crumbs={crumbs} scheme={breadcrumbs.scheme} />
          </div>
        </div>
      ) : breadcrumbs.visible ? (
        // The scheme binds the brand's `--cmsb-*` colours for the trail. Light,
        // the default, paints nothing, so a page that never chose a scheme looks
        // as it did; muted and dark paint a full-width band. R19C (T267): the
        // band owns its spacing — its bottom padding replaces the trail's
        // margin, which would collapse out of the band. R19C (T268): the trail
        // sits in the brand's page container and gutter, as the content does.
        <div
          data-cmsb-scheme={breadcrumbs.scheme}
          className={breadcrumbs.scheme === 'light' ? undefined : 'bg-[var(--cmsb-bg,#ffffff)]'}
        >
          <div
            className={
              breadcrumbs.scheme === 'light'
                ? 'mx-auto max-w-[var(--cmsb-container,1360px)] px-[var(--cmsb-gutter,24px)] pt-[24px] max-md:pt-[16px]'
                : 'mx-auto max-w-[var(--cmsb-container,1360px)] px-[var(--cmsb-gutter,24px)] pt-[24px] pb-[16px] max-md:pt-[16px]'
            }
          >
            <Breadcrumbs crumbs={crumbs} scheme={breadcrumbs.scheme} />
          </div>
        </div>
      ) : null}
      <CmsPageRenderer page={page} ctx={ctx} modules={modules} location={cmsRenderLocation(`/${path}`, query)} />
    </div>
  );
}

const DEFAULT_BREADCRUMBS: CmsResolvedPage['breadcrumbs'] = { visible: true, scheme: 'light', trail: [] };

/**
 * The `hreflang` alternates (R24): the backend's URL of every language the page
 * is served in, or `undefined` for a page in one language — and for an answer
 * cached before the field existed.
 */
function hreflangAlternates(page: CmsResolvedPage): Record<string, string> | undefined {
  const alternates = page.alternates ?? [];
  if (alternates.length < 2) return undefined;
  return Object.fromEntries(alternates.map((alternate) => [alternate.language, alternate.url]));
}

/**
 * The page's one address (R19D): the public path the backend resolved for this
 * channel, else — an answer cached before the field existed — the path asked.
 */
function publicPath(page: CmsResolvedPage, requested: string): string {
  return page.path ? normalizeCmsUrlPath(page.path) : requested;
}
