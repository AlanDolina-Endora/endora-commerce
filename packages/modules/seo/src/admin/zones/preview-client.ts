import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type {
  AdminCrawlerFilePreviewResponse,
  SalesChannelListResponse,
} from '@endora-commerce/contracts';
import { apiClient } from '@endora-commerce/admin-kit/lib';
import type { PreviewRequest } from './preview-model.js';

/**
 * What the two contributions beside `seo`'s settings ask the backend, and the
 * one place they ask it from.
 *
 * The preview beside *Custom robots.txt instructions* and the notice on the
 * *Default robots* row both need the same answer for the same sales channel,
 * and each answer costs a request from the backend to a storefront. So the
 * answer is held here, per channel, for both to read: two rows on one screen
 * are one request, not two.
 *
 * **When the backend is asked** — when the previewed channel changes, when a
 * row asks again, and when the *Default robots* row is saved (the answer
 * carries the channel's policy). **Typing never asks**: the operator's part of
 * the preview comes from the field, in the browser, and is sent nowhere.
 *
 * **What is kept** — the answer for a channel, in this tab's memory, for as
 * long as a row on the screen is showing that channel and no longer. A request
 * that starts drops the answer it replaces, and a channel nobody is showing is
 * forgotten — so rules obtained earlier are never shown as current while newer
 * ones are on their way, after they failed to arrive, or on a later visit to
 * the channel (FR-042).
 */

const LOADING: PreviewRequest = { status: 'loading' };
const FAILED: PreviewRequest = { status: 'failed' };

interface Entry {
  request: PreviewRequest;
  /** How many mounted rows are showing this channel's answer. */
  readers: number;
  /** The backend has been asked at least once for this entry. */
  asked: boolean;
  inFlight: boolean;
  /** A reload was asked for while one was in flight; run one more after it. */
  again: boolean;
}

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();

/** Bumped on every change; what a reader of several entries subscribes to. */
let version = 0;

function notify(): void {
  version += 1;
  for (const listener of listeners) listener();
}

function getVersion(): number {
  return version;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A fixed path and two fixed parameter names; the channel is a code the server validates. */
function previewPath(salesChannelCode: string): string {
  const query = new URLSearchParams({ file: 'robots', salesChannelCode });
  return `/api/v1/admin/seo/crawler-files/preview?${query.toString()}`;
}

/**
 * A row starts showing `salesChannelCode`. Returns what to call when it stops.
 *
 * When the last row showing a channel stops, what was known about the channel
 * is forgotten: coming back to it starts from nothing, so an answer from an
 * earlier visit is never drawn as current.
 */
function watchRobotsPreview(salesChannelCode: string): () => void {
  let entry = entries.get(salesChannelCode);
  if (entry === undefined) {
    entry = { request: LOADING, readers: 0, asked: false, inFlight: false, again: false };
    entries.set(salesChannelCode, entry);
  }
  entry.readers += 1;
  const watched = entry;
  return () => {
    watched.readers -= 1;
    if (watched.readers === 0 && entries.get(salesChannelCode) === watched) {
      entries.delete(salesChannelCode);
    }
  };
}

/** Ask the backend about `salesChannelCode`, unless it is being asked already. */
function loadRobotsPreview(salesChannelCode: string): void {
  const entry = entries.get(salesChannelCode);
  // Nobody is showing the channel any more.
  if (entry === undefined) return;
  if (entry.inFlight) {
    entry.again = true;
    return;
  }
  entry.asked = true;
  entry.inFlight = true;
  entry.again = false;
  // The answer being replaced is dropped now, not when the new one arrives.
  entry.request = LOADING;
  notify();
  apiClient
    .get<AdminCrawlerFilePreviewResponse>(previewPath(salesChannelCode))
    .then(
      (response): PreviewRequest => ({ status: 'ready', data: response.data }),
      (): PreviewRequest => FAILED,
    )
    .then((request) => {
      entry.inFlight = false;
      // The rows that asked have gone; the answer is nobody's.
      if (entries.get(salesChannelCode) !== entry) return;
      entry.request = request;
      notify();
      if (entry.again) loadRobotsPreview(salesChannelCode);
    });
}

/** Ask about `salesChannelCode` if no row has asked yet. */
function ensureRobotsPreview(salesChannelCode: string): void {
  if (entries.get(salesChannelCode)?.asked === false) loadRobotsPreview(salesChannelCode);
}

/** Ask again about every channel a mounted row is showing. */
export function reloadRobotsPreviews(): void {
  for (const salesChannelCode of [...entries.keys()]) loadRobotsPreview(salesChannelCode);
}

function requestFor(salesChannelCode: string | null): PreviewRequest {
  if (salesChannelCode === null) return LOADING;
  return entries.get(salesChannelCode)?.request ?? LOADING;
}

/**
 * How long a newly previewed channel waits before the backend is asked, so
 * that moving through the channel list does not ask about every channel passed
 * on the way.
 */
const CHANNEL_CHANGE_DELAY_MS = 250;

/** Watch the channels, and ask about the ones nobody has asked about yet. */
function useWatchedChannels(key: string): void {
  useEffect(() => {
    if (key === '') return undefined;
    const codes = key.split('\n');
    const stops = codes.map((code) => watchRobotsPreview(code));
    const timer = setTimeout(() => {
      for (const code of codes) ensureRobotsPreview(code);
    }, CHANNEL_CHANGE_DELAY_MS);
    return (): void => {
      clearTimeout(timer);
      for (const stop of stops) stop();
    };
  }, [key]);
}

/**
 * The preview answer for one channel, asked for when the channel changes.
 *
 * `null` asks nothing and reads as loading.
 */
export function useRobotsPreview(salesChannelCode: string | null): {
  readonly request: PreviewRequest;
  readonly reload: () => void;
} {
  const request = useSyncExternalStore(
    subscribe,
    () => requestFor(salesChannelCode),
    () => LOADING,
  );
  useWatchedChannels(salesChannelCode ?? '');
  const reload = useCallback((): void => {
    if (salesChannelCode !== null) loadRobotsPreview(salesChannelCode);
  }, [salesChannelCode]);
  return { request, reload };
}

/** The answers for several channels at once, for the *Default robots* row. */
export function useRobotsPreviews(
  salesChannelCodes: readonly string[],
): readonly { readonly channelCode: string; readonly request: PreviewRequest }[] {
  // Several entries have no single stable snapshot, so this subscribes to the
  // store's version and reads the entries afresh on each render.
  useSyncExternalStore(subscribe, getVersion, getVersion);
  useWatchedChannels(salesChannelCodes.join('\n'));
  return salesChannelCodes.map((channelCode) => ({ channelCode, request: requestFor(channelCode) }));
}

// ---------------------------------------------------------------------------
// The sales channels, for the all-channels row
// ---------------------------------------------------------------------------

export interface PreviewChannel {
  readonly code: string;
  readonly systemDefault: boolean;
}

export type PreviewChannels =
  | { readonly status: 'loading'; readonly items: readonly PreviewChannel[] }
  | { readonly status: 'ready'; readonly items: readonly PreviewChannel[] };

const CHANNELS_LOADING: PreviewChannels = { status: 'loading', items: [] };
let channels: PreviewChannels = CHANNELS_LOADING;
let channelsAsked = false;

/**
 * The instance's active sales channels, the system default first.
 *
 * `GET /api/v1/admin/sales-channels` and its response type are an HTTP path
 * and a `@endora-commerce/contracts` type — the same exit the Settings screen
 * takes for its own channel selector, and no dependency on another module's
 * code. An administrator who may not list channels gets an empty list, and the
 * preview says there is no channel to show.
 */
function loadChannels(): void {
  if (channelsAsked) return;
  channelsAsked = true;
  apiClient
    .get<SalesChannelListResponse>('/api/v1/admin/sales-channels?activeOnly=true&pageSize=100')
    .then(
      (response): readonly PreviewChannel[] =>
        response.items
          .map((item) => ({ code: item.code, systemDefault: item.systemDefault }))
          .sort(
            (left, right) =>
              Number(right.systemDefault) - Number(left.systemDefault) ||
              left.code.localeCompare(right.code),
          ),
      (): readonly PreviewChannel[] => {
        // Not remembered as an answer: the next mount asks again.
        channelsAsked = false;
        return [];
      },
    )
    .then((items) => {
      channels = { status: 'ready', items };
      notify();
    });
}

/** The channels to offer, asked for only when `wanted`. */
export function usePreviewChannels(wanted: boolean): PreviewChannels {
  const value = useSyncExternalStore(
    subscribe,
    () => channels,
    () => CHANNELS_LOADING,
  );
  useEffect(() => {
    if (wanted) loadChannels();
  }, [wanted]);
  return wanted ? value : CHANNELS_LOADING;
}
