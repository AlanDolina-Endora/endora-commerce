import { composeCrawlerFile, type AdminCrawlerFilePreview } from '@endora-commerce/contracts';

/**
 * What the `robots.txt` preview shows, as a function of what it was given
 * (`specs/144-seo-search-engine-robots/contracts/admin-surfaces.md` §4).
 *
 * No React and no I/O: the row's props, the answer of the preview endpoint and
 * the channel being previewed go in, and a description of the screen comes out
 * — which blocks, which notices, in which order. The component
 * (`RobotsTxtPreview.tsx`) draws it and decides nothing.
 *
 * ## One rule for the join, and it is not written here
 *
 * The file is `composeCrawlerFile(base, operatorPart)` — the function the
 * storefront serves with. The two blocks the screen shows are **cut out of
 * that function's own output** rather than assembled beside it, so the preview
 * cannot come to disagree with the served file about a line break, a byte
 * order mark or a trailing blank line.
 */

/** The setting the preview sits beside. */
export const ROBOTS_TXT_CUSTOM_SETTING_CODE = 'seo.robots_txt_custom';
/** The setting whose row carries the outdated-storefront notice. */
export const DEFAULT_ROBOTS_SETTING_CODE = 'seo.default_robots';

/** What the row editor hands a contribution. */
export interface PreviewRowProps {
  /** The sales channel being edited, or `null` for the all-channels value. */
  readonly channelCode: string | null;
  /** The text in the field, saved or not. */
  readonly draftText: string | null;
  /** Whether that text differs from what is stored. */
  readonly dirty: boolean;
}

/** Where the request for the storefront's part stands. */
export type PreviewRequest =
  | { readonly status: 'loading' }
  | { readonly status: 'failed' }
  | { readonly status: 'ready'; readonly data: AdminCrawlerFilePreview };

export type PreviewNoticeKind =
  /** The operator's block shows text that is not saved. */
  | 'unsaved'
  /** The storefront predates the feature and serves its own rules alone. */
  | 'storefront-outdated'
  | 'storefront-unreachable'
  | 'address-unknown'
  /** The preview endpoint itself did not answer. */
  | 'preview-failed'
  /** All-channels mode, and there is no sales channel to preview. */
  | 'no-channel'
  /** `NOINDEX` channel: the file stays open on purpose. */
  | 'stays-open'
  /** `NOINDEX` channel, and the operator's text closes the site to every crawler. */
  | 'site-wide-disallow'
  /** The address is the deployment-wide one, shared by every channel. */
  | 'shared-address'
  /** All-channels mode: these channels have a value of their own. */
  | 'channels-with-own-value'
  /** All-channels mode: the previewed channel has a value of its own. */
  | 'previewed-channel-has-own-value';

export interface PreviewNotice {
  readonly kind: PreviewNoticeKind;
  /**
   * `warning` — something will not happen the way the operator may expect;
   * `info` — context. Never carried by colour alone: every notice is a
   * sentence, and the component gives each tone an icon.
   */
  readonly tone: 'info' | 'warning';
  /** The channel codes a notice names, when it names any. */
  readonly channels?: readonly string[];
}

export interface PreviewModel {
  /** `channel` — the row is edited for one channel; `all-channels` — for all. */
  readonly mode: 'channel' | 'all-channels';
  /** The channel whose file is shown, or `null` when there is none to show. */
  readonly previewedChannel: string | null;
  /** The storefront's part is still being asked for. */
  readonly loading: boolean;
  /**
   * The storefront-generated rules, exactly as served, or `null` when they
   * were not obtained — never a remembered or example text (FR-042).
   */
  readonly systemPart: string | null;
  /**
   * The operator's part, as it is — or would be — served. `''` when the text
   * adds nothing to the file.
   */
  readonly operatorPart: string;
  /** Whose text the operator's block shows. */
  readonly operatorPartOrigin: 'field' | 'saved';
  /** The operator's block shows text the storefront does not serve yet. */
  readonly operatorPartUnsaved: boolean;
  /**
   * The whole file as the storefront serves it (or will, once saved), or
   * `null` when the system part is unknown or the storefront does not join
   * the two.
   */
  readonly composed: string | null;
  /** Address the file is served at, when known. */
  readonly storefrontUrl: string | null;
  readonly notices: readonly PreviewNotice[];
}

/**
 * The preview for one row.
 *
 * `previewedChannel` is the row's own channel in channel mode, and the channel
 * the operator picked in all-channels mode.
 */
export function buildPreviewModel(
  row: PreviewRowProps,
  previewedChannel: string | null,
  request: PreviewRequest,
): PreviewModel {
  const mode = row.channelCode === null ? 'all-channels' : 'channel';
  const data = request.status === 'ready' ? request.data : null;
  const fieldText = row.draftText ?? '';

  // An all-channels value reaches a channel only while that channel has no
  // value of its own; one that has is shown what it serves, not the field.
  const previewedHasOwnValue =
    mode === 'all-channels' &&
    data !== null &&
    previewedChannel !== null &&
    data.channelsWithOwnValue.includes(previewedChannel);
  const operatorPartOrigin = previewedHasOwnValue ? 'saved' : 'field';
  const operatorText = previewedHasOwnValue ? (data?.savedExtra ?? '') : fieldText;
  const operatorPart = servedOperatorPart(operatorText);
  const operatorPartUnsaved = operatorPartOrigin === 'field' && row.dirty;

  const hasBase = data !== null && data.base !== null;
  const outdated = data?.state === 'storefront-outdated';
  const systemPart = hasBase ? servedSystemPart(data.base as string, outdated ? '' : operatorText) : null;
  const composed =
    data !== null && data.state === 'ok' && data.base !== null
      ? composeCrawlerFile(data.base, operatorText)
      : null;

  const notices: PreviewNotice[] = [];
  if (mode === 'all-channels' && previewedChannel === null) {
    notices.push({ kind: 'no-channel', tone: 'info' });
  }
  if (request.status === 'failed') notices.push({ kind: 'preview-failed', tone: 'warning' });
  if (data !== null) {
    if (data.state === 'storefront-outdated') {
      notices.push({ kind: 'storefront-outdated', tone: 'warning' });
    }
    if (data.state === 'storefront-unreachable') {
      notices.push({ kind: 'storefront-unreachable', tone: 'warning' });
    }
    if (data.state === 'address-unknown') {
      notices.push({ kind: 'address-unknown', tone: 'warning' });
    }
  }
  if (operatorPartUnsaved) notices.push({ kind: 'unsaved', tone: 'info' });
  if (previewedHasOwnValue) {
    notices.push({ kind: 'previewed-channel-has-own-value', tone: 'info' });
  }
  if (mode === 'all-channels' && data !== null && data.channelsWithOwnValue.length > 0) {
    notices.push({
      kind: 'channels-with-own-value',
      tone: 'info',
      channels: [...data.channelsWithOwnValue],
    });
  }
  if (data !== null && !data.policy.index) {
    notices.push({ kind: 'stays-open', tone: 'info' });
    if (closesSiteToEveryCrawler(operatorText)) {
      notices.push({ kind: 'site-wide-disallow', tone: 'warning' });
    }
  }
  if (data !== null && data.storefront.source === 'env' && data.state !== 'address-unknown') {
    notices.push({ kind: 'shared-address', tone: 'info' });
  }

  return {
    mode,
    previewedChannel,
    loading: request.status === 'loading',
    systemPart,
    operatorPart,
    operatorPartOrigin,
    operatorPartUnsaved,
    composed,
    storefrontUrl:
      data !== null && data.storefront.source !== 'fallback' ? data.storefront.url : null,
    notices,
  };
}

/**
 * The operator's text as the file carries it: line breaks as line feeds, one
 * leading byte order mark dropped, no line break at the end — or `''` when the
 * text adds nothing.
 *
 * Read off `composeCrawlerFile`'s output. Composed onto an empty base, the
 * function answers the base unchanged when the text adds nothing, and
 * otherwise a blank line, the text and one closing line break — so what is
 * between those is the text exactly as served.
 */
export function servedOperatorPart(operatorText: string): string {
  const tail = composeCrawlerFile('', operatorText);
  return tail === '' ? '' : tail.slice(JOIN.length, tail.length - 1);
}

/**
 * The storefront's rules as the file carries them beside `operatorText`: the
 * base itself when the text adds nothing, and the base without the line
 * breaks it ends with when the text follows it.
 */
export function servedSystemPart(base: string, operatorText: string): string {
  const composed = composeCrawlerFile(base, operatorText);
  const tail = composeCrawlerFile('', operatorText);
  return tail === '' ? composed : composed.slice(0, composed.length - tail.length);
}

/** What `composeCrawlerFile` puts between the two parts. */
const JOIN = '\n\n';

/**
 * Whether the text tells **every** crawler to fetch nothing: a `Disallow: /`
 * in a group that names `*`.
 *
 * This is a caution, not a parser of record, so it leans towards speaking up:
 * rules written before any `User-agent` line are counted as well, because in
 * the served file they follow the storefront's own `User-agent: *` group.
 * A `Disallow: /` for one named crawler is that operator's business and is
 * not flagged.
 */
export function closesSiteToEveryCrawler(operatorText: string): boolean {
  // Before the first `User-agent` line the rules attach to the group above.
  let agents: string[] = ['*'];
  let lastWasAgent = false;
  for (const rawLine of operatorText.split(/\r\n?|\n/)) {
    const line = stripComment(rawLine).trim();
    if (line === '') continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === 'user-agent') {
      // Consecutive `User-agent` lines name one group.
      agents = lastWasAgent ? [...agents, value] : [value];
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (field === 'disallow' && value === '/' && agents.includes('*')) return true;
  }
  return false;
}

function stripComment(line: string): string {
  const hash = line.indexOf('#');
  return hash < 0 ? line : line.slice(0, hash);
}

// ---------------------------------------------------------------------------
// The notice on the *Default robots* row
// ---------------------------------------------------------------------------

/** One channel's answer, for the *Default robots* row. */
export interface ChannelPreviewRequest {
  readonly channelCode: string;
  readonly request: PreviewRequest;
}

/**
 * The channels whose storefront is too old to apply *Default robots*.
 *
 * The row shows a notice for these and nothing otherwise — not while loading,
 * not when a storefront cannot be reached, not when the endpoint fails: the
 * notice says one thing, and says it only when it is known to be true.
 */
export function outdatedStorefrontChannels(
  requests: readonly ChannelPreviewRequest[],
): readonly string[] {
  return requests
    .filter(
      ({ request }) => request.status === 'ready' && request.data.state === 'storefront-outdated',
    )
    .map(({ channelCode }) => channelCode);
}

/**
 * How many channels the *Default robots* row asks about when it is edited for
 * all channels. Each one is a request the backend makes to a storefront, so
 * the number is bounded; an instance with more channels is told about the
 * first ones, and each channel's own view asks about that channel.
 */
export const DEFAULT_ROBOTS_NOTICE_MAX_CHANNELS = 5;
