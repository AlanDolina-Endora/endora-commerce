import {
  PWA_SETTING_CODES,
  type AdminI18nTranslatePort,
  type CustomerAccountReadPort,
  type OrderReadPort,
  type PushPreferences,
  type QuoteRequestReadPort,
} from '@endora-commerce/contracts';
import type { SalesChannelResolutionPort } from '@endora-commerce/platform/kernel';
import type { CreateMessageInput, CreateMessageResult } from './push-message-service.js';
import type { PushEventLogger } from './push-event-subscriber.js';
import {
  notificationLanguage,
  orderStatusCopy,
  orderStatusLabel,
  quoteStatusCopy,
  type QuoteStatusPushKind,
  type StatusPushCopy,
} from './status-push-copy.js';

/**
 * What one status event became. Returned rather than logged so the subscriber
 * and the tests can tell the gates apart; only the preference skip writes a
 * line of its own (`debug`), because "why did I not get notified?" is the
 * question a support engineer asks of exactly that gate.
 */
export type StatusPushOutcome =
  | 'enqueued'
  | 'skipped:no_subject'
  | 'skipped:quote_requests_absent'
  | 'skipped:switched_off'
  | 'skipped:no_account'
  | 'skipped:customer_preference';

export interface OrderStatusPushEvent {
  eventId: string;
  orderId: string;
  /** The status the order moved **to** — the one the sentence names. */
  to: string;
}

export interface QuoteStatusPushEvent {
  eventId: string;
  rfqId: string;
  what: QuoteStatusPushKind;
}

/** The customer preference read; absent row ⇒ both on. */
export interface PushPreferenceReader {
  read(customerAccountId: string): Promise<PushPreferences>;
}

export interface StatusPushComposerDeps {
  orders: Pick<OrderReadPort, 'findById' | 'findStatusDefinition'>;
  /** Only called after {@link StatusPushComposerDeps.isQuoteRequestsPresent} answered `true`. */
  quotes: Pick<QuoteRequestReadPort, 'findById'>;
  /** The `degrades-without` edge's presence decision, asked in front of the port. */
  isQuoteRequestsPresent: () => boolean;
  customerAccounts: Pick<CustomerAccountReadPort, 'findById'>;
  channels: Pick<SalesChannelResolutionPort, 'getById' | 'getSystemDefault'>;
  /** A boolean `pwa.*` setting for a channel; a read that fails answers `false`. */
  isSettingOn: (code: string, salesChannelId: string) => Promise<boolean>;
  preferences: PushPreferenceReader;
  translate: Pick<AdminI18nTranslatePort, 'translate'>;
  messageService: {
    createAndEnqueue(input: CreateMessageInput): Promise<CreateMessageResult>;
  };
  /**
   * `enterSystemScope` in production. The handler inherits whatever tenant
   * context the emitter had — or none, for the expiry sweep — and a
   * `@CustomerScoped` read with no context throws, so the whole sequence runs
   * in one system scope and constrains by `customerAccountId` explicitly.
   */
  runInSystemScope: <T>(reason: string, run: () => Promise<T>) => Promise<T>;
  log: () => PushEventLogger;
}

export interface StatusPushComposer {
  order(event: OrderStatusPushEvent): Promise<StatusPushOutcome>;
  quote(event: QuoteStatusPushEvent): Promise<StatusPushOutcome>;
}

const SCOPE_REASON = 'pwa: a status push names one account and is constrained by it';

type Category = 'order' | 'quote';

const CATEGORY_SETTING: Record<Category, string> = {
  order: PWA_SETTING_CODES.PUSH_ORDER_STATUS_ENABLED,
  quote: PWA_SETTING_CODES.PUSH_QUOTE_STATUS_ENABLED,
};

/** The subject of a status push once its owner has answered. */
interface Subject {
  category: Category;
  eventId: string;
  customerAccountId: string;
  salesChannelId: string | null;
  /** Renders the copy once the language is known. */
  copy: (language: ReturnType<typeof notificationLanguage>) => Promise<StatusPushCopy>;
}

/**
 * The one place the gate order is written down for both automatic triggers
 * (`specs/149-pwa-order-status-push/` research R-11):
 *
 *   1. resolve the subject — `null` (unknown id, guest order) ⇒ skip;
 *   2. resolve the channel — the subject's, or the system default;
 *   3. `pwa.push_enabled` **and** the category switch for that channel;
 *   4. the account — missing, deleted or anonymised ⇒ skip (FR-016);
 *   5. the account's preference for the category (FR-019);
 *   6. render in the channel's language and enqueue for that one account.
 *
 * Cheapest checks first, and nothing is written for a skipped push (SC-006).
 * Producer only: the delivery worker sends. A duplicate `eventId` is answered
 * by `PushMessageService.createAndEnqueue` and the partial unique index behind
 * it (FR-014). Errors propagate to the subscriber, which decides a switched-off
 * owner apart from a failure.
 */
export function createStatusPushComposer(deps: StatusPushComposerDeps): StatusPushComposer {
  async function run(resolve: () => Promise<Subject | StatusPushOutcome>): Promise<StatusPushOutcome> {
    return deps.runInSystemScope(SCOPE_REASON, async () => {
      const subject = await resolve();
      if (typeof subject === 'string') return subject;

      // The subject's own channel, or the system default for a quote raised
      // outside a channel. A channel id the resolver no longer knows is still
      // the channel the devices subscribed on, so it is kept — only its
      // language is unknown, and that falls back to English.
      const channel = subject.salesChannelId
        ? await deps.channels.getById(subject.salesChannelId)
        : await deps.channels.getSystemDefault();
      const channelId = subject.salesChannelId ?? channel?.id;
      if (!channelId) return 'skipped:no_subject';

      const [pushOn, categoryOn] = await Promise.all([
        deps.isSettingOn(PWA_SETTING_CODES.PUSH_ENABLED, channelId),
        deps.isSettingOn(CATEGORY_SETTING[subject.category], channelId),
      ]);
      if (!pushOn || !categoryOn) return 'skipped:switched_off';

      const account = await deps.customerAccounts.findById(subject.customerAccountId);
      if (!account || account.deletedAt || account.anonymizedAt) return 'skipped:no_account';

      const preference = await deps.preferences.read(account.id);
      const wanted = subject.category === 'order' ? preference.orderStatus : preference.quoteStatus;
      if (!wanted) {
        deps.log().debug?.(
          { trigger: subject.category === 'order' ? 'order_status' : 'quote_request', eventId: subject.eventId },
          'pwa.push_skipped_customer_preference',
        );
        return 'skipped:customer_preference';
      }

      const language = notificationLanguage(channel?.defaultLanguage);
      const copy = await subject.copy(language);
      const [title, body] = await Promise.all([
        deps.translate.translate('pwa', copy.titleKey, language, copy.params),
        deps.translate.translate('pwa', copy.bodyKey, language, copy.params),
      ]);

      await deps.messageService.createAndEnqueue({
        salesChannelId: channelId,
        title,
        body,
        url: copy.url,
        audience: { kind: 'customers', customerAccountIds: [account.id] },
        trigger: subject.category === 'order' ? 'order_status' : 'quote_request',
        sourceEventId: subject.eventId,
      });
      return 'enqueued';
    });
  }

  return {
    order: (event) =>
      run(async () => {
        const order = await deps.orders.findById(event.orderId);
        if (!order || !order.placedByCustomerAccountId) return 'skipped:no_subject';
        return {
          category: 'order',
          eventId: event.eventId,
          customerAccountId: order.placedByCustomerAccountId,
          salesChannelId: order.salesChannelId,
          copy: async (language) =>
            orderStatusCopy({
              orderId: order.id,
              businessId: order.businessId,
              statusLabel: orderStatusLabel(
                event.to,
                await deps.orders.findStatusDefinition(event.to),
                language,
              ),
            }),
        };
      }),

    quote: (event) =>
      run(async () => {
        // Presence decided in front of the port (`degrades-without`): with the
        // owner off the port's gate would throw, and nothing here catches it.
        if (!deps.isQuoteRequestsPresent()) return 'skipped:quote_requests_absent';
        const quote = await deps.quotes.findById(event.rfqId);
        if (!quote) return 'skipped:no_subject';
        return {
          category: 'quote',
          eventId: event.eventId,
          customerAccountId: quote.customerAccountId,
          salesChannelId: quote.salesChannelId,
          copy: async () =>
            quoteStatusCopy({ quoteId: quote.id, businessId: quote.businessId, what: event.what }),
        };
      }),
  };
}
