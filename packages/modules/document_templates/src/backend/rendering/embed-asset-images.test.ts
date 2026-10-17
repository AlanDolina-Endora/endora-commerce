import { describe, expect, it, vi } from 'vitest';
import { ModuleDisabledError } from '@endora-commerce/platform/kernel';
import { collectImageAssetIds, loadAssetImages } from './embed-asset-images.js';

/** T016 — images an operator placed come from the assets library only (FR-033, research R-12). */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff]);

describe('collectImageAssetIds', () => {
  it('collects the asset ids of core Image blocks, once each, and ignores everything else', () => {
    const tree = {
      content: [
        { type: 'document_templates.Image', props: { assetId: 'a1' } },
        { type: 'document_templates.Image', props: { assetId: 'a1' } },
        { type: 'document_templates.Image', props: { assetId: '  ' } },
        { type: 'document_templates.Image', props: { src: 'https://evil.test/x.png' } },
        { type: 'comparisons.ComparisonTable', props: { assetId: 'nope' } },
        { type: 'document_templates.Image', props: { assetId: 'a2' } },
      ],
    };
    expect(collectImageAssetIds(tree)).toEqual(['a1', 'a2']);
    expect(collectImageAssetIds(null)).toEqual([]);
  });
});

describe('loadAssetImages', () => {
  it('inlines PNG and JPEG as data URIs and omits other types and missing assets', async () => {
    const reader = {
      openAssetBytes: vi.fn(async (id: string) => {
        if (id === 'png') return { bytes: PNG, mimeType: 'image/png' };
        if (id === 'jpg') return { bytes: JPEG, mimeType: 'image/jpg' };
        if (id === 'svg') return { bytes: new Uint8Array([1]), mimeType: 'image/svg+xml' };
        return null;
      }),
    };
    const images = await loadAssetImages(['png', 'jpg', 'svg', 'gone'], reader);
    expect(images.get('png')).toBe(`data:image/png;base64,${Buffer.from(PNG).toString('base64')}`);
    expect(images.get('jpg')?.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(images.has('svg')).toBe(false);
    expect(images.has('gone')).toBe(false);
  });

  it('never throws on a failed read — one failed image does not fail the document (FR-035)', async () => {
    const reader = { openAssetBytes: vi.fn(async () => Promise.reject(new Error('bucket down'))) };
    await expect(loadAssetImages(['a'], reader)).resolves.toEqual(new Map());
  });

  it('re-throws a switched-off assets library rather than absorbing it', async () => {
    const reader = {
      openAssetBytes: vi.fn(async () => Promise.reject(new ModuleDisabledError('assets_library'))),
    };
    await expect(loadAssetImages(['a'], reader)).rejects.toBeInstanceOf(ModuleDisabledError);
  });

  it('never fetches a URL — it reads by asset id or not at all', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const reader = { openAssetBytes: vi.fn(async () => null) };
    await loadAssetImages(collectImageAssetIds({ content: [{ type: 'document_templates.Image', props: { src: 'https://x.test/a.png' } }] }), reader);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(reader.openAssetBytes).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
