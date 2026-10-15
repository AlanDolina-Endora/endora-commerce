import type { EntityManager } from '@mikro-orm/postgresql';
import type {
  CatalogProductReadPort,
  CustomerAccountReadPort,
  LinePricePort,
  PromotionCodePort,
  QuoteRequestReadPort,
  RfqCustomerPort,
} from '@endora-commerce/contracts';
import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '@endora-commerce/platform/http';
import { ModuleDisabledError } from '../../../src/kernel/lifecycle/plugin-helpers.js';
import { ANONYMOUS_PRODUCT_AUDIENCE, ERROR_CODES } from '@endora-commerce/contracts';
import { Cart } from '../../../../packages/modules/carts/src/backend/entities/cart.entity.js';
import { CartItem } from '../../../../packages/modules/carts/src/backend/entities/cart-item.entity.js';
import type { SalesChannelMembershipPort } from '@endora-commerce/platform/kernel';
import { CartConversionService } from '../../../../packages/modules/carts/src/backend/services/cart-conversion-service.js';
import { CartUpsellService } from '../../../../packages/modules/carts/src/backend/services/cart-upsell-service.js';
import { CartOrganizationVisibilityService } from '../../../../packages/modules/carts/src/backend/services/cart-organization-visibility-service.js';

/**
 * Feature 075, Phase C — `carts` asks its five neighbours instead of querying
 * their tables.
 *
 * The `EntityManager` below **throws on any entity `carts` does not own**, so a
 * read that goes around a port reads as "`carts` queried someone else's table"
 * rather than as a silent pass. Every case here fails on the pre-cut code for
 * that reason, which is what makes the fixture worth having: the ports are the
 * only way the data can arrive.
 */

const CARTS_OWN_ENTITIES = new Set<unknown>([Cart, CartItem]);

function ownTablesOnly(rows: {
  carts?: Cart[];
  items?: CartItem[];
}): () => EntityManager {
  const refuse = (entity: unknown): never => {
    throw new Error(
      `carts queried an entity it does not own: ${String(
        (entity as { name?: string }).name ?? entity,
      )}`,
    );
  };
  const em = {
    find: async (entity: unknown) => {
      if (!CARTS_OWN_ENTITIES.has(entity)) refuse(entity);
      return entity === Cart ? (rows.carts ?? []) : (rows.items ?? []);
    },
    findOne: async (entity: unknown) => {
      if (!CARTS_OWN_ENTITIES.has(entity)) refuse(entity);
      return entity === Cart ? (rows.carts?.[0] ?? null) : (rows.items?.[0] ?? null);
    },
    findAndCount: async (entity: unknown) => {
      if (!CARTS_OWN_ENTITIES.has(entity)) refuse(entity);
      const found = entity === Cart ? (rows.carts ?? []) : (rows.items ?? []);
      return [found, found.length];
    },
    getKnex: () => refuse('knex'),
    getConnection: () => refuse('connection'),
    execute: async () => refuse('raw sql'),
    nativeDelete: async () => 0,
    flush: async () => {},
  } as unknown as EntityManager;
  return () => em;
}

function cartRow(overrides: Partial<Cart> = {}): Cart {
  return {
    id: 'cart-1',
    customerAccountId: 'cust-1',
    organizationId: 'org-1',
    status: 'active',
    approvalStatus: 'not_required',
    lastActivityAt: new Date(),
    ...overrides,
  } as unknown as Cart;
}

function itemRow(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: 'item-1',
    cartId: 'cart-1',
    productId: 'p-1',
    variantId: null,
    quantity: 2,
    unitPrice: '10.00',
    currency: 'PLN',
    ...overrides,
  } as unknown as CartItem;
}

describe('carts — the up-sell strip reads catalog through its port', () => {
  it('walks the links and the target rows without touching catalog tables', async () => {
    const listLinksBySourceIds = vi.fn(async () => [
      { id: 'l-1', sourceProductId: 'p-1', targetProductId: 'p-2', kind: 'up_sell', position: 0 },
      { id: 'l-2', sourceProductId: 'p-1', targetProductId: 'p-1', kind: 'up_sell', position: 1 },
    ]);
    const catalog = {
      listLinksBySourceIds,
      findByIds: async () => [
        {
          id: 'p-2',
          slug: 'target',
          name: { 'en-US': 'Target product' },
          attributeValues: { primaryAssetUrl: 'https://cdn.example/p2.png' },
          createdAt: new Date('2026-01-01'),
        },
      ],
    } as unknown as CatalogProductReadPort;

    const service = new CartUpsellService(ownTablesOnly({ items: [itemRow()] }), catalog);
    // Issue #227 — the fixture rows carry no `visibility`, which reads as
    // `public` here, so the audience narrows nothing and this test still says
    // what it said: the link narrowing is the port's.
    const candidates = await service.forCart('cart-1', 5, ANONYMOUS_PRODUCT_AUDIENCE);

    // The link narrowed by kind at the port, not filtered afterwards.
    expect(listLinksBySourceIds).toHaveBeenCalledWith(['p-1'], 'up_sell');
    // `p-1` is already in the cart, so its self-link is dropped.
    expect(candidates).toEqual([
      {
        productId: 'p-2',
        productName: 'Target product',
        productSlug: 'target',
        productThumbnailUrl: 'https://cdn.example/p2.png',
        matchCount: 1,
      },
    ]);
  });
});

describe('carts — the org-admin cart list names its owners through customer_accounts', () => {
  it('renders the owner e-mail from the port', async () => {
    const accounts = {
      findByIds: async (ids: readonly string[]) =>
        ids.map((id) => ({ id, email: `${id}@example.test` })),
    } as unknown as CustomerAccountReadPort;

    const service = new CartOrganizationVisibilityService(
      ownTablesOnly({ carts: [cartRow()], items: [itemRow()] }),
      accounts,
    );
    const page = await service.list('org-1');

    expect(page.data).toHaveLength(1);
    expect(page.data[0]?.ownerDisplayName).toBe('cust-1@example.test');
  });
});

describe('carts — quote-to-cart conversion reads quote_requests through its port', () => {
  const quoteRequests = {
    findById: async () =>
      ({ id: 'qr-1', customerAccountId: 'cust-1' }) as never,
    listItems: async () => [
      {
        id: 'qri-1',
        quoteRequestId: 'qr-1',
        productId: 'p-1',
        productName: 'Quoted product',
        variantId: null,
        quantity: 3,
        packagingUnitName: null,
        packagingUnitBaseQuantity: null,
      },
    ],
  } as unknown as QuoteRequestReadPort;

  const rfq = {} as unknown as RfqCustomerPort;
  const ctx = { customerAccountId: 'cust-1', organizationId: 'org-1' };

  /**
   * Issue #259 — the conversion narrows to the request's channel, and these
   * cases run outside a request. So the gate has nothing to ask, and a port
   * that throws on every method proves it asks nothing rather than assuming it.
   */
  const refusingChannelMembership = new Proxy(
    {},
    {
      get: (_target, property) => () => {
        throw new Error(`carts asked the channel bridge (${String(property)}) with no request`);
      },
    },
  ) as SalesChannelMembershipPort;

  it('drops a line whose product catalog no longer has, by name', async () => {
    const catalog = { findByIds: async () => [] } as unknown as CatalogProductReadPort;
    const cartService = {
      getOrCreateForCustomer: async () => cartRow(),
    } as never;

    const service = new CartConversionService(
      ownTablesOnly({}),
      cartService,
      rfq,
      quoteRequests,
      catalog,
      refusingChannelMembership,
    );
    const result = await service.createCartFromQuoteRequest('qr-1', ctx);

    expect(result.droppedLines).toEqual([
      { productId: 'p-1', productName: 'Quoted product', reason: 'not_purchasable' },
    ]);
    expect(result.appendedLineCount).toBe(0);
  });

  /**
   * The `catch` around `addItem` reports one unpriceable line and keeps going,
   * which is right. `ModuleDisabledError` **is** an `HttpError`, so without the
   * `rethrowIfModuleDisabled` first line the same `instanceof` test would report
   * a switched-off pricing engine as "no price in your list" for every line —
   * issue #124's defect wearing a per-line report.
   */
  it('re-throws a disabled provider instead of reporting it as an unpriced line', async () => {
    const catalog = {
      findByIds: async () => [{ id: 'p-1' }],
    } as unknown as CatalogProductReadPort;
    const cartService = {
      addItem: async () => {
        throw new ModuleDisabledError('price_lists');
      },
      getOrCreateForCustomer: async () => cartRow(),
    } as never;

    const service = new CartConversionService(
      ownTablesOnly({}),
      cartService,
      rfq,
      quoteRequests,
      catalog,
      refusingChannelMembership,
    );

    await expect(service.createCartFromQuoteRequest('qr-1', ctx)).rejects.toMatchObject({
      statusCode: 503,
      code: ERROR_CODES.MODULE_DISABLED,
    });
  });

  it('still reports an ordinary per-line refusal as a dropped line', async () => {
    const catalog = {
      findByIds: async () => [{ id: 'p-1' }],
    } as unknown as CatalogProductReadPort;
    const cartService = {
      addItem: async () => {
        throw new HttpError(
          400,
          ERROR_CODES.CART_PRODUCT_QUOTE_ONLY,
          'This product is sold on request only and cannot be added to the cart.',
        );
      },
      getOrCreateForCustomer: async () => cartRow(),
    } as never;

    const service = new CartConversionService(
      ownTablesOnly({}),
      cartService,
      rfq,
      quoteRequests,
      catalog,
      refusingChannelMembership,
    );
    const result = await service.createCartFromQuoteRequest('qr-1', ctx);

    expect(result.droppedLines).toEqual([
      { productId: 'p-1', productName: 'Quoted product', reason: 'no_price_in_customer_list' },
    ]);
  });
});

describe('carts — cart-to-quote conversion hands quote_requests the cart price as the reference', () => {
  /**
   * Feature 146 (FR-008, research R3) — the cart's unit price is not a buyer's
   * proposal. It travels as the line's reference through the port's in-process
   * third argument, index-aligned with the items, and no line carries a
   * `desiredUnitPrice`.
   */
  it('sends no desiredUnitPrice and passes lineReferencePrices from the cart snapshot', async () => {
    const createForCustomer = vi.fn(async () => ({ id: 'qr-new' }) as never);
    const rfq = { createForCustomer, listForCustomer: vi.fn() } as unknown as RfqCustomerPort;
    const items = [
      itemRow({ id: 'item-1', productId: 'p-1', quantity: 2, unitPrice: '120.00', currency: 'PLN' }),
      itemRow({
        id: 'item-2',
        productId: 'p-2',
        variantId: 'v-2',
        quantity: 200,
        unitPrice: '4.25',
        currency: 'EUR',
        packagingUnitName: 'Paleta',
        packagingUnitBaseQuantity: 100,
      } as Partial<CartItem>),
    ];
    const service = new CartConversionService(
      ownTablesOnly({ carts: [cartRow()], items }),
      {} as never,
      rfq,
      {} as unknown as QuoteRequestReadPort,
      {} as unknown as CatalogProductReadPort,
      {} as SalesChannelMembershipPort,
    );
    const ctx = { customerAccountId: 'cust-1', organizationId: 'org-1', isOrgAdmin: false };

    const result = await service.convertToQuoteRequest(cartRow(), ctx, 'Please quote');

    expect(result.quoteRequestId).toBe('qr-new');
    expect(createForCustomer).toHaveBeenCalledTimes(1);
    expect(createForCustomer).toHaveBeenCalledWith(
      ctx,
      {
        headerNote: 'Please quote',
        items: [
          { productId: 'p-1', quantity: 2 },
          {
            productId: 'p-2',
            variantId: 'v-2',
            quantity: 200,
            packagingUnitName: 'Paleta',
            packagingUnitBaseQuantity: 100,
          },
        ],
      },
      {
        lineReferencePrices: [
          { amount: '120.00', currency: 'PLN' },
          { amount: '4.25', currency: 'EUR' },
        ],
      },
    );
  });
});

describe('carts — the published price and coupon slices are the ones the module needs', () => {
  it('LinePricePort answers the six fields a cart line snapshots', async () => {
    const port: LinePricePort = {
      resolveLinePrice: async () => ({
        amount: '19.99',
        currency: 'PLN',
        priceListId: 'pl-1',
        isSale: false,
        bracketStartQuantity: 1,
        displayMode: 'gross_only',
      }),
    };
    const resolved = await port.resolveLinePrice({
      product: { id: 'p-1', attributeValues: {} },
      context: { quantity: 1, salesChannel: { id: 'ch-1', defaultCurrency: 'PLN' } },
    });
    expect(resolved?.amount).toBe('19.99');
  });

  /**
   * The four eligibility fields joined `ResolvedPromotionCode` in this cut.
   * Without them the coupon service can only answer `invalid_code`, where the
   * storefront renders `expired`, `wrong_organization` and `below_min_spend`.
   */
  it('ResolvedPromotionCode carries the reason a code is refused', async () => {
    const port: PromotionCodePort = {
      resolveByCode: async () => ({
        promotionId: 'promo-1',
        couponId: null,
        name: 'Spring',
        isActive: true,
        validFrom: null,
        validUntil: new Date('2020-01-01'),
        organizationId: 'org-2',
        minCartSubtotal: '500.00',
      }),
    };
    const resolved = await port.resolveByCode('SPRING');
    expect(resolved?.validUntil).toEqual(new Date('2020-01-01'));
    expect(resolved?.organizationId).toBe('org-2');
    expect(resolved?.minCartSubtotal).toBe('500.00');
  });
});
