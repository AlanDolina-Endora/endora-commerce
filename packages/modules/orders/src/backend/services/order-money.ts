import {
  decimalDifference,
  decimalSum,
  lineAmountHalfUp,
  quotientHalfUp,
  roundHalfUp,
  vatByRate,
} from '@endora-commerce/contracts';

/** A line as the order prices it: the cart's stored unit price, its quantity and its rate (a fraction). */
export interface OrderMoneyLine {
  unitPrice: string | number;
  quantity: number;
  taxRate: string | number;
}

/** One order line's amounts, as `order_items` stores them. */
export interface OrderLineMoney {
  /** `unitPrice × quantity`, two places. */
  net: string;
  /** `lineTotal`: the net plus the line's share of its rate's VAT — informational. */
  gross: string;
  /** The rate at four places. */
  taxRate: string;
}

/**
 * An order's totals, at two places, under **the one VAT method** (`vatByRate`,
 * owner ruling of 2026-10-24, issue #417; art. 106e ust. 1 pkt 13–14): per
 * rate, VAT on the sum of the lines' nets at that rate, rounded half-up once.
 * The subtotal is the nets' sum; delivery, the payment surcharge and the
 * discount are added and subtracted on the gross without tax of their own (the
 * invoice carries them as 0 % lines); the total is rounded once. The one
 * computation placement, the checkout preview and the admin preview share, and
 * the invoice computes the same figures with the same function — so the paid
 * amount, the proforma, the order total and the invoice gross are one number.
 *
 * `lines` is each line's stored amounts: a line's gross is its net plus its
 * share of its rate's VAT, so the line grosses add up to the products' gross.
 */
export function orderTotalsMoney(input: {
  lines: readonly OrderMoneyLine[];
  deliveryTotal: string | number;
  paymentSurcharge: string | number;
  discountTotal: string | number;
}): {
  subtotal: string;
  taxTotal: string;
  deliveryTotal: string;
  paymentSurcharge: string;
  discountTotal: string;
  total: string;
  lines: OrderLineMoney[];
} {
  const nets = input.lines.map((l) => lineAmountHalfUp(l.unitPrice, l.quantity));
  const vat = vatByRate(
    input.lines.map((l, i) => ({ net: nets[i]!, rate: l.taxRate })),
    'fraction',
  );
  const deliveryTotal = roundHalfUp(input.deliveryTotal);
  const paymentSurcharge = roundHalfUp(input.paymentSurcharge);
  const discountTotal = roundHalfUp(input.discountTotal);
  const total = roundHalfUp(
    decimalDifference(decimalSum(vat.net, vat.vat, deliveryTotal, paymentSurcharge), discountTotal),
  );
  return {
    subtotal: vat.net,
    taxTotal: vat.vat,
    deliveryTotal,
    paymentSurcharge,
    discountTotal,
    total,
    lines: input.lines.map((l, i) => ({
      net: nets[i]!,
      gross: vat.lines[i]!.gross,
      taxRate: roundHalfUp(l.taxRate, 4),
    })),
  };
}

/**
 * What a buyer paid for each line, as a return refunds it by default
 * (`OrderReturnContextPort`): the line's gross under the one VAT method — its
 * net plus its share of its rate's VAT, over the lines given — and that over
 * the quantity at four places, for display. Given the whole order, a line's
 * amount is what the order line and the invoice charged for it (V3: 9.05 × 3
 * at 8 % is 29.32, where the paid unit gross × 3 was 29.31).
 */
export function paidAmounts(
  lines: readonly OrderMoneyLine[],
): Array<{ paidLineAmount: string; paidUnitAmount: string }> {
  const { lines: money } = orderTotalsMoney({ lines, deliveryTotal: 0, paymentSurcharge: 0, discountTotal: 0 });
  return money.map((m, i) => ({
    paidLineAmount: m.gross,
    paidUnitAmount: quotientHalfUp(m.gross, lines[i]!.quantity || 1, 4),
  }));
}
