/**
 * `GET /robots.txt` — the decision, apart from the route file that serves it
 * (`specs/144-seo-search-engine-robots/contracts/crawler-policy.md` §4).
 *
 * ```text
 * <the system-generated rules, as lib/seo/robots-system-rules.ts renders them>
 * <a blank line>
 * <the sales channel's custom instructions>
 * ```
 *
 * The first part is this storefront's and is always served. The second is an
 * operator's, per sales channel, read from the `seo` module; with none, the
 * file is the first part byte for byte, which is what it was before operators
 * could add to it. The join is `composeCrawlerFile` from
 * `@endora-commerce/contracts` — the same function the Admin UI previews the
 * file with — and it is also where "the text as written" is defined: every
 * character is served unchanged, except that a line break is always a line
 * feed and the text ends with exactly one.
 *
 * ## The four answers
 *
 * | What is known about the channel | Served |
 * | --- | --- |
 * | its custom instructions, read now or remembered from an earlier read | `200`, the system rules and the instructions |
 * | that there are none — `seo` is switched off, or the backend has no such feature | `200`, the system rules alone |
 * | nothing: the backend could not be asked and never has been | **`503`** with `Retry-After` |
 * | `?part=system`, whatever is known | `200`, the system rules alone, **without asking** |
 *
 * ## Why the third row is a failure and not the system rules
 *
 * A page that cannot learn its channel's default robots is served anyway. This
 * file is different, on purpose (FR-022): a `200` is a complete statement of
 * what a crawler may fetch, so a `200` without an operator's `Disallow` lines
 * is permission the operator did not give — and nothing would show that it had
 * been given. A `503` is read by a search engine as "ask again later": it
 * keeps the copy it has and crawls no more than that allowed. No customer
 * reads this file, so the failure costs nobody a page.
 *
 * It lasts only until the first successful read — a process that has read a
 * channel's instructions once serves that version for as long as it cannot
 * read a newer one.
 *
 * ## What the default robots policy does here: nothing
 *
 * A channel set to `noindex` keeps an open `robots.txt` (FR-015). A crawler has
 * to be allowed to fetch a page in order to read that it must not be indexed;
 * closing the file would hide the directive that does the work. The policy is
 * in the answer this module reads and is not looked at.
 *
 * ## The text is an operator's, and it is served as text
 *
 * It reaches the response body and nothing else: the status, every header and
 * the content type are constants of this module. `text/plain` with `nosniff`
 * means no browser renders it, whatever it looks like.
 */

import { composeCrawlerFile } from '@endora-commerce/contracts/seo';

import type { CrawlerFilesRead } from './crawler-policy';
import { renderRobotsSystemRules } from './robots-system-rules';

/**
 * Marks a response as coming from a storefront that serves operator-configured
 * crawler files. On every answer of the handler, `503` included.
 *
 * A storefront older than this feature ignores `?part=system` and returns its
 * whole file. The Admin UI's preview tells the two apart by this header, so
 * that it never shows an operator's text appended to the file of a storefront
 * that will not append it.
 */
export const CRAWLER_FILES_CAPABILITY_HEADER = 'X-Endora-Crawler-Files';

/** How long a crawler is asked to wait before asking again, on `503`. */
export const ROBOTS_TXT_RETRY_AFTER_SECONDS = 120;

/**
 * The request header a sales channel is named in. A reverse proxy stamps it
 * per host; a storefront reached directly has none and the backend resolves
 * its system-default channel.
 */
const SALES_CHANNEL_HEADER = 'x-sales-channel';

export interface RobotsTxtDeps {
  /** The channel's crawler files, through the per-process reader. Never rejects. */
  readonly readCrawlerFiles: (channelCode: string | undefined) => Promise<CrawlerFilesRead>;
}

function headers(cacheControl: string): Headers {
  return new Headers({
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': cacheControl,
    // Plain text, and to be read as nothing else.
    'X-Content-Type-Options': 'nosniff',
    // The body is one sales channel's. A cache that keys on the address alone
    // would serve it for every channel behind that address.
    Vary: 'X-Sales-Channel',
    [CRAWLER_FILES_CAPABILITY_HEADER]: '1',
  });
}

function served(body: string): Response {
  // A minute, on top of the reader's own minute: a saved change is in every
  // crawler's reach within two.
  return new Response(body, { status: 200, headers: headers('public, max-age=60') });
}

export async function robotsTxtResponse(request: Request, deps: RobotsTxtDeps): Promise<Response> {
  const systemRules = renderRobotsSystemRules();

  // The system-generated rules alone. Answered from this storefront's own
  // sources, so it answers while the backend is down.
  if (new URL(request.url).searchParams.get('part') === 'system') return served(systemRules);

  const channelCode = request.headers.get(SALES_CHANNEL_HEADER) ?? undefined;
  const read = await deps.readCrawlerFiles(channelCode);

  if (read.kind === 'unknown') {
    const unavailable = headers('no-store');
    unavailable.set('Retry-After', String(ROBOTS_TXT_RETRY_AFTER_SECONDS));
    // Not a robots.txt, and not shaped like one: nothing here is a rule.
    return new Response('robots.txt is temporarily unavailable. Try again shortly.\n', {
      status: 503,
      headers: unavailable,
    });
  }

  if (read.kind === 'none') return served(systemRules);
  return served(composeCrawlerFile(systemRules, read.value.robotsTxtCustom));
}
