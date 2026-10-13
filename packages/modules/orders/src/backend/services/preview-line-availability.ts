import {
  ADMIN_ORDER_PREVIEW_MESSAGE_PRECEDENCE,
  isProductVisibleTo,
  type AdminOrderPreviewMessageCode,
  type CatalogProductRecord,
} from '@endora-commerce/contracts';

const [PRODUCT_NOT_FOUND, PRODUCT_NOT_VISIBLE_TO_CUSTOMER, PRODUCT_NOT_IN_SALES_CHANNEL] =
  ADMIN_ORDER_PREVIEW_MESSAGE_PRECEDENCE;

export type PreviewLineAvailability =
  | { available: true }
  | { available: false; code: AdminOrderPreviewMessageCode };

/**
 * Steps 1–3 of the admin order preview's per-line decision (feature 145,
 * FR-027), first match wins: the product does not exist, the customer's
 * Organization may not see it, or it is outside the order's sales channel.
 * Step 4 (`QUOTE_ONLY`) needs the resolved price and stays in the route.
 *
 * `inChannel` is ignored for a product that fails visibility: one message per
 * line, and visibility outranks assortment.
 */
export function previewLineAvailability(input: {
  product: Pick<CatalogProductRecord, 'visibility' | 'allowedOrganizationIds'> | null;
  organizationId: string;
  inChannel: boolean;
}): PreviewLineAvailability {
  if (!input.product) return { available: false, code: PRODUCT_NOT_FOUND };
  if (
    !isProductVisibleTo(input.product, {
      organizationId: input.organizationId,
      authenticated: true,
    })
  ) {
    return { available: false, code: PRODUCT_NOT_VISIBLE_TO_CUSTOMER };
  }
  if (!input.inChannel) return { available: false, code: PRODUCT_NOT_IN_SALES_CHANNEL };
  return { available: true };
}
