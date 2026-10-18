import { describe, expect, it } from 'vitest';
import type { EntityManager } from '@mikro-orm/postgresql';

import { AssetsLibraryService } from './assets-library.service.js';
import { AssetReferenceRegistry } from './reference-registry.js';
import { AdapterRegistry } from './storage/adapter-registry.js';
import { HmacSigner } from './hmac.js';
import type { Asset } from '../entities/asset.entity.js';
import type { AdminUserReadPort } from '@endora-commerce/contracts';

/**
 * Every URL this module hands out is absolute — D-223, at the seam that decides
 * what `AssetDetail.url` and `AssetSummary.url` carry.
 *
 * The service is exercised over a real {@link AdapterRegistry} and a stubbed
 * `EntityManager`, so the chain under test is the one production runs:
 * service → registry → adapter → URL. The settings view answers a **blank**
 * `assets.local.public_url_base`, which is what every deployment that never set
 * it has, and is exactly the configuration that used to produce
 * `/assets/file/<id>` — a URL that only works in a browser on the API host, and
 * the reason four composition-root sites and two frontend helpers existed.
 */

const KEY_HEX = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
const API_ORIGIN = 'https://api.example.test';
const ASSET_ID = 'aabbccdd-1111-2222-3333-444455556666';

function seededAsset(overrides: Partial<Asset> = {}): Asset {
  const now = new Date('2026-09-10T09:00:00.000Z');
  return {
    id: ASSET_ID,
    kind: 'image',
    folderId: null,
    filename: 'hero.jpg',
    label: 'Hero',
    altText: null,
    mimeType: 'image/jpeg',
    sizeBytes: '2048',
    visibility: 'public',
    storageBackend: 'local',
    storageLocator: `aa/bb/${ASSET_ID}.jpg`,
    storageUrl: `/assets/file/${ASSET_ID}`,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    purgeAfterAt: null,
    pendingCleanup: false,
    contentVersion: 'a1b2c3d4e5f6',
    permalink: null,
    ...overrides,
  } as unknown as Asset;
}

function makeService(
  asset: Asset,
  localPublicUrlBase = '',
  extra: Partial<ConstructorParameters<typeof AssetsLibraryService>[0]> = {},
): AssetsLibraryService {
  const em = {
    findOne: async () => asset,
    find: async () => [asset],
  } as unknown as EntityManager;
  const adapters = new AdapterRegistry({
    settings: {
      activeAdapter: async () => 'local',
      localBaseDir: async () => '/tmp/assets',
      localPublicUrlBase: async () => localPublicUrlBase,
      privateUrlTtlSec: async () => 300,
      s3Config: async () => ({ bucket: '', region: '', accessKeyId: '', secretAccessKey: '' }),
      gcsConfig: async () => ({ bucket: '' }),
    },
    signer: () => HmacSigner.fromEnv(KEY_HEX),
    publicApiBaseUrl: API_ORIGIN,
  });
  return new AssetsLibraryService({
    emFactory: () => em,
    adapters,
    referenceRegistry: new AssetReferenceRegistry(),
    loadUploadPolicy: async () => ({ allowedTypes: ['*'], maxFileSizeMb: 0 }),
    ...extra,
  });
}

describe('AssetsLibraryService — every URL it produces is absolute (D-223)', () => {
  it('AssetDetail.url is absolute when no public URL base is configured', async () => {
    const detail = await makeService(seededAsset()).getAsset(ASSET_ID);
    expect(detail.url).toBe(`${API_ORIGIN}/assets/file/${ASSET_ID}`);
  });

  it('AssetSummary.url is absolute — the list surface takes the same path', async () => {
    const page = await makeService(seededAsset()).listAssets({});
    expect(page.data).toHaveLength(1);
    expect(page.data[0]?.url).toBe(`${API_ORIGIN}/assets/file/${ASSET_ID}`);
  });

  it('resolveUrl signs a private asset on the same absolute origin', async () => {
    const service = makeService(seededAsset({ visibility: 'private' } as Partial<Asset>));
    const resolved = await service.resolveUrl(ASSET_ID);
    expect(resolved.url.startsWith(`${API_ORIGIN}/assets/file/${ASSET_ID}?`)).toBe(true);
    expect(resolved.expiresAt).toBeInstanceOf(Date);
  });

  /**
   * A `storage_backend='legacy'` row: its `storage_url` is a pre-013 value this
   * platform did not issue. A relative one used to leave the module relative and
   * be rescued — or not — by whichever consumer asked.
   */
  it('rebases a legacy row whose stored URL is host-relative', async () => {
    const service = makeService(
      seededAsset({
        storageBackend: 'legacy',
        storageLocator: '',
        storageUrl: '/uploads/2019/hero.jpg',
      } as Partial<Asset>),
    );
    expect((await service.getAsset(ASSET_ID)).url).toBe(`${API_ORIGIN}/uploads/2019/hero.jpg`);
  });

  /** D-223: an operator who configured a base explicitly keeps winning. */
  it('serves an explicitly configured base rather than the API origin', async () => {
    const service = makeService(seededAsset(), 'https://cdn.example.test');
    expect((await service.getAsset(ASSET_ID)).url).toBe(
      `https://cdn.example.test/assets/file/${ASSET_ID}`,
    );
  });
});

/**
 * specs/156-asset-stable-url/ T010 — the stable file URL, the content version
 * and the permalink members. `url` is deliberately unchanged here (Phase 9).
 */
describe('AssetsLibraryService — stable URL members (feature 156)', () => {
  it('getAsset answers fileUrl, contentVersion and a null permalink', async () => {
    const detail = await makeService(seededAsset()).getAsset(ASSET_ID);
    expect(detail.fileUrl).toBe(`${API_ORIGIN}/assets/file/${ASSET_ID}`);
    expect(detail.contentVersion).toBe('a1b2c3d4e5f6');
    expect(detail.permalink).toBeNull();
    expect(detail.permalinkUrl).toBeNull();
    expect(detail.url).toBe(`${API_ORIGIN}/assets/file/${ASSET_ID}`);
  });

  it('listAssets answers the same members', async () => {
    const page = await makeService(seededAsset()).listAssets({});
    const row = page.data[0]!;
    expect(row.fileUrl).toBe(`${API_ORIGIN}/assets/file/${ASSET_ID}`);
    expect(row.contentVersion).toBe('a1b2c3d4e5f6');
    expect(row.permalink).toBeNull();
    expect(row.permalinkUrl).toBeNull();
  });

  it('builds permalinkUrl on the local public base', async () => {
    const detail = await makeService(
      seededAsset({ permalink: 'docs/a.pdf' } as Partial<Asset>),
    ).getAsset(ASSET_ID);
    expect(detail.permalink).toBe('docs/a.pdf');
    expect(detail.permalinkUrl).toBe(`${API_ORIGIN}/assets/file/docs/a.pdf`);
  });

  it('builds permalinkUrl on an explicitly configured base', async () => {
    const detail = await makeService(
      seededAsset({ permalink: 'docs/a.pdf' } as Partial<Asset>),
      'https://cdn.example.test',
    ).getAsset(ASSET_ID);
    expect(detail.permalinkUrl).toBe('https://cdn.example.test/assets/file/docs/a.pdf');
  });

  it('answers the unsigned stable fileUrl for a private asset while url stays signed', async () => {
    const detail = await makeService(
      seededAsset({ visibility: 'private' } as Partial<Asset>),
    ).getAsset(ASSET_ID);
    expect(detail.fileUrl).toBe(`${API_ORIGIN}/assets/file/${ASSET_ID}`);
    expect(detail.url.startsWith(`${API_ORIGIN}/assets/file/${ASSET_ID}?token=`)).toBe(true);
  });
});

/** specs/156-asset-stable-url/ T034 — the previous version on the detail (FR-022, FR-023). */
describe('AssetsLibraryService — previousVersion (feature 156)', () => {
  const REPLACED_AT = new Date('2026-10-10T08:00:00.000Z');
  const ADMIN_ID = '0b8f3c1e-2d4a-4b6c-8e9f-1a2b3c4d5e6f';
  const withPrevious = (replacedBy: string | null) =>
    seededAsset({
      previousStorageLocator: `aa/bb/${ASSET_ID}.prev-${'0'.repeat(32)}.jpg`,
      previousFilename: 'older.jpg',
      previousMimeType: 'image/jpeg',
      previousMimeTypeOverridden: false,
      previousKind: 'image',
      previousSizeBytes: '1024',
      previousContentVersion: '0f1e2d3c4b5a',
      previousReplacedAt: REPLACED_AT,
      previousReplacedBy: replacedBy,
    } as Partial<Asset>);
  const admins = (found: boolean) =>
    ({
      findById: async (id: string) =>
        found ? { id, firstName: 'First', lastName: 'Last', email: 'first.last@example.test' } : null,
    }) as unknown as AdminUserReadPort;

  it('is null without a previous version', async () => {
    const detail = await makeService(seededAsset()).getAsset(ASSET_ID);
    expect(detail.previousVersion).toBeNull();
  });

  it('carries the previous file, who replaced it and until when it can be restored', async () => {
    const detail = await makeService(withPrevious(ADMIN_ID), '', {
      adminUsers: admins(true),
      loadRetentionDays: async () => 7,
    }).getAsset(ASSET_ID);
    expect(detail.previousVersion).toEqual({
      filename: 'older.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      contentVersion: '0f1e2d3c4b5a',
      replacedAt: REPLACED_AT.toISOString(),
      replacedBy: { id: ADMIN_ID, displayName: 'First Last' },
      restorableUntil: new Date(REPLACED_AT.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
  });

  it('answers replacedBy null when the admin is not found, the column is null, or no port is wired', async () => {
    const notFound = await makeService(withPrevious(ADMIN_ID), '', {
      adminUsers: admins(false),
    }).getAsset(ASSET_ID);
    expect(notFound.previousVersion?.replacedBy).toBeNull();
    const system = await makeService(withPrevious(null), '', { adminUsers: admins(true) }).getAsset(ASSET_ID);
    expect(system.previousVersion?.replacedBy).toBeNull();
    const unwired = await makeService(withPrevious(ADMIN_ID)).getAsset(ASSET_ID);
    expect(unwired.previousVersion?.replacedBy).toBeNull();
  });
});
