/**
 * `/llms.txt` — what the shop is and where its public pages are, for AI
 * assistants: a generated base, then the sales channel's additional content
 * (`specs/144-seo-search-engine-robots/`, FR-024).
 *
 * The same shape as `app/robots.txt/route.ts`, for the same reasons: the file
 * depends on the request's sales channel and on configuration an operator can
 * change at any time, it carries an operator's text as written, and it has to
 * be able to answer `404` — on a channel that asks not to be indexed, and
 * while `seo` is switched off — and `503`. What is served, and why, is
 * `lib/seo/llms-txt.ts`; the generated base is `lib/seo/llms-txt-base.ts`.
 *
 * `force-dynamic` because the answer is per sales channel and per minute: Next
 * must neither prerender it at build time nor keep one answer for the address.
 */

import { readCrawlerFiles } from '../../lib/seo/crawler-policy';
import { llmsTxtResponse } from '../../lib/seo/llms-txt';
import { readUnservedPages } from '../../lib/seo/llms-txt-pages';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return llmsTxtResponse(request, { readCrawlerFiles, readUnservedPages });
}
