import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';

/**
 * Issue #384 — the storefront product page and the listing cards show a
 * product's effective name, description and channel-scoped attribute values
 * for the request's (sales channel, language), resolved through the same
 * resolver the admin scope editor previews with and the search indexer
 * indexes with.
 *
 * Before the fix both reads walked only the language fallback over the
 * baseline JSONB, so a channel override written in the scope editor was
 * visible in admin and in the search index but nowhere on the product page or
 * the listing.
 *
 * Seeds one product on `pl_retail` and `pl_b2b_vip`, writes a
 * (`pl_b2b_vip`, `pl-PL`) override for Name and Description and a
 * `pl_b2b_vip` channel-only override for a channel-scoped user attribute, then
 * reads the public product page and the public listing on both channels.
 */
describe('Issue #384 — public product reads honour channel value overrides', () => {
  let h: BackendServerHandle;
  let productId: string;
  let slug: string;
  let attributeKey: string;
  let groupedSlug: string;
  let createdSince: string;

  beforeAll(async () => {
    h = await setupBackendServer();
    // Listing reads below narrow by `changedSince` so the page holds only the
    // products this file creates.
    createdSince = new Date(Date.now() - 1000).toISOString();

    attributeKey = `finish_${Date.now()}`;
    const attr = await h.app.inject({
      method: 'POST',
      url: '/api/v1/admin/catalog/attributes',
      payload: {
        key: attributeKey,
        label: { 'en-US': 'Finish', 'pl-PL': 'Wykończenie' },
        type: 'input',
        isSearchable: false,
        isFilterable: false,
        isVariantAxis: false,
        isVisibleOnProductPage: true,
        channelScoped: true,
        languageScoped: false,
      },
      cookies: { b2b_session: 'stub-admin-session' },
    });
    expect(attr.statusCode, attr.body).toBe(201);

    const created = await h.app.inject({
      method: 'POST',
      url: '/api/v1/admin/catalog/products',
      payload: {
        sku: `OVR-384-${Date.now()}`,
        type: 'simple',
        name: { 'pl-PL': 'Zestaw bazowy', 'en-US': 'Baseline kit' },
        description: { 'pl-PL': 'Opis bazowy', 'en-US': 'Baseline description' },
        categoryIds: [],
        attributeValues: {},
        visibility: 'public',
        status: 'active',
      },
      cookies: { b2b_session: 'stub-admin-session' },
    });
    expect(created.statusCode, created.body).toBe(201);
    const data = (created.json() as { data: { id: string; slug: string } }).data;
    productId = data.id;
    slug = data.slug;

    const grouped = await h.app.inject({
      method: 'POST',
      url: '/api/v1/admin/catalog/products',
      payload: {
        sku: `OVR-384-GRP-${Date.now()}`,
        type: 'grouped',
        name: { 'pl-PL': 'Grupa', 'en-US': 'Group' },
        description: { 'pl-PL': 'Grupa', 'en-US': 'Group' },
        categoryIds: [],
        attributeValues: {},
        visibility: 'public',
        status: 'active',
      },
      cookies: { b2b_session: 'stub-admin-session' },
    });
    expect(grouped.statusCode, grouped.body).toBe(201);
    const groupedData = (grouped.json() as { data: { id: string; slug: string } }).data;
    groupedSlug = groupedData.slug;

    const conn = h.em().getConnection();
    const rows = await conn.execute<Array<{ id: string; code: string }>>(
      `select id, code from sales_channels where code in ('pl_retail', 'pl_b2b_vip')`,
      [],
      'all',
    );
    const retailChannelId = rows.find((r) => r.code === 'pl_retail')!.id;
    const vipChannelId = rows.find((r) => r.code === 'pl_b2b_vip')!.id;
    await conn.execute(
      `insert into sales_channel_products (sales_channel_id, product_id)
       values (?,?), (?,?), (?,?), (?,?)
       on conflict do nothing`,
      [
        retailChannelId,
        productId,
        vipChannelId,
        productId,
        retailChannelId,
        groupedData.id,
        vipChannelId,
        groupedData.id,
      ],
    );
    // The attribute's baseline goes straight onto the row: the create route
    // refuses a value for an attribute outside the product's attribute set,
    // and the set is not what this file is about.
    await conn.execute(
      `update products set attribute_values = jsonb_build_object(?::text, 'Gloss') where id = ?`,
      [attributeKey, productId],
    );
    await conn.execute(
      `update sales_channels set languages = '["pl-PL","en-US"]'::jsonb where id in (?, ?)`,
      [retailChannelId, vipChannelId],
    );
    await conn.execute(
      `insert into grouped_items
         (id, parent_product_id, child_product_id, position, quantity, created_at, updated_at)
       values (gen_random_uuid(), ?, ?, 0, 1, now(), now())`,
      [groupedData.id, productId],
    );
    await conn.execute(
      `insert into product_links
         (id, source_product_id, target_product_id, kind, position, created_at, updated_at)
       values (gen_random_uuid(), ?, ?, 'related', 0, now(), now())`,
      [groupedData.id, productId],
    );

    const patch = await h.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/catalog/products/${productId}/value-overrides`,
      payload: {
        upserts: [
          { attributeKey: 'name', channelId: vipChannelId, languageCode: 'pl-PL', value: { v: 'Zestaw hurtowy' } },
          { attributeKey: 'description', channelId: vipChannelId, languageCode: 'pl-PL', value: { v: 'Opis hurtowy' } },
          { attributeKey, channelId: vipChannelId, languageCode: null, value: { v: 'Matte' } },
        ],
        deletes: [],
      },
      cookies: { b2b_session: 'stub-admin-session' },
    });
    expect(patch.statusCode, patch.body).toBe(200);
  });

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  type Detail = {
    name: string;
    description: string;
    attributeValues: Record<string, unknown>;
    visibleAttributes: Array<{ key: string; valueRendered: string }>;
    seo: { metaTitle: string };
  };

  async function readDetail(channel: string, language: string): Promise<Detail> {
    const res = await h.app.inject({
      method: 'GET',
      url: `/api/v1/catalog/products/${slug}`,
      headers: { 'x-sales-channel': channel, 'accept-language': language },
    });
    expect(res.statusCode, res.body).toBe(200);
    return (res.json() as { data: Detail }).data;
  }

  async function readCardName(channel: string, language: string): Promise<string | undefined> {
    const res = await h.app.inject({
      method: 'GET',
      url: `/api/v1/catalog/products?limit=100&changedSince=${encodeURIComponent(createdSince)}`,
      headers: { 'x-sales-channel': channel, 'accept-language': language },
    });
    expect(res.statusCode, res.body).toBe(200);
    const cards = (res.json() as { data: Array<{ id: string; name: string }> }).data;
    return cards.find((c) => c.id === productId)?.name;
  }

  it('the product page on the overridden (channel, language) shows the override', async () => {
    const detail = await readDetail('pl_b2b_vip', 'pl-PL');
    expect(detail.name).toBe('Zestaw hurtowy');
    expect(detail.description).toBe('Opis hurtowy');
    expect(detail.seo.metaTitle).toBe('Zestaw hurtowy');
    expect(detail.attributeValues[attributeKey]).toBe('Matte');
    expect(detail.visibleAttributes.find((a) => a.key === attributeKey)?.valueRendered).toBe(
      'Matte',
    );
  });

  it('the product page on another channel shows the baseline', async () => {
    const detail = await readDetail('pl_retail', 'pl-PL');
    expect(detail.name).toBe('Zestaw bazowy');
    expect(detail.description).toBe('Opis bazowy');
    expect(detail.attributeValues[attributeKey]).toBe('Gloss');
    expect(detail.visibleAttributes.find((a) => a.key === attributeKey)?.valueRendered).toBe(
      'Gloss',
    );
  });

  it('the product page in another language of the same channel shows that language baseline, and the channel-only attribute override', async () => {
    const detail = await readDetail('pl_b2b_vip', 'en-US');
    expect(detail.name).toBe('Baseline kit');
    expect(detail.description).toBe('Baseline description');
    expect(detail.attributeValues[attributeKey]).toBe('Matte');
  });

  it('the listing card follows the same resolution', async () => {
    expect(await readCardName('pl_b2b_vip', 'pl-PL')).toBe('Zestaw hurtowy');
    expect(await readCardName('pl_retail', 'pl-PL')).toBe('Zestaw bazowy');
    expect(await readCardName('pl_b2b_vip', 'en-US')).toBe('Baseline kit');
  });

  it('a grouped parent lists its child, and its related link, under the child effective name', async () => {
    const read = async (
      channel: string,
    ): Promise<{ child: string | undefined; related: string | undefined }> => {
      const res = await h.app.inject({
        method: 'GET',
        url: `/api/v1/catalog/products/${groupedSlug}`,
        headers: { 'x-sales-channel': channel, 'accept-language': 'pl-PL' },
      });
      expect(res.statusCode, res.body).toBe(200);
      const body = res.json() as {
        data: {
          groupedItems?: Array<{ product: { id: string; name: string } }>;
          links?: { related: Array<{ product: { id: string; name: string } }> };
        };
      };
      return {
        child: body.data.groupedItems?.find((i) => i.product.id === productId)?.product.name,
        related: body.data.links?.related.find((l) => l.product.id === productId)?.product.name,
      };
    };
    expect(await read('pl_b2b_vip')).toEqual({ child: 'Zestaw hurtowy', related: 'Zestaw hurtowy' });
    expect(await read('pl_retail')).toEqual({ child: 'Zestaw bazowy', related: 'Zestaw bazowy' });
  });
});
