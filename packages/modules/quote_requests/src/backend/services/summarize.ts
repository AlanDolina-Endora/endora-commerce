import type { QuoteRequestSummary } from '@endora-commerce/contracts';
import type { QuoteRequest } from '../entities/quote-request.entity.js';
import type { QuoteRequestItem } from '../entities/quote-request-item.entity.js';

/**
 * The customer list's row for one quote request.
 *
 * Both totals follow one rule — **every line, or `null`** (FR-009). The
 * customer-price total exists only when every line carries a customer proposal:
 * a request with no proposal (cart-converted, raised by a locked customer) or
 * with proposals on some lines only has no customer-price total, never `0` and
 * never a partial sum, and the reference price is not a fallback for it. The
 * admin list applies the same rule; the storefront renders `null` as "—".
 */
export function summarize(
  rfq: QuoteRequest,
  items: QuoteRequestItem[],
  extras: { requesterDisplayName?: string | null; taxRate?: number },
): QuoteRequestSummary {
  const totalAtCustomerPrice =
    items.length > 0 && items.every((it) => it.desiredUnitPrice != null)
      ? items.reduce((sum, it) => sum + Number(it.desiredUnitPrice) * it.quantity, 0)
      : null;
  const totalAtAgreedPrice = items.every((it) => it.agreedUnitPrice != null)
    ? items.reduce((sum, it) => sum + Number(it.agreedUnitPrice ?? 0) * it.quantity, 0)
    : null;
  const currency = items[0]?.lineCurrency ?? 'PLN';
  return {
    id: rfq.id,
    businessId: rfq.businessId,
    organizationId: rfq.organizationId,
    customerAccountId: rfq.customerAccountId,
    status: rfq.status,
    awaitingCustomerRevisionAcceptance: rfq.awaitingCustomerRevisionAcceptance,
    lineCount: items.length,
    totalAtCustomerPrice,
    totalAtAgreedPrice,
    taxRate: extras.taxRate ?? 0,
    currency,
    submittedAt: rfq.submittedAt?.toISOString() ?? null,
    expiresAt: rfq.expiresAt?.toISOString() ?? null,
    createdAt: rfq.createdAt.toISOString(),
    updatedAt: rfq.updatedAt.toISOString(),
    version: rfq.version,
    originalRequester: {
      customerAccountId: rfq.customerAccountId,
      displayName: extras.requesterDisplayName ?? null,
    },
  };
}
