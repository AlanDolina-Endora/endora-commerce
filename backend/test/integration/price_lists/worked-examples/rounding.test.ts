import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BuyerLinePricePort } from '@endora-commerce/contracts';
import { SalesChannel } from '@endora-commerce/platform/kernel';
import type { CartPlacementApplyPort } from '../../../../../packages/modules/carts/src/ports/index.js';
import { resolveFeedItem } from '../../../../../packages/modules/product_feeds/src/backend/services/item-field-resolver.js';
import { resolveReferencePrices } from '../../../../../packages/modules/quote_requests/src/backend/services/reference-price.js';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../../helpers/test-server.js';
import { SEED_PRODUCT_101_ID, SEED_PRODUCT_102_ID } from '../../../helpers/seed-catalog.js';
import { CUSTOMER_COOKIES, TEST_CUSTOMER_ID, TEST_ORGANIZATION_ID } from '../../../helpers/test-actors.js';
import { seedPriceBookSql } from '../../../helpers/price-book-sql.js';

/**
 * `specs/pricing/worked-examples.md` §10.16 (review finding 2 of release
 * 0.108.0) — a resolver amount whose third and fourth places are `50` is shown
 * and stored at two places **half-up on its decimal digits**, the same figure
 * on every surface: the card (formatted by `Intl.NumberFormat`, as the
 * storefront does), the product page, the cart line (which the order copies),
 * the placement check, the admin order preview, a quote's stored reference
 * price and the product feed.
 *
 * R1: 101 — an everyone catalogue book at 10.05 and an everyone sale of −10 %
 * → 9.0450 → **9.05** (`Number('9.0450').toFixed(2)` is 9.04).
 * R2: 102 — an everyone sale at 1.0050 → **1.01** (`toFixed` gives 1.00).
 */
const SESSION = { b2b_session: 'stub-customer-session' };
const RETAIL = { 'x-sales-channel': 'pl_retail' };
const EXPECTED: Record<string, { resolver: string; shown: string }> = {
  [SEED_PRODUCT_101_ID]: { resolver: '9.0450', shown: '9.05' },
  [SEED_PRODUCT_102_ID]: { resolver: '1.0050', shown: '1.01' },
};
/** How the storefront shows an amount, without the currency sign. */
const shown = (amount: string | number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(
    Number(amount),
  );

describe('worked examples — §10.16 an x.xx50 amount agrees on every surface', () => {
  let h: BackendServerHandle;
  let retailId: string;

  beforeAll(async () => {
    h = await setupBackendServer();
    const em = h.em();
    retailId = (await em.findOneOrFail(SalesChannel, { code: 'pl_retail' })).id;
    await seedPriceBookSql(em, {
      name: 'R — catalogue',
      audience: 'everyone',
      rows: [{ productId: SEED_PRODUCT_101_ID, fixed: '10.05' }],
    });
    await seedPriceBookSql(em, {
      name: 'R — sale',
      type: 'sale',
      audience: 'everyone',
      rows: [
        { productId: SEED_PRODUCT_101_ID, percent: '-10' },
        { productId: SEED_PRODUCT_102_ID, fixed: '1.005' },
      ],
    });
  }, 5 * 60_000);

  afterAll(async () => {
    await h.cartService()?.clearForCustomer({ ...CUSTOMER_COOKIES[SESSION.b2b_session]!, salesChannelId: retailId });
    await teardownBackendServer(h);
  });

  it('R1, R2 — the card, the product page, the cart, placement, the admin preview, a quote reference and the feed', async () => {
    const seen: Record<string, Record<string, string>> = {};
    const record = (surface: string, productId: string, value: string | undefined) => {
      (seen[productId] ??= {})[surface] = value ?? 'missing';
    };

    const listing = await h.app.inject({ method: 'GET', url: '/api/v1/catalog/products?limit=100', headers: RETAIL, cookies: SESSION });
    expect(listing.statusCode, listing.body).toBe(200);
    for (const p of (listing.json() as { data: Array<{ id: string; price: { amount: number | string } | null }> }).data) {
      if (!EXPECTED[p.id]) continue;
      expect(String(p.price?.amount), `${p.id} card amount`).toBe(String(Number(EXPECTED[p.id]!.resolver)));
      record('card', p.id, shown(p.price!.amount));
    }

    for (const productId of Object.keys(EXPECTED)) {
      const resolved = await h.app.inject({
        method: 'GET',
        url: `/api/v1/storefront/products/${productId}/resolved-price?quantity=1`,
        headers: RETAIL,
        cookies: SESSION,
      });
      expect(resolved.statusCode, resolved.body).toBe(200);
      const r = (resolved.json() as { data: { resolvedPrice: { salePrice: { amount: string } | null } } }).data.resolvedPrice;
      record('product page', productId, r.salePrice ? shown(r.salePrice.amount) : undefined);

      const added = await h.app.inject({
        method: 'POST',
        url: '/api/v1/cart/items',
        headers: { ...RETAIL, 'content-type': 'application/json' },
        cookies: SESSION,
        payload: { productId, quantity: 1 },
      });
      expect(added.statusCode, added.body).toBe(200);
    }

    const cart = await h.app.inject({ method: 'GET', url: '/api/v1/cart', headers: RETAIL, cookies: SESSION });
    expect(cart.statusCode, cart.body).toBe(200);
    const cartData = (cart.json() as { data: { id: string; items: Array<{ productId: string; unitPrice: { amount: number } }> } }).data;
    for (const line of cartData.items) if (EXPECTED[line.productId]) record('cart line', line.productId, line.unitPrice.amount.toFixed(2));

    // The order copies the cart line's stored price once this check accepts it.
    const placement = (h.container.cradle as unknown as { cartPlacementApplyPort: CartPlacementApplyPort }).cartPlacementApplyPort;
    expect(await placement.findPriceDrift(h.em().fork(), { cartId: cartData.id, organizationId: TEST_ORGANIZATION_ID })).toEqual([]);

    const preview = await h.app.inject({
      method: 'POST',
      url: '/api/v1/admin/orders/preview',
      cookies: { b2b_session: 'stub-admin-session' },
      payload: {
        customerAccountId: TEST_CUSTOMER_ID,
        salesChannelId: retailId,
        items: Object.keys(EXPECTED).map((productId) => ({ productId, quantity: 1 })),
      },
    });
    expect(preview.statusCode, preview.body).toBe(200);
    for (const line of (preview.json() as { data: { lines: Array<{ productId: string; unitPrice: string }> } }).data.lines) {
      record('order preview line', line.productId, line.unitPrice);
    }

    const buyerLines = (h.container.cradle as unknown as { buyerLinePricePort: BuyerLinePricePort }).buyerLinePricePort;
    const productIds = Object.keys(EXPECTED);
    const references = await resolveReferencePrices(buyerLines, {
      owner: { customerAccountId: TEST_CUSTOMER_ID, organizationId: TEST_ORGANIZATION_ID },
      salesChannelId: retailId,
      lines: productIds.map((productId) => ({ productId, variantId: null, quantity: 1 })),
    });
    productIds.forEach((productId, i) => record('quote reference', productId, references[i]?.amount));

    // The feed: the anonymous resolution a feed generation reads, emitted by the feed's field resolver.
    const pricing = (h.container.cradle as unknown as {
      pricingService: { resolveLinePrices(i: unknown): Promise<Map<string, { amount: string } | null>> };
    }).pricingService;
    const reads = (h.container.cradle as unknown as {
      catalogProductReadPort: { findByIds(ids: readonly string[]): Promise<Array<{ id: string; attributeValues: Record<string, unknown> }>> };
    }).catalogProductReadPort;
    const anonymous = await pricing.resolveLinePrices({
      lines: (await reads.findByIds(productIds)).map((p) => ({ key: p.id, product: p, quantity: 1 })),
      context: { organization: null, salesChannel: { id: retailId, defaultCurrency: 'PLN' } },
    });
    for (const productId of productIds) {
      const net = Number(anonymous.get(productId)?.amount);
      const item = resolveFeedItem({
        fields: [
          {
            outputName: 'price',
            sourceKind: 'price',
            sourceKey: null,
            constantValue: null,
            fallbackValue: null,
            providerRequired: false,
            transform: null,
            transformArg: null,
          },
        ],
        item: {
          productId,
          variantId: null,
          sku: 'SKU',
          slug: 'slug',
          productType: 'simple',
          name: { 'pl-PL': 'x' },
          description: {},
          attributes: {},
          customFields: {},
          price: { net, gross: net, taxResolved: true },
          salePrice: null,
          inStock: true,
          stockQuantity: 1,
          imageUrls: [],
          privateImageCount: 0,
          categoryPath: [],
          providerCategory: null,
          providerCategoryMissReason: null,
          groupingId: null,
        },
        context: {
          languageCode: 'pl-PL',
          languageFallbacks: [],
          currencyCode: 'PLN',
          pricePresentation: 'net',
          taxCountry: null,
          storefrontOrigin: 'https://shop.example.com',
          salesChannelId: retailId,
          priceListId: null,
        },
      });
      record('feed', productId, item.fields.find((f) => f.name === 'price')?.value.replace(' PLN', ''));
    }

    for (const [productId, surfaces] of Object.entries(seen)) {
      for (const [surface, value] of Object.entries(surfaces)) {
        expect(value, `${surface} ${productId}`).toBe(EXPECTED[productId]!.shown);
      }
    }
    expect(Object.keys(seen[SEED_PRODUCT_101_ID]!).sort()).toEqual(
      ['card', 'cart line', 'feed', 'order preview line', 'product page', 'quote reference'].sort(),
    );
  });
});
