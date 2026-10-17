import type { ComparisonDocumentData, ComparisonOwnerView } from '@endora-commerce/contracts';

/**
 * The data a comparison PDF is produced from — built only in the export
 * route, under the buyer's request, from what that route already read
 * (`contracts/comparison-document.md` §2). Nothing else reaches a render, so
 * a template can rearrange the buyer's comparison and never widen it (FR-033).
 */
export function buildComparisonDocumentData(input: {
  readonly view: ComparisonOwnerView;
  readonly channelName: string;
  readonly customerName: string | null;
  readonly organizationName: string | null;
  /** The channel's storefront base URL; empty or absent → no share link. */
  readonly storefrontUrl: string | null;
  readonly hideEmptyRows: boolean;
  readonly now: Date;
}): ComparisonDocumentData {
  const base = input.storefrontUrl?.trim().replace(/\/+$/, '') ?? '';
  let shareUrl: string | null = null;
  if (/^https?:\/\//i.test(base)) {
    try {
      shareUrl = new URL(`${base}/compare/share/${encodeURIComponent(input.view.shareToken)}`).toString();
    } catch {
      shareUrl = null;
    }
  }
  return {
    view: input.view,
    channelName: input.channelName,
    customerName: input.customerName,
    organizationName: input.organizationName,
    shareUrl,
    hideEmptyRows: input.hideEmptyRows,
    generatedAt: input.now.toISOString(),
  };
}
