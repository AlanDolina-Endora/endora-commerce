import {
  ERROR_CODES,
  type BuyerLinePriceAnswer,
  type BuyerLinePricePort,
  type BuyerLinePriceQuery,
  type CatalogProductReadPort,
  type CustomerAccountReadPort,
  type OrganizationDetailsPort,
} from '@endora-commerce/contracts';
import { HttpError } from '@endora-commerce/platform/http';
import type { PricingServiceContract } from './pricing-service.interface.js';

/**
 * How many lines one chunk resolves. Each chunk is one product read (an `IN`
 * list of at most this many ids), so a 200-line cart conversion is a few
 * bounded queries rather than one unbounded list (threat model T11).
 */
export const BUYER_LINE_PRICE_CHUNK_SIZE = 100;

/** The two fields the engine reads off a channel. */
export interface BuyerPriceChannel {
  id: string;
  defaultCurrency: string;
}

/**
 * The channel lookups the service needs. `SalesChannel` is a kernel entity this
 * module already reads; the narrow seam keeps the service free of an
 * `EntityManager`, so its rules are unit-testable.
 */
export interface BuyerPriceChannelLookup {
  /** Only ever called with a well-formed uuid. */
  findById(id: string): Promise<BuyerPriceChannel | null>;
  findSystemDefault(): Promise<BuyerPriceChannel | null>;
}

export interface BuyerLinePriceServiceDeps {
  pricingService: Pick<PricingServiceContract, 'resolveLinePrice'>;
  catalogProductRead: Pick<CatalogProductReadPort, 'findByIds'>;
  customerAccountRead: Pick<CustomerAccountReadPort, 'findById'>;
  organizationDetails: Pick<OrganizationDetailsPort, 'findById'>;
  salesChannels: BuyerPriceChannelLookup;
}

/** One answer plus whether its product exists — the probe needs the second half for its 404. */
export interface BuyerLinePriceDetailedAnswer extends BuyerLinePriceAnswer {
  productFound: boolean;
  /**
   * Feature 148 / FR-020 — the price matrix entry that priced the line, or
   * `null`. The admin probe's explanation only: `resolveForBuyer` strips it, so
   * the published `BuyerLinePriceAnswer` is not widened (D-77).
   */
  matrixEntryId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One message for a malformed and an unknown channel id alike, and neither
 * echoes the id: the answer must not tell a caller which ids exist (T8).
 */
function unknownChannel(): HttpError {
  return new HttpError(400, ERROR_CODES.VALIDATION_FAILED, 'Unknown sales channel.');
}

/**
 * The net unit price a buyer would pay for each line, on a given channel, now
 * (`specs/146-quote-request-pricing-history/research.md` R2).
 *
 * This is the body the admin resolved-price probe used to run inline, lifted
 * out so the probe and `buyerLinePricePort` are one implementation: a quote's
 * "price at request" (written by the server at submission) and its "current
 * price" (read by the admin screen through the probe) are the same question
 * asked at two moments. Customer group precedence is unchanged from the probe —
 * the account's own group, else its organization's.
 *
 * **No authority check.** The HTTP probe, which serves arbitrary admin input,
 * scopes the organization before it calls this; the port's one caller passes
 * the owner of a quote request it already authorised. What it does check is
 * consistency: an account named with an organization it does not belong to is
 * refused `400 VALIDATION_FAILED`, the probe's own answer for that mismatch.
 */
export class BuyerLinePriceService implements BuyerLinePricePort {
  constructor(private readonly deps: BuyerLinePriceServiceDeps) {}

  async resolveForBuyer(query: BuyerLinePriceQuery): Promise<BuyerLinePriceAnswer[]> {
    const detailed = await this.resolveDetailed(query);
    return detailed.map(({ key, price }) => ({ key, price }));
  }

  async resolveDetailed(query: BuyerLinePriceQuery): Promise<BuyerLinePriceDetailedAnswer[]> {
    // The channel first: an unknown one is refused before anything is read.
    const salesChannel = await this.#channel(query.salesChannelId);
    if (query.lines.length === 0) return [];

    const customer = query.buyer.customerAccountId
      ? await this.deps.customerAccountRead.findById(query.buyer.customerAccountId)
      : null;
    // An account and an organization named together must be one pair: the
    // organization's lists would otherwise price the account's customer group
    // on another tenant's terms. The probe refuses the same mismatch before it
    // calls this (`authorizeBuyer`); here it holds for the port's callers too
    // (security review W2).
    if (
      customer &&
      query.buyer.organizationId !== null &&
      customer.organizationId !== query.buyer.organizationId
    ) {
      throw new HttpError(
        400,
        ERROR_CODES.VALIDATION_FAILED,
        'The customer account is not a member of the organization.',
      );
    }
    const organizationId = query.buyer.organizationId ?? customer?.organizationId ?? null;
    const organization = organizationId
      ? await this.deps.organizationDetails.findById(organizationId)
      : null;
    const customerGroupId = customer?.customerGroupId ?? organization?.customerGroupId ?? null;
    const currencyCode = query.currencyCode?.toUpperCase() ?? salesChannel.defaultCurrency;

    const answers: BuyerLinePriceDetailedAnswer[] = [];
    for (let start = 0; start < query.lines.length; start += BUYER_LINE_PRICE_CHUNK_SIZE) {
      const chunk = query.lines.slice(start, start + BUYER_LINE_PRICE_CHUNK_SIZE);
      const products = await this.deps.catalogProductRead.findByIds([
        ...new Set(chunk.map((line) => line.productId)),
      ]);
      const byId = new Map(products.map((product) => [product.id, product]));
      // Sequential within a chunk: the engine reads per line, and a chunk is
      // the bound on how much one call may ask of the database at once.
      for (const line of chunk) {
        const product = byId.get(line.productId);
        if (!product) {
          answers.push({ key: line.key, price: null, productFound: false, matrixEntryId: null });
          continue;
        }
        const resolved = await this.deps.pricingService.resolveLinePrice({
          product,
          variantId: line.variantId ?? null,
          context: {
            quantity: Math.max(1, line.quantity || 1),
            organization: organization ?? null,
            customerGroupId,
            salesChannel,
            currencyCode,
          },
        });
        answers.push({
          key: line.key,
          price: resolved
            ? {
                amount: resolved.amount,
                currency: resolved.currency,
                isSale: resolved.isSale,
                priceListId: resolved.priceListId,
              }
            : null,
          productFound: true,
          matrixEntryId: resolved?.matrixEntryId ?? null,
        });
      }
    }
    return answers;
  }

  async #channel(salesChannelId: string | null): Promise<BuyerPriceChannel> {
    if (salesChannelId === null) {
      const fallback = await this.deps.salesChannels.findSystemDefault();
      if (!fallback) {
        throw new HttpError(400, ERROR_CODES.VALIDATION_FAILED, 'No default sales channel.');
      }
      return fallback;
    }
    // Shape first: a malformed id would reach Postgres as a failed `uuid` cast.
    if (!UUID.test(salesChannelId)) throw unknownChannel();
    const channel = await this.deps.salesChannels.findById(salesChannelId);
    if (!channel) throw unknownChannel();
    return channel;
  }
}
