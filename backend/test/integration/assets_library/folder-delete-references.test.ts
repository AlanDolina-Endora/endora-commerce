import { Asset, AssetFolder, CmsPage } from '../../helpers/package-entities.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { randomUUID } from 'node:crypto';

import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';

/**
 * Issue #535 — a recursive folder delete ("delete everything") must refuse,
 * all-or-nothing, when any asset in the subtree is still in use. It consults
 * `findReferencesMany`, which used to key its result on an id no descriptor
 * set, so every list came back empty and in-use assets were soft-deleted.
 *
 * Two descriptors from two modules are exercised on purpose — a catalog
 * column reference (product gallery) and a CMS content scan — one asset in
 * the folder itself and one in a sub-folder.
 */

describe('recursive folder delete refuses in-use assets (#535)', () => {
  let h: BackendServerHandle;

  beforeAll(async () => {
    h = await setupBackendServer({ seed: 'us1-catalog' });
  });

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  const adminCookie = { b2b_session: 'stub-admin-session' };

  it('returns 409 ASSET_REFERENCED and deletes nothing while a subtree asset is in use', async () => {
    const stamp = randomUUID().slice(0, 8);
    const createFolder = async (parentId: string | null, name: string) => {
      const r = await h.app.inject({
        method: 'POST',
        url: '/api/v1/admin/assets/folders',
        cookies: adminCookie,
        payload: { parentId, name },
      });
      expect(r.statusCode, r.body).toBe(201);
      return (r.json() as { data: { id: string } }).data.id;
    };
    const parent = await createFolder(null, `i535-parent-${stamp}`);
    const child = await createFolder(parent, `i535-child-${stamp}`);

    const em = h.em();
    const forge = (folderId: string, filename: string) =>
      em.create(Asset, {
        kind: 'image',
        filename,
        mimeType: 'image/png',
        sizeBytes: '0',
        storageUrl: `https://example.com/${filename}`,
        storageLocator: `https://example.com/${filename}`,
        storageBackend: 'legacy',
        visibility: 'public',
        folderId,
      });
    const inGallery = forge(parent, `i535-gallery-${stamp}.png`);
    const inPage = forge(child, `i535-page-${stamp}.png`);
    const unused = forge(parent, `i535-unused-${stamp}.png`);
    await em.flush();
    const assetIds = [inGallery.id, inPage.id, unused.id];

    const conn = em.getConnection();
    const productRows = (await conn.execute(
      `select id::text as id from products where deleted_at is null limit 1`,
    )) as Array<{ id: string }>;
    expect(productRows.length, 'the us1-catalog seed must hold a product').toBeGreaterThan(0);
    await conn.execute(
      `insert into gallery_items (id, product_id, asset_id, position, created_at, updated_at)
       values (gen_random_uuid(), ?, ?, 0, now(), now())`,
      [productRows[0]!.id, inGallery.id],
    );

    const slug = `i535-page-${stamp}`;
    const page = em.create(CmsPage, {
      path: slug,
      title: { 'en-US': `I535 ${slug}` },
      body: {} as Record<string, string>,
      name: `I535 ${slug}`,
      slug,
      status: 'published',
      active: true,
      content: {
        schema_version: 1,
        languages: {
          'en-US': {
            root: { props: {} },
            content: [{ type: 'LibraryImage', props: { assetId: inPage.id, alt: 'embedded' } }],
          },
        },
      },
      languages: ['en-US'],
    });
    await em.persistAndFlush(page);

    try {
      const del = await h.app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/assets/folders/${parent}`,
        cookies: adminCookie,
        payload: { ifNonEmpty: 'deleteRecursively' },
      });
      expect(del.statusCode, del.body).toBe(409);
      const body = del.json() as {
        error: { code: string; details?: Array<{ path: string; issue: string }> };
      };
      expect(body.error.code).toBe('ASSET_REFERENCED');
      const blocking = (body.error.details ?? []).map((d) => d.issue).sort();
      expect(blocking).toEqual([inGallery.id, inPage.id].sort());

      // All-or-nothing: no asset soft-deleted, both folders still there.
      const fresh = h.em().fork({ clear: true });
      const rows = await fresh.find(Asset, { id: { $in: assetIds } });
      expect(rows).toHaveLength(3);
      for (const row of rows) expect(row.deletedAt ?? null).toBeNull();
      expect(await fresh.count(AssetFolder, { id: { $in: [parent, child] } })).toBe(2);

      // With the references gone the same delete goes through.
      await conn.execute(`delete from gallery_items where asset_id = ?`, [inGallery.id]);
      const pageEm = h.em().fork({ clear: true });
      await pageEm.nativeDelete(CmsPage, { id: page.id });

      const again = await h.app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/assets/folders/${parent}`,
        cookies: adminCookie,
        payload: { ifNonEmpty: 'deleteRecursively' },
      });
      expect(again.statusCode, again.body).toBe(200);
      const out = (again.json() as { data: { softDeletedAssetIds?: string[] } }).data;
      expect([...(out.softDeletedAssetIds ?? [])].sort()).toEqual([...assetIds].sort());
    } finally {
      const cleanup = h.em().fork({ clear: true });
      await cleanup.getConnection().execute(
        `delete from gallery_items where asset_id in (?, ?, ?)`,
        assetIds,
      );
      await cleanup.nativeDelete(CmsPage, { id: page.id });
      await cleanup.nativeDelete(Asset, { id: { $in: assetIds } });
      await cleanup.nativeDelete(AssetFolder, { id: { $in: [child, parent] } });
    }
  });
});
