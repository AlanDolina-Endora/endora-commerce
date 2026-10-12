import { z } from 'zod';

/**
 * Where a sales channel's storefront is taken to be.
 *
 * Three rungs, tried in order, and the answer names the one it came from:
 *
 *  1. `setting` — the channel's own `sales_channels.storefront_url`;
 *  2. `env` — `STOREFRONT_BASE_URL`, one address shared by every channel;
 *  3. `fallback` — neither is configured.
 *
 * The rung matters to a caller that does more than print the address. The
 * sitemap stamps URLs with whatever comes back; the crawler-file preview
 * (`crawler-file-preview.service.ts`) makes a request to it, and must not make
 * one to a fallback — that is an address nobody configured.
 *
 * This was `SitemapGeneratorService`'s private method. It moved here, unchanged
 * in what it answers, when a second caller needed the same three rungs
 * (`specs/144-seo-search-engine-robots/research.md` R2).
 */

/** The per-channel setting, declared by the `sales_channels` module. */
export const STOREFRONT_URL_SETTING_CODE = 'sales_channels.storefront_url';

const STOREFRONT_BASE_URL_ENV = 'STOREFRONT_BASE_URL';
const LOCAL_DEVELOPMENT_STOREFRONT = 'http://localhost:3000';

export type StorefrontAddressSource = 'setting' | 'env' | 'fallback';

export interface StorefrontAddress {
  /** As configured, trimmed of surrounding whitespace and otherwise untouched. */
  readonly url: string;
  readonly source: StorefrontAddressSource;
}

/** The one read this service makes of the settings store. */
export interface StorefrontAddressSettingsPort {
  get<T>(code: string, salesChannelId: string, schema: z.ZodType<T>): Promise<T>;
}

export interface StorefrontAddressOptions {
  /** The last rung. Defaults to `STOREFRONT_BASE_URL`, then the local development storefront. */
  readonly fallbackUrl?: string | undefined;
}

export class StorefrontAddressService {
  private readonly fallbackUrl: string;

  constructor(
    private readonly settings: StorefrontAddressSettingsPort | null,
    options: StorefrontAddressOptions = {},
  ) {
    // Read once, as it always was: the last rung is a property of the
    // composition, and the environment is consulted again per call below.
    this.fallbackUrl =
      options.fallbackUrl ?? process.env[STOREFRONT_BASE_URL_ENV] ?? LOCAL_DEVELOPMENT_STOREFRONT;
  }

  async resolve(salesChannelId: string): Promise<StorefrontAddress> {
    if (this.settings) {
      try {
        const fromSetting = await this.settings.get(
          STOREFRONT_URL_SETTING_CODE,
          salesChannelId,
          z.string(),
        );
        if (fromSetting && fromSetting.trim() !== '') {
          return { url: fromSetting.trim(), source: 'setting' };
        }
      } catch {
        // Not registered or out of scope — fall through to env / fallback.
      }
    }
    const fromEnv = process.env[STOREFRONT_BASE_URL_ENV];
    if (fromEnv && fromEnv.trim() !== '') {
      return { url: fromEnv.trim(), source: 'env' };
    }
    return { url: this.fallbackUrl, source: 'fallback' };
  }
}
