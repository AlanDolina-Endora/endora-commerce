import type { ReactNode } from 'react';
import { apiClient } from '@endora-commerce/admin-kit/lib';
import { useTranslation } from '@endora-commerce/admin-kit/i18n';
import {
  formatSignedAmount,
  formatSignedPercent,
  referenceDifference,
  type ReferenceAmount,
} from './reference-difference.js';

/**
 * Feature 146 — the reference-price plumbing of the admin quote request detail
 * (FR-002 – FR-007): which reference a line shows, the probe that asks for the
 * customer's current price, and the two cells Overview and Modify render.
 * `reference-difference.ts` holds the arithmetic; this file holds the view.
 */

/** The fields of an admin quote request line this view reads. */
export interface ReferenceLine {
  id: string;
  desiredUnitPrice: number | null;
  /**
   * The reference unit price stored when the line was created ("price at
   * request"); `null` = none stored, so the screen asks for the customer's
   * current price instead (FR-006).
   */
  referencePrice?: { amount: number; currency: string; capturedAt: string } | null;
  /** The customer's proposal, surviving admin revisions (FR-002). */
  customerProposedUnitPrice?: number | null;
}

/** Whose price the probe asks for, and on which channel (`null` = system default). */
export interface ProbeBuyer {
  customerAccountId: string;
  salesChannelId?: string | null;
}

/**
 * A line's reference price as the screen shows it (feature 146, FR-002,
 * FR-006): the one stored at request; else the customer's current price, asked
 * for on read; else none. `pending` while the current price is being asked for.
 */
export type ReferenceView =
  | { kind: 'atRequest'; price: ReferenceAmount }
  | { kind: 'current'; price: ReferenceAmount }
  | { kind: 'none' }
  | { kind: 'pending' };

/** Current prices by line id: `null` = the probe answered no price, or failed. */
export type CurrentPrices = Record<string, ReferenceAmount | null>;

export function referenceViewOf(item: ReferenceLine, currentPrices: CurrentPrices): ReferenceView {
  if (item.referencePrice) {
    return {
      kind: 'atRequest',
      price: { amount: item.referencePrice.amount, currency: item.referencePrice.currency },
    };
  }
  if (!(item.id in currentPrices)) return { kind: 'pending' };
  const price = currentPrices[item.id] ?? null;
  return price ? { kind: 'current', price } : { kind: 'none' };
}

export function referencePriceOf(view: ReferenceView): ReferenceAmount | null {
  return view.kind === 'atRequest' || view.kind === 'current' ? view.price : null;
}

/** The customer's proposal for a line; older replies carry only `desiredUnitPrice`. */
export function proposalOf(item: ReferenceLine): number | null {
  return item.customerProposedUnitPrice !== undefined
    ? item.customerProposedUnitPrice
    : item.desiredUnitPrice;
}

/**
 * The price the request's customer would pay for a line today, on the channel
 * the request was raised on (FR-006, FR-007) — through the admin probe, which
 * answers only about organizations the caller may see. **Any** failure — a 403
 * for a caller without `price_lists:read` (FR-031, advisory), a 404 or 400 for
 * an out-of-scope or mismatched buyer, a 5xx, a dropped connection — answers
 * `null`, so the screen shows "no price" and never breaks (L2).
 */
export async function probeCustomerPrice(
  rfq: ProbeBuyer,
  line: { productId: string; variantId?: string | null; quantity: number },
): Promise<ReferenceAmount | null> {
  try {
    const params = new URLSearchParams({
      customerAccountId: rfq.customerAccountId,
      quantity: String(line.quantity > 0 ? line.quantity : 1),
    });
    if (rfq.salesChannelId) params.set('salesChannelId', rfq.salesChannelId);
    if (line.variantId) params.set('variantId', line.variantId);
    const res = await apiClient.get<{
      data: { resolvedPrice: { amount: string; currency: string } | null };
    }>(`/api/v1/admin/products/${line.productId}/resolved-price?${params.toString()}`);
    const resolved = res.data.resolvedPrice;
    if (!resolved) return null;
    const amount = Number(resolved.amount);
    return Number.isFinite(amount) ? { amount, currency: resolved.currency } : null;
  } catch {
    return null;
  }
}

/** The reference cell: the amount, then what kind of price it is. */
export function ReferenceCell({
  view,
  perBaseUnit,
}: {
  view: ReferenceView;
  perBaseUnit: boolean;
}): ReactNode {
  const t = useTranslation('core');
  if (view.kind === 'pending') return <span className="text-muted-foreground">—</span>;
  if (view.kind === 'none') {
    return <span className="text-xs text-muted-foreground">{t('rfq.detail.reference.none')}</span>;
  }
  return (
    <div className="space-y-0.5">
      <div className="tabular-nums">
        {view.price.amount.toFixed(2)} {view.price.currency}
      </div>
      <div className="flex flex-wrap gap-x-1 text-xs text-muted-foreground">
        <span>
          {view.kind === 'atRequest'
            ? t('rfq.detail.reference.atRequest')
            : t('rfq.detail.reference.current')}
        </span>
        {perBaseUnit ? <span>· {t('rfq.detail.reference.perBaseUnit')}</span> : null}
      </div>
    </div>
  );
}

/**
 * The difference cell: amount over percentage, signed, or "—" when it cannot
 * be computed (FR-005). The sign is spelled out, never carried by colour alone.
 */
export function DifferenceCell({
  price,
  currency,
  reference,
}: {
  price: number | null;
  currency: string;
  reference: ReferenceAmount | null;
}): ReactNode {
  const difference = referenceDifference(price, currency, reference);
  if (difference === null) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="space-y-0.5 tabular-nums">
      <div>
        {formatSignedAmount(difference.amount)} {currency}
      </div>
      <div className="text-xs text-muted-foreground">
        {difference.percent !== null ? formatSignedPercent(difference.percent) : '—'}
      </div>
    </div>
  );
}
