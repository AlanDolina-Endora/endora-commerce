import type { EntityManager } from '@mikro-orm/postgresql';
import {
  CRAWLER_FILES_CAPABILITY_HEADER,
  type AdminCrawlerFile,
  type AdminCrawlerFilePreview,
  type AdminCrawlerFilePreviewState,
} from '@endora-commerce/contracts';
import { SalesChannel, Setting, SettingValue } from '@endora-commerce/platform/kernel';
import { z } from 'zod';
import {
  ROBOTS_TXT_CUSTOM_SETTING_CODE,
  storedCrawlerText,
  type CrawlerFilesSettingsPort,
} from './crawler-files.service.js';
import { DEFAULT_ROBOTS_SETTING_CODE, robotsPolicyForToken } from './robots-policy.js';
import type { StorefrontAddress, StorefrontAddressService } from './storefront-address.service.js';

/**
 * The preview of a sales channel's crawler file
 * (`specs/144-seo-search-engine-robots/contracts/admin-surfaces.md` §3).
 *
 * A crawler file is two parts: the rules the **storefront** generates and the
 * text an operator saved. This module owns the second and must not hold a copy
 * of the first (FR-041), so to show the file it asks the channel's storefront
 * for its part — server to server — and hands both to the Admin UI, which
 * joins them with the function the storefront serves with. Nothing is stored
 * and nothing is cached.
 *
 * ## The outbound request, and what bounds it
 *
 * This is the one place `seo` opens a connection to an address an operator
 * typed into a setting, on behalf of whoever asked for a preview. Every bound
 * below is a constant; none is a setting, because a bound an administrator can
 * widen is not one.
 *
 *  * **Where.** The origin of the channel's configured storefront address and
 *    nothing else — scheme, host and port. Whatever path, query or fragment
 *    the configured address carries is dropped, and the path and query are
 *    this file's: a crawler file lives at the root of an origin and nowhere
 *    else, so there is nothing a path could legitimately add, and an address
 *    ending in `?` would otherwise turn the fixed path into a query of the
 *    operator's own path. Nothing the preview's caller sends is in the
 *    request: the caller names a sales channel, and the request carries the
 *    code of the channel row that was found.
 *  * **How.** `GET`, `http` or `https`, no credentials — an address carrying
 *    `user:password@` is refused rather than stripped — no cookies, no
 *    `Authorization`, and none of the caller's headers.
 *  * **No redirect is followed.** Not to another host, which is how a
 *    permitted address becomes a different one, and not to the same host
 *    either: a storefront answers its own `robots.txt` where it is asked, and
 *    one that redirects is configured under an address that is not its own —
 *    which is worth telling the operator, since the sitemap stamps its URLs
 *    from the same setting.
 *  * **How long.** {@link PREVIEW_TIMEOUT_MS}, covering the connection, the
 *    headers and the body.
 *  * **How much.** {@link PREVIEW_MAX_BYTES}, counted while the body is read
 *    and never taken from `Content-Length`; the read is cancelled the moment
 *    the count passes it.
 *  * **What.** `text/plain` only. A crawler file is plain text, and anything
 *    else at that address is not one.
 *
 * ## What the answer gives away
 *
 * One of five states, the text of a public file, and the address the channel
 * is configured with. Every way of not getting a usable answer — a refused
 * connection, a timeout, a redirect, an error status, another content type, a
 * body over the cap, an address that is not an `http(s)` origin — is the one
 * state `storefront-unreachable`, so the endpoint says whether a preview can be
 * shown and not what is listening where. The reason is written to the server
 * log, for whoever operates the instance.
 *
 * ## What is not done, and why
 *
 * Private, loopback and link-local addresses are **not** refused. The
 * storefront of an instance is routinely reached at one — `localhost` in
 * development, a service name on a container network, a cluster address — and
 * the platform already posts to its storefront at such an address
 * (`StorefrontRevalidator`). The guard `product_feeds` applies to its
 * taxonomy source is for a third-party address on the public internet and
 * would refuse every one of those. So a holder of `settings:write` can point a
 * channel at an internal host and a holder of `settings:read` can then learn
 * whether something answers `GET /robots.txt` there with plain text, and read
 * it. That is the trust the setting already carries, bounded by the list
 * above; it is stated here so that nobody has to rediscover it.
 */

/** Connection, headers and body together. */
export const PREVIEW_TIMEOUT_MS = 3_000;

/** The most that is read of a storefront's answer: 512 KiB. */
export const PREVIEW_MAX_BYTES = 512 * 1024;

/** Identifies the caller in a storefront's access log. Politeness, not identity. */
const USER_AGENT = 'EndoraCommerce-Seo/1.0 (+crawler-file-preview)';

/**
 * What each previewable file is built from. The path and query are literals;
 * nothing is interpolated into them.
 */
const PREVIEWABLE_FILES = {
  robots: {
    pathAndQuery: '/robots.txt?part=system',
    settingCode: ROBOTS_TXT_CUSTOM_SETTING_CODE,
  },
} as const satisfies Partial<
  Record<AdminCrawlerFile, { readonly pathAndQuery: string; readonly settingCode: string }>
>;

export type PreviewableCrawlerFile = keyof typeof PREVIEWABLE_FILES;

/** Whether this release can preview `file`. */
export function isPreviewableCrawlerFile(file: AdminCrawlerFile): file is PreviewableCrawlerFile {
  return Object.hasOwn(PREVIEWABLE_FILES, file);
}

/** The reads the preview makes of the settings store. */
export type CrawlerFilePreviewSettingsPort = Pick<CrawlerFilesSettingsPort, 'get'>;

/** Where the saved text of a channel comes from, and who else has their own. */
export interface CrawlerTextProvenance {
  readonly source: AdminCrawlerFilePreview['savedExtraSource'];
  readonly channelsWithOwnValue: readonly string[];
}

/**
 * The two facts the preview needs that the settings read port does not answer:
 * which channel a code names, and which tier a channel's value comes from.
 */
export interface CrawlerFilePreviewStore {
  findChannel(code: string): Promise<{ readonly id: string; readonly code: string } | null>;
  provenance(settingCode: string, salesChannelId: string): Promise<CrawlerTextProvenance>;
}

/** The named sales channel does not exist. */
export class UnknownSalesChannelError extends Error {
  constructor(readonly salesChannelCode: string) {
    super(`No sales channel has the code "${salesChannelCode}".`);
    this.name = 'UnknownSalesChannelError';
  }
}

/** What became of asking the storefront, with a reason for the server log only. */
export interface StorefrontPartOutcome {
  readonly state: Exclude<AdminCrawlerFilePreviewState, 'not-served'>;
  readonly base: string | null;
  /** Why the state is what it is. Never the body, and never sent to a client. */
  readonly reason: string;
}

export interface CrawlerFilePreviewOptions {
  /** Injected so that no test opens a socket. Defaults to the platform `fetch`, read per call. */
  readonly fetchFn?: typeof fetch;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
}

export interface CrawlerFilePreviewResult {
  readonly preview: AdminCrawlerFilePreview;
  /** For the server log. */
  readonly reason: string;
}

export class CrawlerFilePreviewService {
  /**
   * Requests in flight, by target and channel. Two administrators — or one
   * with the preview on two rows — asking for the same channel at the same
   * moment share one request to the storefront. It holds a promise for as long
   * as the request runs and nothing after: this is not a cache.
   */
  private readonly inFlight = new Map<string, Promise<StorefrontPartOutcome>>();

  constructor(
    private readonly settings: CrawlerFilePreviewSettingsPort,
    private readonly store: CrawlerFilePreviewStore,
    private readonly storefrontAddress: Pick<StorefrontAddressService, 'resolve'>,
    private readonly options: CrawlerFilePreviewOptions = {},
  ) {}

  /**
   * @throws UnknownSalesChannelError when no channel carries the code.
   * @throws whatever the stored values throw when they cannot be stood behind
   *   (`UnknownRobotsTokenError`, `StoredCrawlerTextTooLargeError`) — the same
   *   refusals the storefront's own read meets, so the preview never shows a
   *   file the storefront would not serve.
   */
  async preview(
    file: PreviewableCrawlerFile,
    salesChannelCode: string,
  ): Promise<CrawlerFilePreviewResult> {
    const channel = await this.store.findChannel(salesChannelCode);
    if (channel === null) throw new UnknownSalesChannelError(salesChannelCode);
    const { pathAndQuery, settingCode } = PREVIEWABLE_FILES[file];

    // Every read below is made for `channel.id` and no other (Principle XII).
    const policy = robotsPolicyForToken(
      await this.settings.get(DEFAULT_ROBOTS_SETTING_CODE, channel.id, z.string()),
    );
    const savedExtra = await storedCrawlerText(this.settings, settingCode, channel.id);
    const provenance = await this.store.provenance(settingCode, channel.id);
    const address = await this.storefrontAddress.resolve(channel.id);

    const outcome = await this.storefrontPart(address, pathAndQuery, channel.code);

    return {
      reason: outcome.reason,
      preview: {
        file,
        salesChannelCode: channel.code,
        state: outcome.state,
        base: outcome.base,
        savedExtra,
        savedExtraSource: provenance.source,
        channelsWithOwnValue: [...provenance.channelsWithOwnValue],
        policy,
        storefront: { url: address.url, source: address.source },
      },
    };
  }

  private async storefrontPart(
    address: StorefrontAddress,
    pathAndQuery: string,
    salesChannelCode: string,
  ): Promise<StorefrontPartOutcome> {
    // An address nobody configured is not asked.
    if (address.source === 'fallback') {
      return { state: 'address-unknown', base: null, reason: 'no storefront address is configured' };
    }
    const target = crawlerFileTarget(address.url, pathAndQuery);
    if (target === null) {
      return {
        state: 'storefront-unreachable',
        base: null,
        reason: 'the configured storefront address is not an http(s) origin without credentials',
      };
    }

    const key = `${target.href}\n${salesChannelCode}`;
    const running = this.inFlight.get(key);
    if (running !== undefined) return running;
    const started = this.request(target, salesChannelCode).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, started);
    return started;
  }

  private async request(target: URL, salesChannelCode: string): Promise<StorefrontPartOutcome> {
    const fetchFn = this.options.fetchFn ?? globalThis.fetch;
    const timeoutMs = this.options.timeoutMs ?? PREVIEW_TIMEOUT_MS;
    const maxBytes = this.options.maxBytes ?? PREVIEW_MAX_BYTES;
    const unreachable = (reason: string): StorefrontPartOutcome => ({
      state: 'storefront-unreachable',
      base: null,
      reason,
    });

    // One clock for the connection, the headers and the body: a server that
    // answers its headers at once and then trickles the body is still cut off.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response: Response;
      try {
        response = await fetchFn(target, {
          method: 'GET',
          headers: {
            accept: 'text/plain',
            'user-agent': USER_AGENT,
            // The code of the channel row that was found — a storefront reached
            // directly answers for that channel; a proxy in front of one
            // overwrites it with its own. This header is **sent**; nothing
            // here reads it from a request — which channel is previewed comes
            // from the validated query, through the channel row.
            'X-Sales-Channel': salesChannelCode,
          },
          redirect: 'manual',
          credentials: 'omit',
          signal: controller.signal,
        });
      } catch (error) {
        return unreachable(
          controller.signal.aborted ? `no answer within ${timeoutMs} ms` : errorLine(error),
        );
      }

      if (response.status < 200 || response.status > 299) {
        await discard(response);
        return unreachable(
          response.status >= 300 && response.status < 400
            ? `it answered with a redirect (HTTP ${response.status}), which is not followed`
            : `it answered HTTP ${response.status}`,
        );
      }
      const contentType = (response.headers.get('content-type') ?? '').trim().toLowerCase();
      if (!/^text\/plain(?:\s*;|$)/.test(contentType)) {
        await discard(response);
        return unreachable('its answer is not text/plain');
      }

      const body = await readCapped(response, maxBytes);
      if (body === null) {
        return unreachable(
          controller.signal.aborted
            ? `its answer did not finish within ${timeoutMs} ms`
            : `its answer is larger than ${maxBytes} bytes or could not be read`,
        );
      }

      // A storefront that predates the feature ignores the query and answers
      // its whole file, which is its own rules and nothing else — it appends
      // no operator text. The header is the only way to tell that from an
      // answer to what was asked.
      if (response.headers.get(CRAWLER_FILES_CAPABILITY_HEADER) === null) {
        return {
          state: 'storefront-outdated',
          base: body,
          reason: `it answered without ${CRAWLER_FILES_CAPABILITY_HEADER}`,
        };
      }
      return { state: 'ok', base: body, reason: 'ok' };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * The address a crawler file is asked at: the configured address's origin, and
 * this module's path and query.
 *
 * `null` when the configured address is not an `http(s)` origin, or carries
 * credentials. Exported for its test: this function is the whole answer to
 * "what can the request be made to".
 */
export function crawlerFileTarget(configuredAddress: string, pathAndQuery: string): URL | null {
  let configured: URL;
  try {
    configured = new URL(configuredAddress.trim());
  } catch {
    return null;
  }
  if (configured.protocol !== 'http:' && configured.protocol !== 'https:') return null;
  if (configured.username !== '' || configured.password !== '') return null;
  if (configured.hostname === '') return null;
  // `origin` is scheme, host and port: the configured path, query and fragment
  // do not survive it.
  return new URL(pathAndQuery, configured.origin);
}

/**
 * The body as text, or `null` when it is longer than `maxBytes` or the read
 * fails. The count is of bytes actually received.
 */
async function readCapped(response: Response, maxBytes: number): Promise<string | null> {
  const body = response.body;
  if (body === null) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** A body nobody will read is released rather than left to buffer. */
async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

/** One bounded line with no stack — for the server log. */
function errorLine(error: unknown): string {
  const cause = error instanceof Error && error.cause instanceof Error ? `: ${error.cause.message}` : '';
  const message = error instanceof Error ? `${error.name}: ${error.message}${cause}` : String(error);
  return message.slice(0, 240);
}

/**
 * The store, over the kernel's settings and sales-channel rows.
 *
 * The provenance read is of `seo`'s **own** setting. The settings read port
 * answers a channel's resolved value and not the tier it came from, so the
 * tier is read from the rows the resolution is made of — the reading
 * `invoices` makes of its numbering settings for the same reason.
 */
export function createCrawlerFilePreviewStore(
  emFactory: () => EntityManager,
): CrawlerFilePreviewStore {
  return {
    async findChannel(code) {
      const channel = await emFactory().findOne(SalesChannel, { code });
      return channel === null ? null : { id: channel.id, code: channel.code };
    },
    async provenance(settingCode, salesChannelId) {
      const em = emFactory();
      const setting = await em.findOne(Setting, { code: settingCode });
      if (setting === null) return { source: 'default', channelsWithOwnValue: [] };
      const values = await em.find(SettingValue, { setting }, { populate: ['salesChannel'] });
      const own = values.some((value) => value.salesChannel.id === salesChannelId);
      const hasGlobal = setting.globalValue !== null && setting.globalValue !== undefined;
      return {
        source: own ? 'channel' : hasGlobal ? 'global' : 'default',
        channelsWithOwnValue: values.map((value) => value.salesChannel.code).sort(),
      };
    },
  };
}
