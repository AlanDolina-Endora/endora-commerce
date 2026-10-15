// Client-side PWA helpers (feature 046). Talk to same-origin Next route handlers
// (`/pwa/config`, `/pwa/subscriptions`) which proxy to the backend.

import type { PwaPublicConfig } from '@endora-commerce/contracts';

export async function getPwaConfig(): Promise<PwaPublicConfig | null> {
  try {
    const res = await fetch('/pwa/config', { credentials: 'same-origin' });
    if (!res.ok) return null;
    return (await res.json()) as PwaPublicConfig;
  } catch {
    return null;
  }
}

/** base64url VAPID key → Uint8Array for PushManager.subscribe. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export async function subscribeToPush(vapidPublicKey: string): Promise<boolean> {
  if (!pushSupported()) return false;
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast: the DOM lib types applicationServerKey as BufferSource; the generic
      // Uint8Array<ArrayBufferLike> is a compatible view.
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    }));
  const json = subscription.toJSON();
  const res = await fetch('/pwa/subscriptions', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: { p256dh: json.keys?.['p256dh'] ?? '', auth: json.keys?.['auth'] ?? '' },
      userAgent: navigator.userAgent,
    }),
  });
  return res.ok;
}

/**
 * Set once the customer said no — "Not now" on the opt-in prompt, or turning
 * notifications off by hand — so the prompt does not ask again.
 */
export const PUSH_DISMISS_KEY = 'b2b:pwa:push-dismissed';

function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window
  );
}

/**
 * This browser's push subscription, or `null`.
 *
 * `getRegistration()` rather than `serviceWorker.ready`: `ready` never settles
 * on a page no worker was registered for — every development build, since
 * `PwaRegister` skips registration there — and sign-out waits on this.
 */
async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

export async function isSubscribedToPush(): Promise<boolean> {
  return (await currentPushSubscription()) !== null;
}

/** How long sign-out waits for the server to forget the subscription. */
const RELEASE_TIMEOUT_MS = 5_000;

export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  const json = subscription.toJSON();
  try {
    await fetch('/pwa/subscriptions', {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      // The keys prove this browser created the subscription, so the backend
      // accepts them from a signed-out browser too (#254); it does not remove
      // a subscription on the endpoint alone.
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys?.['p256dh'] ?? '', auth: json.keys?.['auth'] ?? '' },
      }),
      signal: AbortSignal.timeout(RELEASE_TIMEOUT_MS),
    });
  } finally {
    // Whatever the server answered: once the browser unsubscribes, the push
    // service retires the endpoint, so nothing addressed to it arrives here
    // even if the server kept its row — and the next send prunes that row.
    await subscription.unsubscribe();
  }
}

/**
 * The sign-out half of #258: detach this browser from the account before the
 * session ends. Never throws — a failure here must not stand between a
 * customer and signing out.
 */
export async function releasePushSubscription(): Promise<void> {
  try {
    await unsubscribeFromPush();
  } catch {
    // Swallowed deliberately; see above.
  }
}

/** "Turn off" on the account's notification control. */
export async function turnOffPush(): Promise<void> {
  try {
    window.localStorage.setItem(PUSH_DISMISS_KEY, '1');
  } catch {
    // Storage blocked: the prompt may ask again, the subscription still goes.
  }
  await unsubscribeFromPush();
}

export type PushToggleState = 'hidden' | 'on' | 'off' | 'blocked';

/**
 * What the account's notification control offers. A subscription that exists
 * can always be turned off — even after the channel switched push off, since
 * that is exactly the subscription a customer may want gone. Turning on is
 * offered only where it can work.
 */
export function pushToggleState(input: {
  supported: boolean;
  pushEnabled: boolean;
  subscribed: boolean;
  permission: NotificationPermission;
}): PushToggleState {
  if (!input.supported) return 'hidden';
  if (input.subscribed) return 'on';
  if (!input.pushEnabled) return 'hidden';
  return input.permission === 'denied' ? 'blocked' : 'off';
}
