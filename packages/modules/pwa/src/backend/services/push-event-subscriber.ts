import {
  ModuleDisabledError,
  type PlatformLogger,
} from '@endora-commerce/platform/kernel';
import type { StatusPushComposer } from './status-push-composer.js';
import type { QuoteStatusPushKind } from './status-push-copy.js';

/**
 * Where a skipped or failed auto-trigger push is written down.
 *
 * The structured-logger surface the kernel already defines, for the reason it
 * exists: these two handlers run outside any request, so `request.log` does not
 * exist and the line has to carry its own context. The alias is kept because it
 * names this module's role for the field; the shape is the platform's.
 */
export type PushEventLogger = PlatformLogger & {
  /**
   * Present on the application's logger (`app.log`), absent on the pre-route
   * fallback. Used for the one deliberately quiet line — a push the customer
   * opted out of (`specs/149-pwa-order-status-push/`) — which is routine, not
   * news, and must not land at `info` once per status change.
   */
  debug?(obj: object, msg: string): void;
};

export interface PushEventSubscriberDeps {
  composer: StatusPushComposer;
  /**
   * Read per line rather than captured, because the logger these handlers
   * should be writing to does not exist yet when they are built: composition
   * runs before `buildServer`, so `ctx.log` is whatever the root could offer
   * that early, and the application's own logger only arrives when the module's
   * routes are registered. `plugin.ts` moves the holder along; the handlers ask
   * for it at the moment they have something to say.
   */
  log: () => PushEventLogger;
}

type PushTriggerName = 'order_status' | 'quote_request';

/** A non-empty string field of an untyped payload, or `null`. */
function stringField(payload: unknown, field: string): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = (payload as Record<string, unknown>)[field];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * The automatic status-push handlers (FR-024 of feature 046, reshaped by
 * `specs/149-pwa-order-status-push/`): one for `order.status_changed.v1` and
 * one per consumed `rfq.*` event. Each reads its payload defensively — the bus
 * hands it over untyped, and a payload missing what the composer needs is
 * dropped — and hands the rest to the {@link StatusPushComposer}, which owns
 * the gates. One push message per event, idempotent on the event id; producer
 * only — nothing is sent inline (Principle X), and every handler absorbs its
 * own failure so a push problem never breaks the business transaction that
 * announced itself.
 *
 * The subscriptions live in this module's `backend/index.ts` and go through
 * `ctx.subscribe` (issue #107). They were bare `eventBus.on` calls here, so
 * a switched-off `pwa` still wrote a `push_messages` row and still delivered a
 * notification to a customer's device — the most visible of the writes that
 * survived their module.
 *
 * ## Why the `catch` stays, and what it is no longer allowed to hide
 *
 * `PushMessageService` reaches `customer_accounts` and `organizations` through
 * gated ports (feature 075, Phase C), so a rule-targeted send can raise
 * `ModuleDisabledError` here. `rethrowIfModuleDisabled` — the usual remedy —
 * is the wrong one at this seam: an EventBus subscriber has no caller to answer.
 * `EventBus.dispatch` isolates each handler in its own `try` and turns a throw
 * into one `console.warn` line naming neither the module nor the trigger, so
 * re-throwing would hand the presence answer to a place that discards it, and a
 * probe before the work would make `pwa` name the two owners the port exists to
 * hide.
 *
 * So the presence answer is **decided here, by name** — the third of the four
 * shapes `check-port-catches` accepts — and it is decided into a different
 * sentence from a failure. The outcome is the same for both (no push, the
 * announcing transaction untouched, per FR-024); the record is not, because an
 * operator's own switch doing what it says and a broken enqueue are not one
 * event. That is the rule under Principle XVII item 3: where nothing can catch
 * the throw, a genuine failure and a switched-off module must not share one
 * silent no-op.
 */
export function createPushEventHandlers(deps: PushEventSubscriberDeps): {
  onOrderStatusChanged: (payload: unknown) => Promise<void>;
  onQuoteStatusEvent: (what: QuoteStatusPushKind) => (payload: unknown) => Promise<void>;
} {
  async function absorb(
    trigger: PushTriggerName,
    eventId: string,
    produce: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await produce();
    } catch (err) {
      // Decided at the site, not delegated: the identifier below is the whole
      // of what tells an operator's switch from an incident, and a helper
      // holding it would let a later edit lose the distinction silently.
      if (err instanceof ModuleDisabledError) {
        deps.log().warn(
          { module: err.moduleId, trigger, eventId },
          'pwa.push_skipped_module_disabled',
        );
        return;
      }
      deps.log().error({ err, trigger, eventId }, 'pwa.push_enqueue_failed');
    }
  }

  return {
    // order.status_changed.v1 (orders, feature 038)
    async onOrderStatusChanged(raw: unknown): Promise<void> {
      const eventId = stringField(raw, 'eventId');
      const orderId = stringField(raw, 'orderId');
      const to = stringField(raw, 'to');
      if (!eventId || !orderId || !to) return;
      await absorb('order_status', eventId, () => deps.composer.order({ eventId, orderId, to }));
    },

    // rfq.created_by_admin / modified / approved / canceled / expired (quote_requests)
    onQuoteStatusEvent(what: QuoteStatusPushKind) {
      return async (raw: unknown): Promise<void> => {
        const eventId = stringField(raw, 'eventId');
        const rfqId = stringField(raw, 'rfqId');
        if (!eventId || !rfqId) return;
        await absorb('quote_request', eventId, () => deps.composer.quote({ eventId, rfqId, what }));
      };
    },
  };
}
