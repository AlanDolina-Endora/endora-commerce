import {
  decimalDifference,
  decimalSum,
  grossFromNetHalfUp,
  lineAmountHalfUp,
  moneySum,
  roundHalfUp,
  taxAmountExact,
} from '@endora-commerce/contracts';

/** A line as the order prices it: the cart's stored unit price, its quantity and its rate (a fraction). */
export interface OrderMoneyLine {
  unitPrice: string | number;
  quantity: number;
  taxRate: string | number;
}

/**
 * One order line's amounts, as `order_items` stores them: the net
 * (`unitPrice × quantity`), the **gross** (`lineTotal`: the net × (1 + rate),
 * rounded half-up on its own) and the rate at four places. Exact decimal
 * arithmetic (issue #417): `(29.5 * 1.23).toFixed(2)` rounded the double
 * 36.28499… down to 36.28.
 */
export function orderLineMoney(line: OrderMoneyLine): { net: string; gross: string; taxRate: string } {
  const net = lineAmountHalfUp(line.unitPrice, line.quantity);
  return {
    net,
    gross: grossFromNetHalfUp(net, line.taxRate, 'fraction'),
    taxRate: roundHalfUp(line.taxRate, 4),
  };
}

/**
 * An order's totals, at two places, under the rule placement has always
 * applied: the subtotal is the sum of the lines' nets; the tax is the sum of
 * the lines' **exact** taxes, rounded half-up once (not each line's rounded
 * tax — `specs/pricing/worked-examples.md` §10.17, V2); delivery, the payment
 * surcharge and the discount are added and subtracted on the gross without tax
 * of their own; the total is rounded once. The one computation placement, the
 * checkout preview and the admin preview share.
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
} {
  const subtotal = moneySum(input.lines.map((l) => lineAmountHalfUp(l.unitPrice, l.quantity)));
  const taxTotal = roundHalfUp(
    decimalSum(...input.lines.map((l) => taxAmountExact(lineAmountHalfUp(l.unitPrice, l.quantity), l.taxRate, 'fraction'))),
  );
  const deliveryTotal = roundHalfUp(input.deliveryTotal);
  const paymentSurcharge = roundHalfUp(input.paymentSurcharge);
  const discountTotal = roundHalfUp(input.discountTotal);
  const total = roundHalfUp(
    decimalDifference(decimalSum(subtotal, taxTotal, deliveryTotal, paymentSurcharge), discountTotal),
  );
  return { subtotal, taxTotal, deliveryTotal, paymentSurcharge, discountTotal, total };
}

/**
 * What a buyer paid for one unit of a line, and for the line, as a return
 * refunds it by default (`OrderReturnContextPort`): the unit price's gross,
 * half-up, times the quantity. This is the rule the port has always applied —
 * per-unit gross × quantity, which can differ from the line's own gross
 * (`orderLineMoney`) by a rounding cent — now in exact decimal arithmetic
 * (issue #417): rounding the double made 16.50 at 23 % the unit gross 20.29.
 */
export function paidAmounts(line: OrderMoneyLine): { paidUnitAmount: string; paidLineAmount: string } {
  const paidUnitAmount = grossFromNetHalfUp(line.unitPrice, line.taxRate, 'fraction');
  return { paidUnitAmount, paidLineAmount: lineAmountHalfUp(paidUnitAmount, line.quantity) };
}
