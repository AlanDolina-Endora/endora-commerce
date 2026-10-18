import { expect } from 'vitest';
import type { BackendServerHandle } from './test-server.js';
import { Product } from './package-entities.js';
import { neighbourReadPorts } from './price-list-neighbour-ports.js';
import { PriceListService } from '../../../packages/modules/price_lists/src/backend/services/price-list-service.js';
import {
  DefaultPriceListMigrator,
  DEFAULT_PRICE_LIST_ID,
} from '../../../packages/modules/price_lists/src/backend/services/default-price-list-migration.js';

/** The list price below the volume bracket. */
export const TIER_UNIT_PRICE = '11.49';
/** The list price from {@link TIER_VOLUME_FROM} pieces up. */
export const TIER_VOLUME_PRICE = '1.00';
export const TIER_VOLUME_FROM = 100;

/**
 * A product of its own, created for the calling file, priced on the Default
 * price list in two quantity brackets — {@link TIER_UNIT_PRICE} below
 * {@link TIER_VOLUME_FROM} pieces and {@link TIER_VOLUME_PRICE} from there up —
 * with unmanaged stock, so a placement is refused for nothing but its price.
 *
 * A fresh product rather than a seeded one, so the brackets reach no other file
 * that prices the seeded catalogue.
 */
export async function createTieredProduct(h: BackendServerHandle, suffix: string): Promise<string> {
  const created = await h.app.inject({
    method: 'POST',
    url: '/api/v1/admin/catalog/products',
    payload: {
      sku: `TIER-${suffix}`,
      type: 'simple',
      name: { 'en-US': `Tiered product ${suffix}` },
      description: { 'en-US': '' },
      categoryIds: [],
      attributeValues: {},
      visibility: 'public',
    },
    cookies: { b2b_session: 'stub-admin-session' },
  });
  expect(created.statusCode).toBe(201);
  const productId = (created.json() as { data: { id: string } }).data.id;
  // The admin create route does not take the stock flags.
  await h.em().nativeUpdate(Product, { id: productId }, { manageStock: false });

  await new DefaultPriceListMigrator(h.em).seedDefault();
  const priceLists = new PriceListService(
    h.em,
    undefined,
    undefined,
    undefined,
    neighbourReadPorts(h.em),
  );
  await priceLists.addProduct(DEFAULT_PRICE_LIST_ID, productId);
  await priceLists.replaceBrackets(DEFAULT_PRICE_LIST_ID, productId, {
    PLN: [
      { minQuantity: 1, maxQuantity: TIER_VOLUME_FROM - 1, amount: TIER_UNIT_PRICE },
      { minQuantity: TIER_VOLUME_FROM, maxQuantity: null, amount: TIER_VOLUME_PRICE },
    ],
  });
  return productId;
}

/** A product no price list holds and that carries no price of its own. */
export async function createUnpricedProduct(h: BackendServerHandle, suffix: string): Promise<string> {
  const created = await h.app.inject({
    method: 'POST',
    url: '/api/v1/admin/catalog/products',
    payload: {
      sku: `NOPRICE-${suffix}`,
      type: 'simple',
      name: { 'en-US': `Unpriced product ${suffix}` },
      description: { 'en-US': '' },
      categoryIds: [],
      attributeValues: {},
      visibility: 'public',
    },
    cookies: { b2b_session: 'stub-admin-session' },
  });
  expect(created.statusCode).toBe(201);
  return (created.json() as { data: { id: string } }).data.id;
}
