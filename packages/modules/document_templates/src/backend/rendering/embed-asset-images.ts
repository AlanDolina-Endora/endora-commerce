import { rethrowIfModuleDisabled } from '@endora-commerce/platform/kernel';

/**
 * The images an operator placed in a template, inlined before pdfmake runs
 * (`specs/152-compare-pdf-template/` research R-12).
 *
 * A core `Image` block names an **assets-library id** and nothing else — never
 * a URL — so a template cannot make a document fetch or embed a file the
 * operator did not choose from the library (FR-033). The bytes are read through
 * `assets_library`'s `assetReadPort.openAssetBytes` and inlined as a `data:`
 * URI, because pdfmake fetches an `image:` it is given as a URL and the URL
 * policy of every renderer in this platform denies all network access.
 *
 * PNG and JPEG only — what pdfmake embeds reliably. Anything else, an id that
 * names no asset, or a read that fails is simply absent from the answer: the
 * block prints nothing and the document prints (FR-035, "one failed image MUST
 * NOT fail the document").
 */

export interface AssetBytesReader {
  openAssetBytes(assetId: string): Promise<{ bytes: Uint8Array; mimeType: string } | null>;
}

const CORE_IMAGE = 'document_templates.Image';
const EMBEDDABLE = new Set(['image/png', 'image/jpeg']);

function normaliseMime(mime: string): string {
  const base = mime.toLowerCase().split(';')[0]?.trim() ?? '';
  return base === 'image/jpg' ? 'image/jpeg' : base;
}

/** The distinct asset ids a tree's core Image blocks name, in order. */
export function collectImageAssetIds(tree: unknown): string[] {
  const nodes = (tree as { content?: unknown } | null)?.content;
  if (!Array.isArray(nodes)) return [];
  const ids: string[] = [];
  for (const node of nodes as { type?: unknown; props?: Record<string, unknown> }[]) {
    if (node?.type !== CORE_IMAGE) continue;
    const raw = node.props?.['assetId'];
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Asset id → `data:` URI for every id that resolved to an embeddable image. */
export async function loadAssetImages(
  assetIds: readonly string[],
  reader: AssetBytesReader,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    assetIds.map(async (id) => {
      let loaded: { bytes: Uint8Array; mimeType: string } | null;
      try {
        loaded = await reader.openAssetBytes(id);
      } catch (error) {
        // A switched-off library is a presence answer about the whole render,
        // not a missing image; anything else is one image the document can do
        // without (FR-035).
        rethrowIfModuleDisabled(error);
        return;
      }
      if (!loaded) return;
      const mime = normaliseMime(loaded.mimeType);
      if (!EMBEDDABLE.has(mime)) return;
      out.set(id, `data:${mime};base64,${Buffer.from(loaded.bytes).toString('base64')}`);
    }),
  );
  return out;
}
