import { compareDecimals, moneyDifference, moneySum, type OrderReturnRefund } from '@endora-commerce/contracts';

/** What an invoice is told about the order's money when it is issued. */
export interface InvoicePaidInput {
  /** The order's stored total (a two-place decimal). */
  readonly orderTotal: string | number;
  /** The order's payment status. */
  readonly paymentStatus: string;
  /** The kind of the order's payment method, as placement stamped it; `null` when unknown. */
  readonly paymentKind: string | null;
  /** What `payments` captured and refunded over the captured attempts; `null` when nothing was captured or `payments` is absent. */
  readonly payments: { readonly captured: string; readonly refunded: string } | null;
  /** The money-moving resolutions of the order's settled return cases; empty when `returns` is absent. */
  readonly returnRefunds: readonly OrderReturnRefund[];
}

export interface InvoicePaidPosition {
  /** What the buyer paid and kept paid: received less refunded, never below 0. */
  readonly paid: string;
  /** Everything refunded for the order, each refund once. */
  readonly refunded: string;
  /** The refunds return everything received and cover the whole order (owner ruling of 2026-10-24). */
  readonly refundedInFull: boolean;
}

/**
 * What an invoice records as paid, and whether the order was refunded in full
 * before it was invoiced — issue #417, extended by issue #428 to the refunds
 * that never pass through `payments`
 * (`specs/pricing/worked-examples.md` §10.17).
 *
 * **Received.** What `payments` captured, over the captured attempts; with
 * nothing captured, the order's stored total when the order is recorded as paid
 * (a transfer an operator confirmed) or as refunded (it was paid, then refunded);
 * otherwise nothing — an order on credit terms is unpaid by arrangement.
 *
 * **Refunded, each refund once.**
 * - What `payments` recorded as refunded from the captured attempts — a gateway
 *   refund, reflected by the gateway's webhook.
 * - The issued refunds of the order's settled returns that `payments` never
 *   sees: every credit-limit top-up, and every money refund of an order whose
 *   method is not a gateway (the payments provider records those as issued and
 *   an operator makes the transfer). A gateway order's money refund is the
 *   gateway's, and `payments` already counts it. A refund still waiting for a
 *   person (`pending_manual`) has not happened and is not counted.
 * - An order an operator marked refunded with nothing captured was refunded in
 *   full: at least its total, and the returns' manual refunds are part of that
 *   one refund, not a second one.
 *
 * **Paid** is received less refunded, and never below 0: a credit-limit top-up
 * for an order on credit terms reduces nothing that was paid.
 */
export function invoicePaidPosition(input: InvoicePaidInput): InvoicePaidPosition {
  const outsidePayments = moneySum(
    input.returnRefunds
      .filter(
        (refund) =>
          refund.settlementState === 'issued' &&
          (refund.resolutionType === 'credit' || input.paymentKind !== 'gateway'),
      )
      .map((refund) => refund.amount),
  );

  let received: string;
  let refunded: string;
  if (input.payments) {
    received = moneySum([input.payments.captured]);
    refunded = moneySum([input.payments.refunded, outsidePayments]);
  } else if (input.paymentStatus === 'paid') {
    received = moneySum([input.orderTotal]);
    refunded = outsidePayments;
  } else if (input.paymentStatus === 'refunded') {
    received = moneySum([input.orderTotal]);
    refunded = compareDecimals(outsidePayments, received) >= 0 ? outsidePayments : received;
  } else {
    received = '0.00';
    refunded = outsidePayments;
  }

  const kept = moneyDifference(received, refunded);
  return {
    paid: compareDecimals(kept, 0) > 0 ? kept : '0.00',
    refunded,
    refundedInFull: compareDecimals(refunded, received) >= 0 && compareDecimals(refunded, input.orderTotal) >= 0,
  };
}
