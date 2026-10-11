import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  ROBOTS_DEFAULT_REQUEST_HEADER,
  forwardRobotsDefault,
  isDocumentPath,
  robotsDirective,
} from '../../lib/seo/robots-directive';

/**
 * Which requests the middleware treats as documents, and what it forwards
 * (`specs/144-seo-search-engine-robots/contracts/crawler-policy.md` §6).
 *
 * The middleware's own effect is a `NextResponse` built in the edge runtime and
 * is measured against a booted build; what it *decides* is exported from
 * `lib/seo/robots-directive.ts` and asserted here, the way
 * `test/service-unavailable.test.tsx` holds the reachability gate.
 *
 * `config.matcher` has to be a literal — Next reads it without running the
 * file — so it is read here from the source text rather than imported.
 */

const MIDDLEWARE = fileURLToPath(new URL('../../middleware.ts', import.meta.url));

/** The string literals of `config.matcher`, read from the middleware's source. */
function declaredMatchers(): string[] {
  const source = ts.createSourceFile(
    MIDDLEWARE,
    readFileSync(MIDDLEWARE, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(source) === 'matcher' &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      for (const element of node.initializer.elements) {
        if (!ts.isStringLiteralLike(element)) {
          throw new Error('config.matcher must hold string literals only');
        }
        found.push(element.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Whether the middleware runs for `pathname` at all. */
function reachesMiddleware(pathname: string): boolean {
  return declaredMatchers().some((matcher) => new RegExp(`^${matcher}$`).test(pathname));
}

/**
 * The matcher this storefront had before the default robots policy existed.
 *
 * Written out once, here, as the fixture the document classification is held
 * to: every path that reached the middleware then was a document, and must
 * still be treated as one — it keeps its reachability gate, its `x-pathname`
 * and its `503` rewrite. If the classification is ever changed on purpose this
 * constant is what has to be argued with.
 */
const MATCHER_BEFORE =
  '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|woff|woff2|ttf|eot)$).*)';
const wasDocument = (pathname: string): boolean =>
  new RegExp(`^${MATCHER_BEFORE}$`).test(pathname);

const DOCUMENTS = [
  '/',
  '/p/x',
  '/p/pump-3000',
  '/c/pumps',
  '/cart',
  '/checkout',
  '/checkout/success',
  '/account/orders/42',
  '/blog',
  '/blog/first-post',
  '/pomoc/dostawa',
  '/search',
  '/service-unavailable',
  '/compare/share/abc',
  '/pwa/config',
  '/quick-order-template.csv',
  '/a.b/c',
  '/p/version-1.2',
];

const NON_DOCUMENTS = [
  '/robots.txt',
  '/sitemap.xml',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/_next/image',
  '/icons/x.png',
  '/icons/icon-192.png',
  '/brands/acme.svg',
  '/service-worker.js',
  '/photo.JPG'.toLowerCase(),
  '/fonts/inter.woff2',
  '/some/missing/file.css',
];

describe('isDocumentPath', () => {
  it.each(DOCUMENTS)('treats %s as a document', (pathname) => {
    expect(isDocumentPath(pathname)).toBe(true);
  });

  it.each(NON_DOCUMENTS)('treats %s as a file, not a document', (pathname) => {
    expect(isDocumentPath(pathname)).toBe(false);
  });

  it('agrees with the matcher this storefront had before, on every sample', () => {
    // The fixed lists above say what the answer is; this says where it comes
    // from. A path the old matcher let through was gated, labelled with
    // `x-pathname` and rewritten on an outage, and still is.
    for (const pathname of [...DOCUMENTS, ...NON_DOCUMENTS, '/_next/static/chunks/main.js']) {
      expect(isDocumentPath(pathname), pathname).toBe(wasDocument(pathname));
    }
    // And the samples really do fall on both sides of it.
    expect(DOCUMENTS.every(wasDocument)).toBe(true);
    expect(NON_DOCUMENTS.some(wasDocument)).toBe(false);
  });
});

describe('config.matcher', () => {
  it('is a single literal pattern', () => {
    expect(declaredMatchers()).toHaveLength(1);
  });

  it.each([...DOCUMENTS, ...NON_DOCUMENTS])('runs the middleware for %s', (pathname) => {
    // FR-014: the files a search engine can index — public files, the sitemap,
    // optimised images — carry the directive too, so the middleware has to see
    // them. Before this feature it saw none of NON_DOCUMENTS.
    expect(reachesMiddleware(pathname)).toBe(true);
  });

  it.each(['/_next/static/chunks/main-abc.js', '/_next/static/css/app.css', '/_next/static/media/x.woff2'])(
    'leaves the build-generated %s alone',
    (pathname) => {
      expect(reachesMiddleware(pathname)).toBe(false);
    },
  );

  it('still runs for every path the old matcher covered', () => {
    for (const pathname of DOCUMENTS) {
      expect(wasDocument(pathname) && reachesMiddleware(pathname), pathname).toBe(true);
    }
  });
});

describe('what the middleware forwards to the render', () => {
  const restrictive = robotsDirective({ kind: 'value', value: { index: false, follow: false } });

  it.each([
    ['there is no policy', { kind: 'none' }],
    ['the policy is unknown', { kind: 'unknown' }],
    ['the policy restricts nothing', { kind: 'value', value: { index: true, follow: true } }],
  ] as const)('deletes a client-supplied x-robots-default when %s', (_label, read) => {
    const headers = new Headers({
      [ROBOTS_DEFAULT_REQUEST_HEADER]: 'noindex, nofollow',
      cookie: 'a=b',
    });
    forwardRobotsDefault(headers, robotsDirective(read));
    expect(headers.has(ROBOTS_DEFAULT_REQUEST_HEADER)).toBe(false);
    // Nothing else the client sent is disturbed.
    expect(headers.get('cookie')).toBe('a=b');
  });

  it('overwrites a client-supplied value with the channel’s own', () => {
    const headers = new Headers({ [ROBOTS_DEFAULT_REQUEST_HEADER]: 'index, follow' });
    forwardRobotsDefault(headers, restrictive);
    expect(headers.get(ROBOTS_DEFAULT_REQUEST_HEADER)).toBe('noindex, nofollow');
  });
});
