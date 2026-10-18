import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import type { EntityManager } from '@mikro-orm/postgresql';

import { UploadPipeline, type UploadPolicy } from './upload-pipeline.js';
import type { AdapterRegistry } from './storage/adapter-registry.js';

const TINY_PNG = Buffer.from(
  '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C636400010000000500010D0A2DB40000000049454E44AE426082',
  'hex',
);
const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>',
);
const HTML = Buffer.from('<!doctype html><html><body><p>hello</p></body></html>');

interface Stored {
  mimeType: string;
  kind: string;
  filename: string;
}

function pipeline(policy: UploadPolicy = { allowedTypes: ['*'], maxFileSizeMb: 0 }): {
  run: (filename: string, declaredMime: string, bytes: Buffer) => Promise<Stored>;
  puts: string[];
} {
  const puts: string[] = [];
  const adapter = {
    code: 'local',
    newLocator: ({ assetId }: { assetId: string }) => `aa/bb/${assetId}`,
    put: async (input: { locator: string; mimeType: string; stream: NodeJS.ReadableStream }) => {
      for await (const _chunk of input.stream) {
        /* drain */
      }
      puts.push(input.mimeType);
    },
    resolveUrl: async () => ({ url: 'http://x/assets/file/1', expiresAt: null }),
    delete: async () => undefined,
  };
  const em = {
    create: (_entity: unknown, data: Stored) => data,
    persist: () => undefined,
    flush: async () => undefined,
  } as unknown as EntityManager;
  const p = new UploadPipeline({
    emFactory: () => em,
    adapters: { getActive: async () => adapter } as unknown as AdapterRegistry,
    loadPolicy: async () => policy,
  });
  return {
    puts,
    run: async (filename, declaredMime, bytes) =>
      (await p.run({
        filename,
        declaredMime,
        stream: Readable.from([bytes]),
        declaredSize: 0,
        folderId: null,
        label: null,
        visibility: 'public',
      })) as unknown as Stored,
  };
}

describe('UploadPipeline — stored type', () => {
  it('stores the sniffed type when the content is recognised', async () => {
    const a = await pipeline().run('photo.bin', 'application/octet-stream', TINY_PNG);
    expect(a.mimeType).toBe('image/png');
    expect(a.kind).toBe('image');
  });

  it('stores the sniffed type, not a declared document type, for recognised content', async () => {
    const a = await pipeline().run('photo.png', 'text/html', TINY_PNG);
    expect(a.mimeType).toBe('image/png');
  });

  it('accepts an SVG and stores it as image/svg+xml', async () => {
    const a = await pipeline().run('logo.svg', 'image/svg+xml', SVG);
    expect(a.mimeType).toBe('image/svg+xml');
    expect(a.kind).toBe('image');
  });

  it('stores a file named .svg as image/svg+xml whatever type was declared', async () => {
    const a = await pipeline().run('logo.svg', 'text/plain', SVG);
    expect(a.mimeType).toBe('image/svg+xml');
  });

  it('keeps a declared inert type for content it cannot recognise', async () => {
    const a = await pipeline().run('notes.txt', 'text/plain', Buffer.from('hello'));
    expect(a.mimeType).toBe('text/plain');
  });
});

describe('UploadPipeline — documents a browser would run are refused', () => {
  it.each([
    ['page.html', 'text/html'],
    ['page.htm', 'text/html; charset=utf-8'],
    ['page.xhtml', 'application/xhtml+xml'],
    ['feed.xml', 'application/xml'],
    ['feed.xml', 'text/xml'],
    ['style.xsl', 'text/xsl'],
    ['app.js', 'text/javascript'],
    ['app.mjs', 'application/javascript'],
    ['page.txt', 'text/html'],
    ['page.html', 'text/plain'],
    ['page.html.', 'text/plain'],
    ['data.bin', 'application/rss+xml'],
  ])('refuses %s declared as %s with 415', async (filename, mime) => {
    const p = pipeline();
    await expect(p.run(filename, mime, HTML)).rejects.toMatchObject({
      statusCode: 415,
      code: 'ASSET_UPLOAD_TYPE_NOT_ALLOWED',
    });
    expect(p.puts).toHaveLength(0);
  });

  it('refuses them even when the configured policy allows the type explicitly', async () => {
    const p = pipeline({ allowedTypes: ['text/html', '.html'], maxFileSizeMb: 0 });
    await expect(p.run('page.html', 'text/html', HTML)).rejects.toMatchObject({ statusCode: 415 });
  });

  it('applies the configured policy to the type the SVG is stored as', async () => {
    const p = pipeline({ allowedTypes: ['image/png'], maxFileSizeMb: 0 });
    await expect(p.run('logo.svg', 'image/png', SVG)).rejects.toMatchObject({ statusCode: 415 });
  });
});
