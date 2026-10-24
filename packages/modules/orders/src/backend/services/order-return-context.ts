import type { EntityManager } from '@mikro-orm/postgresql';
import { Order } from '../entities/order.entity.js';
import type { OrderReturnContext, OrderReturnContextPort } from '@endora-commerce/contracts';
import { loadArrangedOrderLines } from './order-line-order.js';
import { paidAmounts } from './order-money.js';

/**
 * Orders-side implementation of `OrderReturnContextPort` (feature 046, R4).
 * Exposes the order facts the returns module needs through a single documented
 * interface, so the returns module never reads `orders` tables directly.
 *
 * The interface itself is published in `@endora-commerce/contracts` (feature 075, Phase P);
 * `returns` declares the shape it needs and this module implements it, which is
 * the direction the port was designed in and the reason it can be named from
 * both sides without either module importing the other.
 *
 * MVP note: the fulfilment-completing anchor uses the orders default completing
 * status (`completed`) and the order's `updatedAt` as the entered-at timestamp.
 * A precise per-status timestamp (an additive `orders.completed_at` column) is a
 * planned refinement (research R4) and does not change this interface.
 */
const COMPLETING_STATUS = 'completed';

export class OrderReturnContextProvider implements OrderReturnContextPort {
  constructor(private readonly emFactory: () => EntityManager) {}

  async getReturnContext(orderId: string): Promise<OrderReturnContext | null> {
    const em = this.emFactory();
    const order = await em.findOne(Order, { id: orderId });
    if (!order) return null;
    // Feature 159 — the lines in the order's display order.
    const items = (await loadArrangedOrderLines(em, orderId)).lines;

    const completing = order.status === COMPLETING_STATUS;
    // What each line was charged under the one VAT method, over the whole
    // order — the figure its order line and its invoice carry (issue #417).
    const paidByLine = paidAmounts(
      items.map((it) => ({ unitPrice: it.unitPrice, taxRate: it.taxRate, quantity: it.quantity })),
    );
    const lines = items.map((it, index) => {
      const paid = paidByLine[index]!;
      return {
        orderItemId: it.id,
        productId: it.productId,
        name: it.productSnapshot.name,
        purchasedQty: it.quantity,
        // Decimals read as numbers losslessly (the unit amount is informational).
        paidUnitAmount: Number(paid.paidUnitAmount),
        paidLineAmount: Number(paid.paidLineAmount),
        // The net unit price and the rate, so `returns` prices a returned
        // quantity under the same VAT method.
        unitNetPrice: it.unitPrice,
        taxRate: it.taxRate,
        // Feature 155 (FR-016a) — the stamp placement recorded, reported as
        // it is: `null` only on a line placed before the feature. What `null`
        // means for a return (FR-025) is `returns`' policy, not this port's.
        returnableAtPurchase: it.returnableAtPurchase ?? null,
      };
    });

    return {
      salesChannelId: order.salesChannelId,
      customerAccountId: order.placedByCustomerAccountId,
      organizationId: order.organizationId ?? null,
      currency: order.currency,
      completingStatusEnteredAt: completing ? order.updatedAt : null,
      lines,
    };
  }
}
