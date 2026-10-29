import type { EntityManager } from '@mikro-orm/postgresql';
import { cmsPagePublicPaths, type CmsPagePathNode } from '@endora-commerce/contracts';

/**
 * One page as one sales channel serves it — the input of the public-path rule
 * (`specs/163-page-builder-marketing-pages/` R19D, T282) plus what the
 * resolver filters candidates by.
 *
 * `slug` is the channel's (`cms_page_sales_channels.slug`), never the page
 * row's: the address is per channel (Constitution XII).
 */
export interface ChannelPageNode extends CmsPagePathNode {
  salesChannelId: string;
  status: 'draft' | 'published' | 'archived';
  active: boolean;
  updatedAt: Date | string;
}

/**
 * Every page bound to the given channels, as the path rule reads it. One
 * indexed join over narrow columns: a CMS holds hundreds of pages, and a path
 * is a function of the whole channel's tree, so reading the tree is cheaper
 * than walking it a row at a time.
 */
export async function loadChannelPageNodes(
  em: EntityManager,
  salesChannelIds: readonly string[],
): Promise<ChannelPageNode[]> {
  if (salesChannelIds.length === 0) return [];
  const placeholders = salesChannelIds.map(() => '?').join(', ');
  const rows = (await em.execute(
    `select p.id::text as id, p.parent_page_id::text as parent_page_id, p.parent_path_in_url,
            cpsc.sales_channel_id::text as sales_channel_id, cpsc.slug, p.status, p.active, p.updated_at
     from cms_page_sales_channels cpsc
     join cms_pages p on p.id = cpsc.page_id
     where cpsc.sales_channel_id in (${placeholders})`,
    [...salesChannelIds],
  )) as Array<{
    id: string;
    parent_page_id: string | null;
    parent_path_in_url: boolean | null;
    sales_channel_id: string;
    slug: string;
    status: 'draft' | 'published' | 'archived';
    active: boolean;
    updated_at: Date | string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    parentPageId: row.parent_page_id,
    parentPathInUrl: row.parent_path_in_url === true,
    salesChannelId: row.sales_channel_id,
    slug: row.slug,
    status: row.status,
    active: row.active,
    updatedAt: row.updated_at,
  }));
}

/** The public path of every page in one channel, by page id. */
export function channelPaths(nodes: readonly ChannelPageNode[], salesChannelId: string): Map<string, string> {
  return cmsPagePublicPaths(nodes.filter((node) => node.salesChannelId === salesChannelId));
}

/** The channels `nodes` covers. */
function channelsOf(nodes: readonly ChannelPageNode[]): string[] {
  return [...new Set(nodes.map((node) => node.salesChannelId))];
}

/**
 * The first public path two pages of one channel share where one of them is
 * in `pageIds`, or `null` (R19D, T282). A path is an address, and an address
 * names one page: the write that would produce a duplicate is refused.
 *
 * Only duplicates involving `pageIds` count — the page being written and its
 * descendants, whose paths move with it — so a write is never refused for a
 * state it did not create.
 */
export function duplicatePath(
  nodes: readonly ChannelPageNode[],
  pageIds: ReadonlySet<string>,
): { salesChannelId: string; path: string } | null {
  for (const salesChannelId of channelsOf(nodes)) {
    const owners = new Map<string, string[]>();
    for (const [pageId, path] of channelPaths(nodes, salesChannelId)) {
      const list = owners.get(path) ?? [];
      list.push(pageId);
      owners.set(path, list);
    }
    for (const [path, ids] of owners) {
      if (ids.length > 1 && ids.some((id) => pageIds.has(id))) return { salesChannelId, path };
    }
  }
  return null;
}

/**
 * Every address the given pages answer under, in every channel `nodes`
 * covers: each channel slug (a nested page's flat slug still resolves, as an
 * alias that redirects) and each computed path. What a cache invalidation must
 * name for those pages.
 */
export function addressesOf(nodes: readonly ChannelPageNode[], pageIds: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const salesChannelId of channelsOf(nodes)) {
    const paths = channelPaths(nodes, salesChannelId);
    for (const node of nodes) {
      if (node.salesChannelId !== salesChannelId || !pageIds.has(node.id)) continue;
      out.add(node.slug);
      const path = paths.get(node.id);
      if (path) out.add(path);
    }
  }
  return out;
}

/**
 * Whether any of the given pages is served at a path other than its slug — a
 * nested page, whose path the resolver writes into the links of *other*
 * pages. When such a path moves, those pages' cached answers are stale too.
 */
export function anyNested(nodes: readonly ChannelPageNode[], pageIds: ReadonlySet<string>): boolean {
  for (const salesChannelId of channelsOf(nodes)) {
    const paths = channelPaths(nodes, salesChannelId);
    for (const node of nodes) {
      if (node.salesChannelId !== salesChannelId || !pageIds.has(node.id)) continue;
      if (paths.get(node.id) !== node.slug.split('/').filter(Boolean).join('/')) return true;
    }
  }
  return false;
}
