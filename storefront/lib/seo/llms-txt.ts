/**
 * `GET /llms.txt` — the decision, apart from the route file that serves it
 * (`specs/144-seo-search-engine-robots/contracts/crawler-policy.md` §5;
 * FR-024 – FR-030).
 *
 * ```text
 * <the generated base, as lib/seo/llms-txt-base.ts renders it>
 * <a blank line>
 * <the sales channel's additional content>
 * ```
 *
 * The same shape as `robots.txt`, on purpose: what this storefront can say on
 * its own, then what an operator added, joined by the one function both files
 * and the Admin UI's preview share (`composeCrawlerFile`), read through the
 * one per-process reader (`crawler-policy.ts`). Nothing here is a second cache
 * or a second rule for the join.
 *
 * ## Where it differs from `robots.txt`: this file can be withdrawn
 *
 * `robots.txt` is always served — a crawler must be able to read what it may
 * fetch. `llms.txt` is an invitation, and an invitation is not extended by a
 * shop that asks to be left out:
 *
 * | What is known about the channel | Served |
 * | --- | --- |
 * | it may be indexed, and its content was read now or is remembered | `200`, the base and the content |
 * | its default robots forbids indexing | **`404`**, whatever the content holds (FR-027) |
 * | there is no such feature — `seo` is switched off, or the backend has none | **`404`** (FR-030) |
 * | nothing: the backend could not be asked and never has been | **`503`** with `Retry-After` |
 * | its default robots, or its content, is stored as something nobody can read | **`503`** with `Retry-After` |
 *
 * `?part=base` answers the base alone, `no-store`, under exactly the same
 * conditions — it is what the Admin UI's preview is built from, and a preview
 * of a file that is not served says so instead of showing one.
 *
 * ## Why "cannot tell" is a failure and never the file
 *
 * Publishing an invitation on a channel that may have been set to `noindex`
 * is the worse of the two mistakes, and a `200` with the base alone would be a
 * file that silently omits what the operator wrote (FR-022). So every way of
 * not knowing answers `503`, which a reader takes as "ask again later".
 *
 * The last row is the backend naming what it could not read rather than
 * failing its whole answer (`CrawlerFiles.unreadable`). It does that so that
 * `robots.txt`, which needs neither thing, survives a default robots row
 * holding a value nobody can interpret; this file needs both. The two
 * booleans say "do not index" in that case, but that is the safe reading of
 * an unknown, not a decision anybody took — hence "ask again later" rather
 * than "there is no such file".
 *
 * Only indexing withdraws the file. A channel that allows indexing and
 * forbids following links still has one: `nofollow` is about the links on a
 * page a crawler has fetched.
 */

import { composeCrawlerFile } from '@endora-commerce/contracts/seo';

import {
  crawlerFileGeneratedPart,
  crawlerFileHeaders,
  crawlerFileServed,
  crawlerFileUnavailable,
  requestChannelCode,
} from './crawler-file-response';
import {
  UNREADABLE_LLMS_TXT,
  UNREADABLE_POLICY,
  type CrawlerFiles,
  type CrawlerFilesRead,
} from './crawler-policy';
import { LLMS_TXT_CONDITIONAL_PAGES, renderLlmsTxtBase } from './llms-txt-base';

/** Which listed pages this storefront does not serve for a channel right now. */
export interface UnservedPages {
  /** Members of `LLMS_TXT_CONDITIONAL_PAGES`. */
  readonly paths: readonly string[];
  /**
   * `false` when a page could not be asked about and was counted as unserved
   * to be safe. Such an answer is used for the request in hand and not kept.
   */
  readonly certain: boolean;
}

export interface LlmsTxtDeps {
  /** The channel's crawler files, through the per-process reader. Never rejects. */
  readonly readCrawlerFiles: (channelCode: string | undefined) => Promise<CrawlerFilesRead>;
  /** See {@link UnservedPages}. May reject; a rejection is "could not ask". */
  readonly readUnservedPages: (channelCode: string | undefined) => Promise<UnservedPages>;
}

/** Every page that can be absent, counted absent: the answer when none could be asked about. */
const NOTHING_CONFIRMED: UnservedPages = {
  paths: Object.keys(LLMS_TXT_CONDITIONAL_PAGES),
  certain: false,
};

/**
 * What was worked out for a configuration, kept for as long as the reader
 * holds that configuration.
 *
 * Keyed by the configuration **object**, as `robots-txt.ts` keys its own: the
 * reader hands out the same object for a channel until a read replaces it —
 * within a minute or two — so what is kept cannot outlive the configuration it
 * was made for, cannot be another channel's, and is collected with the cache
 * entry it belongs to. This is how the question about pages is asked once per
 * refresh rather than once per request, without a cache of its own.
 */
const kept = new WeakMap<
  CrawlerFiles,
  { unserved?: UnservedPages; composed?: { base: string; body: string } }
>();

function notFound(): Response {
  // `no-store`: a file that has been withdrawn must be seen withdrawn, and one
  // that has been allowed again must be seen back, without waiting on a cache.
  return new Response('Not found.\n', { status: 404, headers: crawlerFileHeaders('no-store') });
}

export async function llmsTxtResponse(request: Request, deps: LlmsTxtDeps): Promise<Response> {
  const channelCode = requestChannelCode(request);
  const read = await deps.readCrawlerFiles(channelCode);

  if (read.kind === 'unknown') return crawlerFileUnavailable('llms.txt');
  if (read.kind === 'none') return notFound();

  const configuration = read.value;
  const unreadable = configuration.unreadable ?? [];
  if (unreadable.includes(UNREADABLE_POLICY) || unreadable.includes(UNREADABLE_LLMS_TXT)) {
    return crawlerFileUnavailable('llms.txt');
  }
  if (!configuration.index) return notFound();

  const memo = kept.get(configuration) ?? {};
  kept.set(configuration, memo);

  let unserved = memo.unserved;
  if (unserved === undefined) {
    unserved = await deps.readUnservedPages(channelCode).catch(() => NOTHING_CONFIRMED);
    if (unserved.certain) memo.unserved = unserved;
  }

  // Rendered per request and compared with what was kept, not assumed: the
  // origin is read from the environment, and the pages may have just changed.
  const base = renderLlmsTxtBase({
    shopName: configuration.shop.name,
    unservedPaths: unserved.paths,
  });

  if (new URL(request.url).searchParams.get('part') === 'base') {
    return crawlerFileGeneratedPart(base);
  }

  if (memo.composed === undefined || memo.composed.base !== base) {
    memo.composed = { base, body: composeCrawlerFile(base, configuration.llmsTxtAdditional) };
  }
  return crawlerFileServed(memo.composed.body);
}
