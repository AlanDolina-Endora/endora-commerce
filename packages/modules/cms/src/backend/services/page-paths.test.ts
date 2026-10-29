import { describe, expect, it } from 'vitest';
import type { EntityManager } from '@mikro-orm/postgresql';
import {
  addressesOf,
  anyNested,
  channelPaths,
  duplicatePath,
  loadChannelPageNodes,
  type ChannelPageNode,
} from './page-paths.js';

/**
 * `specs/163-page-builder-marketing-pages/` R19D (T282): the per-channel
 * reading of the public-path rule the resolver and the write refusal share.
 */
const A = 'channel-a';
const B = 'channel-b';

function node(
  id: string,
  slug: string,
  options: { parent?: string; nested?: boolean; channel?: string } = {},
): ChannelPageNode {
  return {
    id,
    slug,
    parentPageId: options.parent ?? null,
    parentPathInUrl: options.nested ?? false,
    salesChannelId: options.channel ?? A,
    status: 'published',
    active: true,
    updatedAt: '2026-10-27T00:00:00.000Z',
  };
}

describe('channelPaths', () => {
  it('reads one channel only — a parent bound elsewhere does not prefix (Principle XII)', () => {
    const nodes = [node('zone', 'zone', { channel: B }), node('leaf', 'leaf', { parent: 'zone', nested: true })];
    expect(channelPaths(nodes, A).get('leaf')).toBe('leaf');
    expect(channelPaths(nodes, A).has('zone')).toBe(false);
  });
});

describe('duplicatePath', () => {
  const tree = [node('zone', 'zone'), node('leaf', 'leaf', { parent: 'zone', nested: true })];

  it('finds a flat slug equal to a nested path, when one of the pair is written', () => {
    const nodes = [...tree, node('flat', 'zone/leaf')];
    expect(duplicatePath(nodes, new Set(['flat']))).toEqual({ salesChannelId: A, path: 'zone/leaf' });
    expect(duplicatePath(nodes, new Set(['leaf']))).toEqual({ salesChannelId: A, path: 'zone/leaf' });
  });

  it('ignores a duplicate the written pages are not part of', () => {
    const nodes = [...tree, node('flat', 'zone/leaf'), node('other', 'other')];
    expect(duplicatePath(nodes, new Set(['other']))).toBeNull();
  });

  it('compares within a channel, never across channels', () => {
    const nodes = [...tree, node('flat', 'zone/leaf', { channel: B })];
    expect(duplicatePath(nodes, new Set(['flat']))).toBeNull();
  });
});

describe('addressesOf and anyNested', () => {
  it('names the flat slug and the path of a nested page, in every channel', () => {
    const nodes = [
      node('zone', 'zone'),
      node('leaf', 'leaf', { parent: 'zone', nested: true }),
      node('leaf', 'leaf', { parent: 'zone', nested: true, channel: B }),
    ];
    expect([...addressesOf(nodes, new Set(['leaf']))].sort()).toEqual(['leaf', 'zone/leaf']);
    expect(anyNested(nodes, new Set(['leaf']))).toBe(true);
    expect(anyNested(nodes, new Set(['zone']))).toBe(false);
  });
});

describe('loadChannelPageNodes', () => {
  it('reads nothing for no channel, and maps the joined rows', async () => {
    const calls: unknown[][] = [];
    const em = {
      execute: async (_sql: string, params: unknown[]) => {
        calls.push(params);
        return [
          {
            id: 'p1',
            parent_page_id: null,
            parent_path_in_url: null,
            sales_channel_id: A,
            slug: 'zone',
            status: 'published',
            active: true,
            updated_at: '2026-10-27T00:00:00.000Z',
          },
        ];
      },
    } as unknown as EntityManager;
    expect(await loadChannelPageNodes(em, [])).toEqual([]);
    expect(calls).toHaveLength(0);
    expect(await loadChannelPageNodes(em, [A])).toEqual([
      expect.objectContaining({ id: 'p1', parentPathInUrl: false, salesChannelId: A, slug: 'zone' }),
    ]);
    expect(calls).toEqual([[A]]);
  });
});
