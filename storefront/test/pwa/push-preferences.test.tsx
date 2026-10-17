import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { PushPreferences } from '@endora-commerce/contracts';
import {
  PushNotificationsSection,
  pushPreferencesPatch,
} from '../../components/pwa/PushPreferencesForm';

/**
 * `specs/149-pwa-order-status-push/` T031 — the "Push notifications" section
 * on the account profile (contract `storefront-push-preferences-api.md`
 * § Public config): what is rendered for which flags, and what the server
 * action sends for which boxes.
 *
 * SSR-only, like the rest of the storefront's tests: the per-device control is
 * a client component that renders nothing on the server, so what is asserted
 * here is the account-wide half and the section around it.
 */

const BOTH_ON: PushPreferences = { orderStatus: true, quoteStatus: true };

async function noop(): Promise<void> {}

function render(props: {
  pushEnabled?: boolean;
  orderStatusPushEnabled?: boolean;
  quoteStatusPushEnabled?: boolean;
  preferences?: PushPreferences | null;
  locale?: string;
  saved?: boolean;
  failed?: boolean;
}): string {
  return renderToString(
    <PushNotificationsSection
      config={{
        pushEnabled: props.pushEnabled ?? true,
        orderStatusPushEnabled: props.orderStatusPushEnabled ?? true,
        quoteStatusPushEnabled: props.quoteStatusPushEnabled ?? true,
      }}
      preferences={props.preferences === undefined ? BOTH_ON : props.preferences}
      locale={props.locale ?? 'en-US'}
      saveAction={noop}
      saved={props.saved ?? false}
      failed={props.failed ?? false}
    />,
  );
}

describe('push notifications section — rendering', () => {
  it('shows both account-wide choices, ticked, under one heading', () => {
    const html = render({});
    expect(html).toContain('Push notifications');
    expect(html).toContain('Order status updates');
    expect(html).toContain('Quote updates');
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html.match(/checked=""/g)).toHaveLength(2);
  });

  it('shows a stored choice unticked', () => {
    const html = render({ preferences: { orderStatus: false, quoteStatus: true } });
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html).toMatch(/name="orderStatus"(?![^>]*checked)/);
  });

  it('is absent while push is off for the channel', () => {
    expect(render({ pushEnabled: false })).toBe('');
  });

  it('is absent when the preferences could not be read', () => {
    expect(render({ preferences: null })).toBe('');
  });

  it('offers only the categories the channel offers', () => {
    const html = render({ quoteStatusPushEnabled: false });
    expect(html).toContain('Order status updates');
    expect(html).not.toContain('Quote updates');
    expect(html.match(/type="checkbox"/g)).toHaveLength(1);
  });

  it('renders no form when neither category is offered, keeping the device control’s section', () => {
    const html = render({ orderStatusPushEnabled: false, quoteStatusPushEnabled: false });
    expect(html).toContain('Push notifications');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('type="checkbox"');
  });

  it('says it saved, or that it could not', () => {
    expect(render({ saved: true })).toContain('Your choices have been saved.');
    expect(render({ failed: true })).toContain('We could not save your choices.');
  });

  it('speaks Polish on a Polish storefront', () => {
    const html = render({ locale: 'pl-PL' });
    expect(html).toContain('Powiadomienia push');
    expect(html).toContain('Zmiany statusu zamówień');
    expect(html).toContain('Aktualizacje zapytań ofertowych');
    expect(html).not.toContain('Order status updates');
  });
});

describe('push notifications section — what the save sends', () => {
  function form(entries: Array<[string, string]>): FormData {
    const data = new FormData();
    for (const [name, value] of entries) data.append(name, value);
    return data;
  }

  it('sends true for a ticked box and false for a rendered box left unticked', () => {
    expect(
      pushPreferencesPatch(
        form([
          ['offered', 'orderStatus'],
          ['offered', 'quoteStatus'],
          ['orderStatus', 'on'],
        ]),
      ),
    ).toEqual({ orderStatus: true, quoteStatus: false });
  });

  it('omits a choice that was not rendered', () => {
    expect(pushPreferencesPatch(form([['offered', 'orderStatus']]))).toEqual({
      orderStatus: false,
    });
  });

  it('ignores an offered name it does not know, and answers null for nothing to send', () => {
    expect(pushPreferencesPatch(form([['offered', 'email'], ['email', 'on']]))).toBeNull();
    expect(pushPreferencesPatch(form([]))).toBeNull();
  });
});
