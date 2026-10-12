import { CRAWLER_TEXT_MAX_BYTES, type StorefrontCrawlerFiles } from '@endora-commerce/contracts';
import { z } from 'zod';
import { DEFAULT_ROBOTS_SETTING_CODE, robotsPolicyForToken } from './robots-policy.js';

/**
 * What a sales channel's crawler files are built from
 * (`specs/144-seo-search-engine-robots/contracts/crawler-policy.md` §2).
 *
 * The storefront owns the files: it generates the system rules, joins the
 * operator's text to them and serves the result. This module owns what the
 * operator configured, and answers it for one channel at a time.
 *
 * ## The text leaves here exactly as it was stored
 *
 * No trimming and no line-break rewriting. What a served file does with the
 * text is `composeCrawlerFile`'s to say, in `@endora-commerce/contracts`, where
 * the storefront and the Admin UI's preview both read it; rewriting here as
 * well would be a second definition of the same thing.
 *
 * ## It throws rather than answer something it cannot stand behind
 *
 * Every answer at `200` is definitive to a storefront: it replaces whatever
 * the storefront knew. So a stored value that cannot be read as a text, a text
 * longer than the write door accepts, and a robots value outside the four
 * choices are all a throw — the endpoint answers `500`, the storefront keeps
 * the file it last served, and a storefront that knows nothing answers
 * `robots.txt` with a temporary failure instead of a file that silently omits
 * the operator's instructions (FR-022).
 */

/** The setting an operator edits, per sales channel. */
export const ROBOTS_TXT_CUSTOM_SETTING_CODE = 'seo.robots_txt_custom';

/**
 * The shop's public name. Declared by the `settings` module; read here through
 * the settings store like any other value, never through that module's route
 * or resolver.
 */
const SHOP_NAME_SETTING_CODE = 'shop.name';

/** The reads this service makes of the settings store. */
export interface CrawlerFilesSettingsPort {
  get<T>(code: string, salesChannelId: string, schema: z.ZodType<T>): Promise<T>;
  getMany(
    codes: string[],
    salesChannelId: string,
  ): Promise<Map<string, { ok: true; value: unknown } | { ok: false }>>;
}

/**
 * A stored crawler text is longer than {@link CRAWLER_TEXT_MAX_BYTES}.
 *
 * The settings API refuses such a text when it is saved
 * (`crawler-text-validator.ts`), so this takes a row written around it — an
 * import, or a hand-edited database.
 */
export class StoredCrawlerTextTooLargeError extends Error {
  constructor(
    readonly settingCode: string,
    readonly actualBytes: number,
  ) {
    super(
      `"${settingCode}" holds a text of ${actualBytes} bytes, which is more than the ` +
        `${CRAWLER_TEXT_MAX_BYTES} bytes that can be saved and is not served.`,
    );
    this.name = 'StoredCrawlerTextTooLargeError';
  }
}

/**
 * A crawler text as it resolves for one sales channel, or a throw when it is
 * longer than can be saved. The storefront's read and the Admin UI's preview
 * both go through it, so the preview never shows a text the storefront would
 * refuse to serve.
 */
export async function storedCrawlerText(
  settings: Pick<CrawlerFilesSettingsPort, 'get'>,
  code: string,
  salesChannelId: string,
): Promise<string> {
  const text = await settings.get(code, salesChannelId, z.string());
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > CRAWLER_TEXT_MAX_BYTES) throw new StoredCrawlerTextTooLargeError(code, bytes);
  return text;
}

/**
 * The crawler-file configuration of one sales channel.
 *
 * `salesChannelId` is the request's resolved channel. Every read below is made
 * for that channel and no other, and the settings store resolves each one as
 * it resolves any setting: the channel's own value, else the all-channels
 * value, else the declared default.
 */
export async function resolveCrawlerFiles(
  settings: CrawlerFilesSettingsPort,
  salesChannelId: string,
): Promise<StorefrontCrawlerFiles> {
  const policy = robotsPolicyForToken(
    await settings.get(DEFAULT_ROBOTS_SETTING_CODE, salesChannelId, z.string()),
  );
  const robotsTxtCustom = await storedCrawlerText(
    settings,
    ROBOTS_TXT_CUSTOM_SETTING_CODE,
    salesChannelId,
  );

  // The one read that degrades instead of throwing: a shop with no name is a
  // shop with no name, and nothing a crawler file says depends on it being
  // there. `getMany` answers a missing or unreadable code per code.
  const shopName = (await settings.getMany([SHOP_NAME_SETTING_CODE], salesChannelId)).get(
    SHOP_NAME_SETTING_CODE,
  );

  return {
    ...policy,
    robotsTxtCustom,
    // No setting holds this yet; the member is in the contract so that a
    // storefront reads one shape from the first release that has the endpoint.
    llmsTxtAdditional: '',
    shop: {
      name: shopName?.ok === true && typeof shopName.value === 'string' ? shopName.value : '',
    },
  };
}
