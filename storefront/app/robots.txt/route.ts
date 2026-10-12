/**
 * `/robots.txt` — the system-generated rules, then the sales channel's custom
 * instructions (`specs/144-seo-search-engine-robots/`).
 *
 * A Route Handler rather than the `app/robots.ts` metadata file this replaced:
 * the file now depends on the request's sales channel and on configuration an
 * operator can change at any time, it carries an operator's text as written,
 * and it has to be able to answer `503` — none of which a `MetadataRoute.Robots`
 * object can do. What is served, and why, is `lib/seo/robots-txt.ts`; the rules
 * themselves are `lib/seo/robots-system-rules.ts`.
 *
 * `force-dynamic` because the answer is per sales channel and per minute: Next
 * must neither prerender it at build time, as it did the metadata file, nor
 * keep one answer for the address.
 */

import { readCrawlerFiles } from '../../lib/seo/crawler-policy';
import { robotsTxtResponse } from '../../lib/seo/robots-txt';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return robotsTxtResponse(request, { readCrawlerFiles });
}
