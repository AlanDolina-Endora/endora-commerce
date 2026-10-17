import type { ComparisonDocumentData, DocumentTypeRegistration } from '@endora-commerce/contracts';
import { AssetByteFetcher } from '../services/asset-byte-fetcher.js';
import { imageDataUri, pickOrientation } from '../services/comparison-pdf-shared.js';
import { comparisonHeaderBlock } from './blocks/header.js';
import { comparisonShareLinkBlock } from './blocks/share-link.js';
import { comparisonTableBlock } from './blocks/table.js';
import { comparisonBuiltInLayout } from './built-in-layout.js';
import { sampleComparisonData } from './sample-comparison.js';
import type { ComparisonPrepared } from './types.js';

export const COMPARISON_DOCUMENT_TYPE = 'comparisons.comparison';

/**
 * The *Product comparison* document type
 * (`specs/152-compare-pdf-template/contracts/comparison-document.md` §1).
 *
 * Its palette is its three blocks plus every general-purpose block (owner Q1);
 * the buyer never chooses a template (`default_only`, owner Q2); every active
 * content language may hold a layout; landscape from three products when the
 * template leaves the orientation automatic, as today.
 *
 * `prepareRender` fetches the product images once per PDF — only when the
 * layout places the table — with the same per-render fetcher and 1×1 fallback
 * the fixed renderer uses, so one unavailable image never fails the export
 * (FR-035).
 */
export function createComparisonDocumentType(
  options: { readonly fetcher?: () => AssetByteFetcher } = {},
): DocumentTypeRegistration<ComparisonDocumentData, ComparisonPrepared> {
  const newFetcher = options.fetcher ?? (() => new AssetByteFetcher());
  return {
    code: COMPARISON_DOCUMENT_TYPE,
    moduleId: 'comparisons',
    labelKey: 'documentTypes.comparison.label',
    descriptionKey: 'documentTypes.comparison.description',
    blocks: () => [comparisonHeaderBlock, comparisonTableBlock, comparisonShareLinkBlock],
    coreBlocks: 'all',
    selection: 'default_only',
    variables: [
      { key: 'productCount', labelKey: 'documentTypes.comparison.variables.productCount' },
      { key: 'channelName', labelKey: 'documentTypes.comparison.variables.channelName' },
      { key: 'customerName', labelKey: 'documentTypes.comparison.variables.customerName' },
      { key: 'organizationName', labelKey: 'documentTypes.comparison.variables.organizationName' },
      { key: 'shareUrl', labelKey: 'documentTypes.comparison.variables.shareUrl' },
    ],
    resolveVariables: (data) => ({
      productCount: String(data.view.products.length),
      channelName: data.channelName,
      customerName: data.customerName,
      organizationName: data.organizationName,
      shareUrl: data.shareUrl,
    }),
    defaultContent: comparisonBuiltInLayout,
    suggestOrientation: (data) => pickOrientation(data.view.products.length),
    async prepareRender(data, { placedBlocks }) {
      const images = new Map<string, string>();
      if (placedBlocks !== null && !placedBlocks.has('comparisons.ComparisonTable')) return { images };
      const fetcher = newFetcher();
      await Promise.all(
        data.view.products.map(async (product) => {
          if (!product.primaryAssetUrl) return;
          images.set(product.id, imageDataUri(await fetcher.fetch(product.primaryAssetUrl)));
        }),
      );
      return { images };
    },
    sampleData: sampleComparisonData,
  };
}
