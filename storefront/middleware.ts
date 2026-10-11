import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { backendReachability } from './lib/api/backend-reachability';
import {
  RETRY_AFTER_SECONDS,
  SERVICE_UNAVAILABLE_PATH,
  UNAVAILABLE_HEADER,
  UNAVAILABLE_RETRY_HEADER,
  gateDecision,
  safeRetryTarget,
} from './lib/service-unavailable';
import { readRobotsPolicy } from './lib/seo/crawler-policy';
import {
  forwardRobotsDefault,
  isDocumentPath,
  robotsDirective,
  stampRobotsResponse,
  type RobotsDirective,
} from './lib/seo/robots-directive';

/**
 * Forwards the incoming request's pathname as `x-pathname` so server
 * components (which don't otherwise receive the pathname) can branch on it.
 * Used by the root layout to render the **minimal checkout chrome**
 * (logo-only header, no Megamenu / Footer) on `/checkout*` routes per
 * feature 036 US5.
 *
 * ## It is the one seam that puts a channel's default robots on a response
 *
 * An operator chooses, per sales channel, what search engines are told about
 * the whole storefront (`specs/144-seo-search-engine-robots/`). That choice
 * reaches a response here and nowhere else: as an `X-Robots-Tag` header on
 * everything this function sees, and as a request header from which the root
 * layout renders one extra `<meta name="robots">`. No route file takes part,
 * which is what keeps a route's own declaration the route's own.
 *
 * So the matcher covers everything except `/_next/static` — the files a search
 * engine can index include the sitemap, the optimised images and what is under
 * `public/`, and no other seam can add a per-channel header to those. The
 * function **branches first**: a path that is not a document gets the header
 * and nothing else — no reachability probe, no `x-pathname`, no rewrite — and
 * is otherwise served exactly as before. `isDocumentPath` is the matcher this
 * file had before it was widened, so "document" means what it always meant.
 *
 * The policy is read through a per-process cache (`lib/seo/crawler-policy.ts`)
 * that never rejects: a backend that cannot be asked costs a page nothing.
 *
 * ## It is also the storefront's status line for an unreachable backend
 *
 * A Next 15 App Router page render cannot answer `503` — measured, with the
 * evidence in `lib/api/backend-reachability.ts`' doc block — and middleware is
 * the one seam in front of the render that can. So the reachability gate lives
 * here, and it covers **every route the matcher covers**, which is every
 * document this storefront serves: a shop whose API is down is down on `/p/…`
 * and `/cart` exactly as it is on `/`, and the defect was only ever *measured*
 * on `/`.
 *
 * A rewrite rather than a redirect, deliberately. The buyer's URL is not wrong
 * and has not moved; it is momentarily unserveable, which is what `503` says.
 * A redirect would put `/service-unavailable` in the address bar, lose the page
 * they asked for, and — per
 * `specs/108-storefront-response-status/contracts/response-status.md` §3.1 —
 * claim a move that did not happen. `NextResponse.rewrite(target, { status })`
 * was measured to answer that status carrying the fully server-rendered
 * document at `target`, which is what makes this possible at all.
 *
 * **This gate never inspects an error the application raised.** It asks a
 * question only the transport can answer, so an application defect keeps
 * throwing and keeps answering `500` — see the discrimination section of
 * `backend-reachability.ts`.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  const channelCode = request.headers.get('x-sales-channel') ?? undefined;
  const requestHeaders = new Headers(request.headers);

  if (!isDocumentPath(pathname)) {
    // A file, not a page. The directive, and the same care with the request
    // header as below — a missing file is answered by the not-found page, which
    // the root layout renders — and nothing else.
    const directive = robotsDirective(await readRobotsPolicy(channelCode));
    forwardRobotsDefault(requestHeaders, directive);
    return withRobots(NextResponse.next({ request: { headers: requestHeaders } }), directive);
  }

  requestHeaders.set('x-pathname', pathname);

  const decision = gateDecision({
    pathname,
    prefetch: request.headers.get('next-router-prefetch') !== null,
  });
  // Asked together: neither waits for the other, so a document costs one round
  // of latency however many questions the middleware has for the backend.
  const [policy, reachability] = await Promise.all([
    readRobotsPolicy(channelCode),
    decision === 'ask' ? backendReachability() : Promise.resolve(null),
  ]);
  const directive = robotsDirective(policy);
  // Written or deleted on every request, so the layout never reads a value a
  // client supplied.
  forwardRobotsDefault(requestHeaders, directive);

  if (decision === 'unavailable' || reachability === 'unreachable') {
    // The outage notice is a document of this channel like any other: it
    // carries the directive whenever one is known.
    return withRobots(unavailable(request, requestHeaders), directive);
  }

  return withRobots(NextResponse.next({ request: { headers: requestHeaders } }), directive);
}

function withRobots(response: NextResponse, directive: RobotsDirective | null): NextResponse {
  stampRobotsResponse(response.headers, directive);
  return response;
}

function unavailable(request: NextRequest, requestHeaders: Headers): NextResponse {
  requestHeaders.set(UNAVAILABLE_HEADER, '1');
  requestHeaders.set(
    UNAVAILABLE_RETRY_HEADER,
    safeRetryTarget(`${request.nextUrl.pathname}${request.nextUrl.search}`),
  );
  return NextResponse.rewrite(new URL(SERVICE_UNAVAILABLE_PATH, request.url), {
    status: 503,
    headers: {
      'Retry-After': String(RETRY_AFTER_SECONDS),
      // A 503 that a shared cache kept would outlive the outage it reports.
      'Cache-Control': 'no-store',
    },
    request: { headers: requestHeaders },
  });
}

/**
 * Everything except the build's own script and style files.
 *
 * A literal, because Next reads `config` without running this file. What is a
 * *document* among the paths it lets through is `isDocumentPath`'s to say.
 */
export const config = {
  matcher: ['/((?!_next/static).*)'],
};
