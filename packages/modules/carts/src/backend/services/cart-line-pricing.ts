import type { EntityManager } from '@mikro-orm/postgresql';
import type {
  CatalogProductRecord,
  LinePricePort,
  OrganizationDetailsPort,
  ProductDisplayModePort,
} from '@endora-commerce/contracts';
import { SalesChannel } from '@endora-commerce/platform/kernel';

/**
 * What a cart line may cost at its **current** quantity — the one answer
 * `CartService` stores when a line is added, merged or has its quantity changed,
 * and that order placement compares the stored price with before it copies that
 * price onto the order line.
 *
 * One definition, because two would drift: the stored `unit_price` is what an
 * order is placed at, so a cart that priced a line one way and a placement that
 * checked it another would refuse a basket the buyer cannot repair.
 *
 * The chain:
 *
 *  1. **An agreed price, at the agreed quantity.** A line seeded from an
 *     accepted Quote Request carries the seller's price and the quantity it was
 *     agreed for. It holds only while the line holds that quantity; at any other
 *     quantity the line is priced like any other, and it gets the agreed price
 *     back if it returns to the agreed quantity.
 *  2. **The price list**, at the line's quantity — so a quantity-tier bracket
 *     applies to the quantity actually ordered.
 *  3. **The Product's own price** (the `defaultPrice` / `price` attribute) when
 *     no list applies — the second step of the catalogue's pricing chain
 *     (issue #132), which is what the storefront lists the product at.
 *  4. **Nothing.** A product nobody priced is not orderable; it used to become a
 *     line at `0.00`.
 *
 * A product sold on request only (display mode `none`) is not orderable outside
 * an agreement either.
 *
 * Prices resolve against the system-default sales channel, as cart lines always
 * have — see `CartService`'s constructor note on cart-side channel tracking.
 */

export interface CartLineAgreement {
  quantity: number | null;
  unitPrice: string | null;
  currency: string | null;
}

export interface CartPricingContext {
  channel: { id: string; defaultCurrency: string } | null;
  organization: Awaited<ReturnType<OrganizationDetailsPort['findById']>>;
  organizationId: string | null;
  signedIn: boolean;
}

export interface CartLinePriceInput {
  product: CatalogProductRecord;
  variantId: string | null;
  quantity: number;
  agreed?: CartLineAgreement | null;
}

export type CartLinePriceAnswer =
  | { ok: true; unitPrice: string; currency: string; source: 'agreed' | 'price_list' | 'product' }
  | { ok: false; reason: 'unpriced' | 'quote_only' };

/** The currency a line priced from the Product's own attribute carries, as before. */
const OWN_PRICE_CURRENCY = 'PLN';

export class CartLinePricing {
  constructor(
    private readonly pricingService: LinePricePort,
    private readonly displayModes: ProductDisplayModePort,
    private readonly organizations: OrganizationDetailsPort,
  ) {}

  /** The channel and buyer every line of one cart is priced for, resolved once. */
  async contextFor(
    em: EntityManager,
    input: { organizationId: string | null; signedIn: boolean },
  ): Promise<CartPricingContext> {
    const channel = await em.findOne(
      SalesChannel,
      { systemDefault: true },
      { fields: ['id', 'defaultCurrency'] },
    );
    const organization = input.organizationId
      ? await this.organizations.findById(input.organizationId)
      : null;
    return {
      channel: channel ? { id: channel.id, defaultCurrency: channel.defaultCurrency } : null,
      organization,
      organizationId: input.organizationId,
      signedIn: input.signedIn,
    };
  }

  async orderablePrice(ctx: CartPricingContext, line: CartLinePriceInput): Promise<CartLinePriceAnswer> {
    const agreed = agreedUnitPriceFor(line.quantity, line.agreed ?? null);
    if (agreed) return { ok: true, ...agreed, source: 'agreed' };

    // No `catch` (issue #84): `null` is the engine's own "no list applies", and
    // an absent `price_lists` throws `MODULE_DISABLED` through this call.
    const resolved = ctx.channel
      ? await this.pricingService.resolveLinePrice({
          product: line.product,
          variantId: line.variantId,
          context: {
            quantity: line.quantity,
            ...(ctx.organization ? { organization: ctx.organization } : {}),
            salesChannel: ctx.channel,
          },
        })
      : null;
    // Issue #236 — the mode is read off the list price when there is one, and
    // asked for on its own when there is not.
    const displayMode =
      resolved?.displayMode ??
      (ctx.channel
        ? await this.displayModes.resolveDisplayMode({
            productId: line.product.id,
            organizationId: ctx.organizationId,
            salesChannelId: ctx.channel.id,
            customerKind: ctx.signedIn ? 'signed_in' : 'guest',
          })
        : null);
    if (displayMode === 'none') return { ok: false, reason: 'quote_only' };
    if (resolved) {
      return {
        ok: true,
        unitPrice: Number(resolved.amount).toFixed(2),
        currency: resolved.currency,
        source: 'price_list',
      };
    }
    const own = productOwnUnitPrice(line.product.attributeValues);
    if (own === null) return { ok: false, reason: 'unpriced' };
    return { ok: true, unitPrice: own, currency: OWN_PRICE_CURRENCY, source: 'product' };
  }
}

/** The agreed price, when the line holds the quantity it was agreed for. */
export function agreedUnitPriceFor(
  quantity: number,
  agreed: CartLineAgreement | null,
): { unitPrice: string; currency: string } | null {
  if (!agreed || agreed.quantity == null || agreed.unitPrice == null || agreed.currency == null) {
    return null;
  }
  if (agreed.quantity !== quantity) return null;
  return { unitPrice: Number(agreed.unitPrice).toFixed(2), currency: agreed.currency };
}

/**
 * The Product's own price — the legacy `defaultPrice` (and older `price`)
 * attribute — or `null` when it carries no non-negative number. Zero is a price
 * an operator entered and stays one.
 */
export function productOwnUnitPrice(attributeValues: Record<string, unknown>): string | null {
  const raw = attributeValues['defaultPrice'] ?? attributeValues['price'];
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return value.toFixed(2);
}

/** Whether a stored line price is not the price the line may be ordered at now. */
export function storedPriceDiffers(
  stored: { unitPrice: string; currency: string },
  current: { unitPrice: string; currency: string } | null,
): boolean {
  if (!current) return true;
  if (stored.currency.toUpperCase() !== current.currency.toUpperCase()) return true;
  return Number(stored.unitPrice).toFixed(2) !== Number(current.unitPrice).toFixed(2);
}

/** The agreement a line carries, in the shape `CartLinePricing` reads. */
export function agreementOf(item: {
  agreedQuantity?: number | null;
  agreedUnitPrice?: string | null;
  agreedCurrency?: string | null;
}): CartLineAgreement {
  return {
    quantity: item.agreedQuantity ?? null,
    unitPrice: item.agreedUnitPrice ?? null,
    currency: item.agreedCurrency ?? null,
  };
}
