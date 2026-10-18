import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { EntityManager } from '@mikro-orm/postgresql';

import { registerAssetsLibraryPublicRoutes } from './routes.public.js';
import { HmacSigner } from './services/hmac.js';
import { LocalFsStorageAdapter } from './services/storage/local-fs-adapter.js';
import type { AdapterRegistry } from './services/storage/adapter-registry.js';
import type { AssetsLibraryService } from './services/assets-library.service.js';

const KEY_HEX = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
const signer = HmacSigner.fromEnv(KEY_HEX);

interface FakeAsset {
  id: string;
  filename: string;
  mimeType: string;
  visibility: 'public' | 'private';
  storageBackend: 'local' | 's3' | 'gcs' | 'legacy';
  storageLocator: string;
  storageUrl: string;
  sizeBytes: string;
  updatedAt: Date;
  deletedAt: Date | null;
}

const SANDBOX_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

let app: FastifyInstance;
let baseDir: string;
const assets = new Map<string, FakeAsset>();
const resolveUrl = vi.fn(async (id: string) => ({
  url: `https://bucket.example.test/${id}?X-Signature=abc`,
  expiresAt: null,
}));

let seq = 0;
async function addAsset(
  filename: string,
  mimeType: string,
  over: Partial<FakeAsset> = {},
): Promise<FakeAsset> {
  seq += 1;
  const id = `aabbccdd-0000-0000-0000-${String(seq).padStart(12, '0')}`;
  const locator = `aa/bb/${id}.bin`;
  await mkdir(dirname(join(baseDir, locator)), { recursive: true });
  await writeFile(join(baseDir, locator), 'abc');
  const a: FakeAsset = {
    id,
    filename,
    mimeType,
    visibility: 'public',
    storageBackend: 'local',
    storageLocator: locator,
    storageUrl: '',
    sizeBytes: '3',
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    ...over,
  };
  assets.set(id, a);
  return a;
}

function signedQuery(id: string): string {
  const exp = Math.floor(Date.now() / 1000) + 300;
  return `token=${signer.sign({ assetId: id, exp })}&exp=${exp}`;
}

beforeAll(async () => {
  baseDir = await mkdtemp(join(tmpdir(), 'assets-library-route-'));
  const local = new LocalFsStorageAdapter({
    baseDir,
    publicUrlBase: 'http://localhost:3001',
    publicApiBaseUrl: 'https://api.example.test',
    privateUrlTtlSec: 300,
    signer,
  });
  const em = {
    findOne: async (_entity: unknown, where: { id: string }) => assets.get(where.id) ?? null,
  } as unknown as EntityManager;

  app = Fastify();
  app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, _req, reply) => {
    void reply.status(err.statusCode ?? 500).send({ error: { code: err.code } });
  });
  await registerAssetsLibraryPublicRoutes(app, {
    service: { resolveUrl } as unknown as AssetsLibraryService,
    adapters: { getForBackend: async () => local } as unknown as AdapterRegistry,
    emFactory: () => em,
    signer: () => signer,
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await rm(baseDir, { recursive: true, force: true });
});

describe('GET /assets/file/:assetId — response headers by stored type', () => {
  it.each([
    ['photo.png', 'image/png'],
    ['photo.jpg', 'image/jpeg'],
    ['photo.webp', 'image/webp'],
    ['clip.mp4', 'video/mp4'],
    ['track.mp3', 'audio/mpeg'],
    ['notes.txt', 'text/plain'],
  ])('serves %s (%s) inline under a sandboxing policy', async (filename, mime) => {
    const a = await addAsset(filename, mime);
    const r = await app.inject({ method: 'GET', url: `/assets/file/${a.id}` });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain(mime);
    expect(r.headers['content-disposition']).toMatch(/^inline;/);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['content-security-policy']).toBe(SANDBOX_CSP);
  });

  it('serves an SVG inline as an image under a policy that runs no script', async () => {
    const a = await addAsset('logo.svg', 'image/svg+xml');
    const r = await app.inject({ method: 'GET', url: `/assets/file/${a.id}` });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('image/svg+xml');
    expect(r.headers['content-disposition']).toMatch(/^inline;/);
    expect(r.headers['content-security-policy']).toBe(SANDBOX_CSP);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });

  it('serves a PDF inline with a policy that keeps the built-in viewer working', async () => {
    const a = await addAsset('sheet.pdf', 'application/pdf');
    const r = await app.inject({ method: 'GET', url: `/assets/file/${a.id}` });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-disposition']).toMatch(/^inline;/);
    expect(r.headers['content-security-policy']).toBe("default-src 'none'; style-src 'unsafe-inline'");
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });

  it.each([
    ['page.html', 'text/html'],
    ['page.xhtml', 'application/xhtml+xml'],
    ['feed.xml', 'application/xml'],
    ['feed.xml', 'text/xml'],
    ['app.js', 'text/javascript'],
    ['data.json', 'application/json'],
    ['archive.zip', 'application/zip'],
    ['blob', 'application/octet-stream'],
  ])('serves %s (%s) only as a download', async (filename, mime) => {
    const a = await addAsset(filename, mime);
    const r = await app.inject({ method: 'GET', url: `/assets/file/${a.id}` });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-disposition']).toMatch(/^attachment;/);
    expect(r.headers['content-security-policy']).toBe(SANDBOX_CSP);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });

  it('treats a stored type with parameters by its essence', async () => {
    const a = await addAsset('page.txt', 'Text/HTML; charset=utf-8');
    const r = await app.inject({ method: 'GET', url: `/assets/file/${a.id}` });
    expect(r.headers['content-disposition']).toMatch(/^attachment;/);
  });

  it('still answers a download when one is asked for an inline-safe type', async () => {
    const a = await addAsset('photo.png', 'image/png');
    const r = await app.inject({ method: 'GET', url: `/assets/file/${a.id}?download=1` });
    expect(r.headers['content-disposition']).toMatch(/^attachment;/);
  });

  it('sends the same policy on a conditional 304', async () => {
    const a = await addAsset('photo.png', 'image/png');
    const first = await app.inject({ method: 'GET', url: `/assets/file/${a.id}` });
    const r = await app.inject({
      method: 'GET',
      url: `/assets/file/${a.id}`,
      headers: { 'if-none-match': first.headers['etag'] as string },
    });
    expect(r.statusCode).toBe(304);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('GET /assets/file/:assetId — private assets on every storage backend', () => {
  it.each(['s3', 'gcs'] as const)(
    'refuses a private %s asset without a token, before resolving any storage URL',
    async (backend) => {
      resolveUrl.mockClear();
      const a = await addAsset('secret.pdf', 'application/pdf', {
        visibility: 'private',
        storageBackend: backend,
      });
      const r = await app.inject({ method: 'GET', url: `/assets/file/${a.id}` });
      expect(r.statusCode).toBe(403);
      expect(r.json()).toMatchObject({ error: { code: 'ASSET_ACCESS_DENIED' } });
      expect(resolveUrl).not.toHaveBeenCalled();
    },
  );

  it('refuses a private s3 asset whose token does not verify', async () => {
    resolveUrl.mockClear();
    const a = await addAsset('secret.pdf', 'application/pdf', {
      visibility: 'private',
      storageBackend: 's3',
    });
    const exp = Math.floor(Date.now() / 1000) + 300;
    const r = await app.inject({
      method: 'GET',
      url: `/assets/file/${a.id}?token=${'0'.repeat(64)}&exp=${exp}`,
    });
    expect(r.statusCode).toBe(403);
    expect(resolveUrl).not.toHaveBeenCalled();
  });

  it('redirects a private s3 asset carrying a valid token to its storage URL', async () => {
    resolveUrl.mockClear();
    const a = await addAsset('secret.pdf', 'application/pdf', {
      visibility: 'private',
      storageBackend: 's3',
    });
    const r = await app.inject({ method: 'GET', url: `/assets/file/${a.id}?${signedQuery(a.id)}` });
    expect(r.statusCode).toBe(302);
    expect(r.headers['location']).toBe(`https://bucket.example.test/${a.id}?X-Signature=abc`);
  });

  it('redirects a public s3 asset without a token', async () => {
    const a = await addAsset('photo.png', 'image/png', { storageBackend: 's3' });
    const r = await app.inject({ method: 'GET', url: `/assets/file/${a.id}` });
    expect(r.statusCode).toBe(302);
  });

  it('refuses a private local asset without a token and serves it with one', async () => {
    const a = await addAsset('secret.pdf', 'application/pdf', { visibility: 'private' });
    const denied = await app.inject({ method: 'GET', url: `/assets/file/${a.id}` });
    expect(denied.statusCode).toBe(403);
    const ok = await app.inject({ method: 'GET', url: `/assets/file/${a.id}?${signedQuery(a.id)}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['cache-control']).toContain('no-store');
  });
});
