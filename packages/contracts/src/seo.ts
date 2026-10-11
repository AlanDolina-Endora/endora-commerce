import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common.js';

/**
 * SEO meta + sitemap contracts (T235 / FR-101, FR-102).
 *
 * The `entityType` enum is closed — only entities the storefront actually
 * renders public pages for can carry meta overrides.
 */

export const seoEntityTypeSchema = z.enum(['product', 'category', 'cms_page']);
export type SeoEntityType = z.infer<typeof seoEntityTypeSchema>;

export const resolvedMetaSchema = z.object({
  title: z.string(),
  description: z.string(),
  openGraph: z.object({
    title: z.string(),
    description: z.string(),
    image: z.string().nullable(),
  }),
  /** Whether the resolved values came from a stored override or the rule. */
  source: z.enum(['override', 'rule']),
  locale: z.string(),
});
export type ResolvedMeta = z.infer<typeof resolvedMetaSchema>;

export const seoMetaOverrideSchema = z.object({
  id: uuidSchema,
  entityType: seoEntityTypeSchema,
  entityId: uuidSchema,
  locale: z.string().min(2).max(10),
  title: z.string().nullable(),
  description: z.string().nullable(),
  ogTitle: z.string().nullable(),
  ogDescription: z.string().nullable(),
  ogImageUrl: z.string().url().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const upsertSeoMetaOverrideRequestSchema = z.object({
  locale: z.string().min(2).max(10),
  title: z.string().min(1).max(160).nullable().optional(),
  description: z.string().min(1).max(400).nullable().optional(),
  ogTitle: z.string().min(1).max(160).nullable().optional(),
  ogDescription: z.string().min(1).max(400).nullable().optional(),
  ogImageUrl: z.string().url().nullable().optional(),
});
export type UpsertSeoMetaOverrideRequest = z.infer<typeof upsertSeoMetaOverrideRequestSchema>;

export const sitemapStatusSchema = z.object({
  generatedAt: isoDateTimeSchema.nullable(),
  byteSize: z.number().int().nonnegative().nullable(),
  urlCount: z.number().int().nonnegative().nullable(),
});
export type SitemapStatus = z.infer<typeof sitemapStatusSchema>;

/**
 * Per-channel sitemap row returned by the admin list endpoint
 * (`GET /api/v1/admin/seo/sitemap`). One row per active sales channel —
 * each carries its own cache (regenerate, preview and download act on a
 * single channel) and its own resolved storefront URL.
 */
export const sitemapChannelStatusSchema = sitemapStatusSchema.extend({
  salesChannelCode: z.string(),
  salesChannelName: z.string(),
  storefrontUrl: z.string(),
  storefrontUrlSource: z.enum(['setting', 'env', 'fallback']),
});
export type SitemapChannelStatus = z.infer<typeof sitemapChannelStatusSchema>;

export const sitemapChannelListResponseSchema = z.object({
  data: z.array(sitemapChannelStatusSchema),
});
export type SitemapChannelListResponse = z.infer<typeof sitemapChannelListResponseSchema>;

/**
 * A sales channel's default robots policy, as the storefront reads it from
 * `GET /api/v1/storefront/seo/robots-policy`.
 *
 * Two booleans and nothing else. The operator's choice is stored by `seo` as a
 * token (`NOINDEX, FOLLOW` …); that spelling is the module's own and never
 * crosses the wire, so a consumer branches on `index` and `follow` and the
 * stored vocabulary can change without a storefront noticing.
 *
 * **Strict about what it reads, tolerant of what it does not know.** `index`
 * and `follow` must both be present and must both be booleans: a storefront
 * validates the answer against this schema and treats a body that fails it as
 * unreadable, and a policy with half of it missing is not one to guess at.
 *
 * A member this schema does not name is **dropped, not refused**. A storefront
 * is deployed separately from its backend and is usually the older of the two;
 * were an unknown member a failure, the first backend release to add a field
 * here would make every storefront already in the field read the answer as
 * unreadable — and a freshly started one would then serve a `noindex` channel
 * with no directive at all, with nothing to say why. Additive changes to this
 * response are therefore safe by construction, and a consumer never sees a
 * member it was not written for.
 */
export const storefrontRobotsPolicySchema = z.object({
  /** `false` asks search engines not to index the channel's storefront. */
  index: z.boolean(),
  /** `false` asks search engines not to follow the links on its pages. */
  follow: z.boolean(),
});
export type StorefrontRobotsPolicy = z.infer<typeof storefrontRobotsPolicySchema>;

export const storefrontRobotsPolicyResponseSchema = z.object({
  data: storefrontRobotsPolicySchema,
});
export type StorefrontRobotsPolicyResponse = z.infer<typeof storefrontRobotsPolicyResponseSchema>;

/**
 * The most an operator may save as custom `robots.txt` instructions or as
 * additional `llms.txt` content, per sales channel: 64 KiB of UTF-8.
 *
 * **Bytes, not characters** — it bounds the file a crawler downloads, and one
 * character is up to four bytes. The `seo` module refuses a larger text when
 * it is saved. Search engines read the first 500 KiB of a `robots.txt`; the
 * system-generated rules are under 1 KiB, so the whole file stays well inside
 * that.
 */
export const CRAWLER_TEXT_MAX_BYTES = 65_536;

/**
 * What a sales channel's crawler files are built from, as the storefront reads
 * it from `GET /api/v1/storefront/seo/crawler-files`.
 *
 * The two texts are the values resolved for the channel — its own, else the
 * all-channels value, else empty — **exactly as stored**: the backend changes
 * no character of them, line breaks included. What a served file does with
 * them is {@link composeCrawlerFile}'s to say.
 *
 * `index` and `follow` repeat the robots policy so that a file whose existence
 * depends on it needs one read rather than two.
 *
 * Strict about the members it names and tolerant of any it does not, for the
 * reason given at {@link storefrontRobotsPolicySchema}. The `max` on the texts
 * is in characters and is deliberately the looser test: a text within the byte
 * limit never has more characters than that, so a longer one did not come
 * through the door that enforces the limit, and a storefront treats the answer
 * as unreadable rather than serve it.
 */
export const storefrontCrawlerFilesSchema = storefrontRobotsPolicySchema.extend({
  /** The operator's `robots.txt` instructions, or `''`. */
  robotsTxtCustom: z.string().max(CRAWLER_TEXT_MAX_BYTES),
  /** The operator's additional `llms.txt` content, or `''`. */
  llmsTxtAdditional: z.string().max(CRAWLER_TEXT_MAX_BYTES),
  shop: z.object({
    /** The channel's configured shop name, or `''` when none is set. */
    name: z.string(),
  }),
});
export type StorefrontCrawlerFiles = z.infer<typeof storefrontCrawlerFilesSchema>;

export const storefrontCrawlerFilesResponseSchema = z.object({
  data: storefrontCrawlerFilesSchema,
});
export type StorefrontCrawlerFilesResponse = z.infer<typeof storefrontCrawlerFilesResponseSchema>;

/**
 * A crawler file: the part the storefront generates, then the part an operator
 * wrote.
 *
 * One function, shared by the storefront that serves the file and by the Admin
 * UI that previews it, so the two cannot come to disagree about the join.
 *
 *  * `extra` empty or made only of whitespace → `base`, **byte for byte**. An
 *    instance nobody configured serves exactly what it generated.
 *  * otherwise → `base` ending in one line break, one blank line, `extra`, one
 *    line break.
 *
 * ## What happens to `extra` — the definition of "verbatim"
 *
 * Every character of it is kept, unchanged and in order — indentation,
 * trailing spaces, blank lines, comments, anything that is not a line break at
 * all. Two things are normalised, and both are about line breaks:
 *
 *  * **every line break is served as a line feed**, whether it was stored as
 *    `LF`, `CRLF` or a lone `CR`. A browser's text field sends `LF`; the
 *    settings API stores what it is sent, so a client that sends `CRLF` stores
 *    `CRLF`. Without this, one file would carry two conventions — the
 *    generated part's and the operator's — and the same text would be served
 *    as different bytes depending on which client saved it;
 *  * **line breaks at the end of the text become exactly one**, so the file
 *    always ends with a single line break.
 *
 * And one thing is removed that is not a line break: **a single byte order
 * mark (`U+FEFF`) at the very start of the text.** Editors put one there
 * unseen. Served, it is glued to the first line, and a crawler does not
 * recognise `\uFEFFUser-agent: …` as the start of a group — so the rules
 * under it attach to the group above, which is the generated one for every
 * crawler, and a `Disallow: /` written for one crawler would close the site
 * to all of them. Exactly one, and only there: a second one, or one anywhere
 * else in the text, is the operator's character like any other.
 *
 * `base` is never altered apart from the line breaks it ends with.
 *
 * ## Its cost is proportional to the text
 *
 * It runs for every request of a public file, on text an operator saved, so
 * it must not be possible to write a text that makes it slow. The trailing
 * line breaks are therefore counted from the end rather than matched with
 * `/\n+$/`: that pattern re-scans a run of line breaks from each of its
 * positions when the run is not at the end, and took four and a half seconds
 * on 64 KiB of them — during which a single-threaded server answers nobody.
 * `seo.test.ts` holds the function to a time bound on such texts.
 */
export function composeCrawlerFile(base: string, extra: string): string {
  const written = extra.charCodeAt(0) === BYTE_ORDER_MARK ? extra.slice(1) : extra;
  if (written.trim().length === 0) return base;
  // One pass, no backtracking: a `\r` is consumed with the `\n` after it, if any.
  const text = withoutTrailingLineFeeds(written.replace(/\r\n?/g, '\n'));
  return `${withoutTrailingLineFeeds(base)}\n\n${text}\n`;
}

const BYTE_ORDER_MARK = 0xfeff;
const LINE_FEED = 0x0a;

/** `text` without the line feeds it ends with. Linear in their number. */
function withoutTrailingLineFeeds(text: string): string {
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) === LINE_FEED) end -= 1;
  return end === text.length ? text : text.slice(0, end);
}

/**
 * Container name: `seoMetaWritePort`. Owner: `seo`.
 *
 * Narrow write surface for PIM importers (feature 089 / FR-029): upsert product
 * meta overrides by locale. Channel dimension does not exist on Endora SEO rows.
 *
 * **Owner off:** resolving this port throws `ModuleDisabledError` (503).
 */
export interface SeoMetaWritePort {
  upsertProductMeta(input: {
    productId: string;
    locale: string;
    title?: string | null;
    description?: string | null;
  }): Promise<void>;
}
