import type { ReactElement } from 'react';
import type {
  PushPreferences,
  PwaPublicConfig,
  UpdatePushPreferencesRequest,
} from '@endora-commerce/contracts';
import { tForLocale } from '../../lib/i18n/messages';
import { PushNotificationsToggle } from './PushNotificationsToggle';

/**
 * The account profile's "Push notifications" section
 * (`specs/149-pwa-order-status-push/` US3, contract
 * `storefront-push-preferences-api.md`).
 *
 * Two halves under one heading. The per-browser control
 * ({@link PushNotificationsToggle}) is where browser permission and this
 * device's subscription are handled, and it stays a client component because
 * only the browser knows whether it is subscribed. The account-wide choices
 * are server-rendered and saved by a server action: they govern every device
 * the customer has subscribed, so they stay editable on a device where push is
 * unsupported or blocked (Story 3 scenario 5).
 *
 * What is offered is the backend's decision, read off the public config: the
 * section exists only while push is on for the channel, and each choice only
 * while its category is offered there (FR-020) — the storefront has no
 * module-presence list of its own for this.
 */

/** The choices a form may carry, in the order they are rendered. */
const CHOICES = ['orderStatus', 'quoteStatus'] as const;
type Choice = (typeof CHOICES)[number];

export interface PushNotificationsSectionProps {
  config: Pick<PwaPublicConfig, 'pushEnabled' | 'orderStatusPushEnabled' | 'quoteStatusPushEnabled'>;
  /** The stored choices, or `null` when they could not be read (signed out, module off). */
  preferences: PushPreferences | null;
  locale: string;
  saveAction: (formData: FormData) => Promise<void>;
  saved: boolean;
  failed: boolean;
}

export function PushNotificationsSection(
  props: PushNotificationsSectionProps,
): ReactElement | null {
  if (!props.config.pushEnabled || !props.preferences) return null;
  const t = tForLocale(props.locale);
  const offered: Choice[] = CHOICES.filter((choice) =>
    choice === 'orderStatus'
      ? props.config.orderStatusPushEnabled
      : props.config.quoteStatusPushEnabled,
  );
  const label: Record<Choice, string> = {
    orderStatus: t('account.push.preferences.orderStatus'),
    quoteStatus: t('account.push.preferences.quoteStatus'),
  };

  return (
    <section aria-labelledby="push-section-heading" data-testid="pwa-push-section">
      <h3 id="push-section-heading">{t('account.push.heading')}</h3>
      <PushNotificationsToggle
        messages={{
          heading: t('account.push.device.heading'),
          on: t('account.push.device.on'),
          off: t('account.push.device.off'),
          blocked: t('account.push.device.blocked'),
          turnOn: t('account.push.device.turnOn'),
          turnOff: t('account.push.device.turnOff'),
        }}
      />
      {offered.length > 0 ? (
        <form action={props.saveAction} className="b2b-auth__form" data-testid="pwa-push-preferences">
          <fieldset>
            <legend>{t('account.push.preferences.heading')}</legend>
            <p className="b2b-auth__hint">{t('account.push.preferences.hint')}</p>
            {props.saved ? (
              <p className="b2b-auth__success" role="status">
                {t('account.push.preferences.saved')}
              </p>
            ) : null}
            {props.failed ? (
              <p className="b2b-auth__error" role="alert">
                {t('account.push.preferences.error')}
              </p>
            ) : null}
            {offered.map((choice) => (
              <div className="b2b-auth__field" key={choice}>
                <input type="hidden" name="offered" value={choice} />
                <label>
                  <input
                    type="checkbox"
                    name={choice}
                    defaultChecked={props.preferences![choice]}
                  />{' '}
                  {label[choice]}
                </label>
              </div>
            ))}
          </fieldset>
          <div className="b2b-auth__actions">
            <button type="submit">{t('account.push.preferences.save')}</button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

/**
 * What the save sends, from the submitted form: `true` for a ticked box,
 * `false` for a box that was rendered and left unticked — an unticked checkbox
 * submits nothing, so the `offered` hidden fields are what tell the two apart —
 * and nothing for a choice that was not offered, so a stored value the channel
 * does not currently offer is left alone. `null` when there is nothing to send.
 */
export function pushPreferencesPatch(formData: FormData): UpdatePushPreferencesRequest | null {
  const offered = new Set(formData.getAll('offered').map(String));
  const patch: UpdatePushPreferencesRequest = {};
  for (const choice of CHOICES) {
    if (offered.has(choice)) patch[choice] = formData.get(choice) !== null;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}
