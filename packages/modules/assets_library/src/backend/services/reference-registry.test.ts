import { describe, expect, it } from 'vitest';
import type { AssetReference, AssetReferenceDescriptor } from '@endora-commerce/contracts';
import { AssetReferenceRegistry } from './reference-registry.js';

// Issue #535 — `findReferencesMany` must attribute every reference to the
// asset it points at. Real descriptors return plain `AssetReference`s with no
// asset id on them, so these fakes do too.
function fakeDescriptor(
  ownerModuleId: string,
  table: Record<string, AssetReference[]>,
): AssetReferenceDescriptor {
  return {
    ownerModuleId,
    async findReferences(assetIds: string[]) {
      return assetIds.flatMap((id) => table[id] ?? []);
    },
  };
}

const gallery: AssetReference = { kind: 'product_gallery', entityId: 'p-1', label: 'Product "A"' };
const page: AssetReference = { kind: 'cms_body_embed', entityId: 'page-1', label: 'Page "Home"' };
const task: AssetReference = { kind: 'task_attachment', entityId: 'task-1', label: 'Task "T"' };

describe('AssetReferenceRegistry.findReferencesMany (#535)', () => {
  it('attributes each reference to the asset it points at, across descriptors', async () => {
    const registry = new AssetReferenceRegistry();
    registry.register(fakeDescriptor('catalog', { a1: [gallery] }));
    registry.register(fakeDescriptor('cms', { a2: [page], a1: [page] }));
    registry.register(fakeDescriptor('tasks', { a2: [task] }));

    const out = await registry.findReferencesMany(['a1', 'a2', 'a3']);

    expect([...out.keys()].sort()).toEqual(['a1', 'a2', 'a3']);
    expect(out.get('a1')).toEqual(expect.arrayContaining([gallery, page]));
    expect(out.get('a1')).toHaveLength(2);
    expect(out.get('a2')).toEqual(expect.arrayContaining([page, task]));
    expect(out.get('a2')).toHaveLength(2);
    expect(out.get('a3')).toEqual([]);
  });

  it('agrees with findReferences for every asset id asked for', async () => {
    const registry = new AssetReferenceRegistry();
    registry.register(fakeDescriptor('catalog', { a1: [gallery] }));
    registry.register(fakeDescriptor('cms', { a2: [page] }));

    const many = await registry.findReferencesMany(['a1', 'a2']);
    for (const id of ['a1', 'a2']) {
      expect(many.get(id)).toEqual(await registry.findReferences(id));
    }
  });

  it('returns an empty map for no ids and an entry per id with no descriptors', async () => {
    const registry = new AssetReferenceRegistry();
    expect((await registry.findReferencesMany([])).size).toBe(0);
    const out = await registry.findReferencesMany(['a1']);
    expect(out.get('a1')).toEqual([]);
  });
});
