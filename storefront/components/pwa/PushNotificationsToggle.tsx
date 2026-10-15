'use client';

import { useEffect, useState } from 'react';
import {
  getPwaConfig,
  isSubscribedToPush,
  pushToggleState,
  subscribeToPush,
  turnOffPush,
  type PushToggleState,
} from '../../lib/api/pwa';

/**
 * "Notifications on this device" on the account profile (#258).
 *
 * The opt-in prompt (`PushOptIn`) was the only push control the storefront
 * had, and it disappears once answered, so a customer who had enabled
 * notifications had no visible way to turn them off again. This control shows
 * the device's state and offers the one action that applies;
 * {@link pushToggleState} decides which.
 *
 * Rendered from the server as nothing: whether this browser is subscribed is
 * known only in the browser.
 */
export function PushNotificationsToggle(): React.ReactElement | null {
  const [state, setState] = useState<PushToggleState>('hidden');
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const supported =
        'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      if (!supported) return;
      const [config, subscribed] = await Promise.all([getPwaConfig(), isSubscribedToPush()]);
      setVapidKey(config?.vapidPublicKey ?? null);
      setState(
        pushToggleState({
          supported,
          pushEnabled: Boolean(config?.pushEnabled && config.vapidPublicKey),
          subscribed,
          permission: Notification.permission,
        }),
      );
    })().catch(() => setState('hidden'));
  }, []);

  if (state === 'hidden') return null;

  const turnOff = async (): Promise<void> => {
    setBusy(true);
    try {
      await turnOffPush();
    } catch {
      // The browser side is released in a `finally`; only the server call failed.
    }
    setState('off');
    setBusy(false);
  };

  const turnOn = async (): Promise<void> => {
    if (!vapidKey) return;
    setBusy(true);
    const ok = await subscribeToPush(vapidKey).catch(() => false);
    setState(ok ? 'on' : Notification.permission === 'denied' ? 'blocked' : 'off');
    setBusy(false);
  };

  return (
    <section aria-labelledby="push-notifications-heading" data-testid="pwa-push-toggle">
      <h3 id="push-notifications-heading">Notifications on this device</h3>
      <p role="status" aria-live="polite">
        {state === 'on'
          ? 'Notifications about your orders and quotes are on for this browser.'
          : state === 'blocked'
            ? 'Notifications are blocked in this browser’s site settings.'
            : 'Notifications are off for this browser.'}
      </p>
      {state === 'on' ? (
        <button type="button" className="underline" disabled={busy} onClick={() => void turnOff()}>
          Turn off notifications
        </button>
      ) : state === 'off' ? (
        <button type="button" className="underline" disabled={busy} onClick={() => void turnOn()}>
          Turn on notifications
        </button>
      ) : null}
    </section>
  );
}
