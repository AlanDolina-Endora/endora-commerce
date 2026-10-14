import type { ListingPrice } from '@endora-commerce/contracts';
import type { PricingLineResult } from './pricing-service.interface.js';

/**
 * The catalogue-listing pricing chain (issue #132), as a pure function.
 *
 * The product ruling: **applicable price list → the price assigned directly to
 * the Product → nothing.** There is always one default price list — a system
 * list `PriceListService` refuses to delete, refuses to move out of `active`
 * and pins to a `kind: 'all'` rule — so the first step is the path a listing
 * normally takes and the other two are a genuine margin.
 *
 * The chain lives here, in the module that owns pricing, rather than in the
 * four listing paths that need it. That is the same rule the composition
 * checklist states for a degrade: it belongs inside the owner's implementation
 * and is expressed in the return type, so no consumer can invent a step of its
 * own — which is precisely how four read paths came to render a figure no
 * price list supported.
 *
 * `null` for `line` is the engine's own "nothing applies" answer, which is
 * distinct from "the module is absent": the port gate throws before this
 * function is ever reached.
 */
export function listingPriceFrom(
  line: PricingLineResult | null,
  product: { attributeValues: Record<string, unknown> },
  currencyCode: string,
  /**
   * The currency the Product's own price is in: the sales channel's default,
   * which is the only currency that legacy attribute was ever entered in.
   * Required, not defaulted to `currencyCode`, because that default is the bug:
   * once a listing may be priced in the shopper's currency (issue #249), a
   * 100 PLN attribute relabelled as `currencyCode` would quote 100 EUR.
   */
  ownPriceCurrency: string,
): ListingPrice {
  if (line) {
    return {
      source: 'price_list',
      amount: line.amount,
      currency: line.currency.toUpperCase(),
      priceListId: line.priceListId,
      isSale: line.isSale,
    };
  }
  // A listing in another currency has no own price to fall back to: the
  // attribute carries an amount and no currency, and converting it is not this
  // chain's to do. `none` renders honestly as "no price".
  if (currencyCode.toUpperCase() !== ownPriceCurrency.toUpperCase()) return { source: 'none' };
  const own = productOwnAmount(product);
  if (own === null) return { source: 'none' };
  return { source: 'product', amount: own, currency: currencyCode.toUpperCase() };
}

/**
 * The price assigned directly to the Product — the legacy `defaultPrice` (and
 * older `price`) attribute, read in exactly one place now that the chain is the
 * owner's.
 *
 * Returns a decimal string so the `price_list` and `product` arms of the union
 * carry the same kind of amount, and `null` when there is no number to carry.
 * Zero is a number: it comes back as `'0.00'` and reaches the listing as zero,
 * never as an absence.
 */
function productOwnAmount(product: { attributeValues: Record<string, unknown> }): string | null {
  const raw = product.attributeValues['defaultPrice'] ?? product.attributeValues['price'];
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return value.toFixed(2);
}
