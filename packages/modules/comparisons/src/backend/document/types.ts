import type { ComparisonDocumentData, DocumentBlockRenderer } from '@endora-commerce/contracts';

/** What `prepareRender` computes once per comparison PDF: product id → inlined image. */
export interface ComparisonPrepared {
  readonly images: ReadonlyMap<string, string>;
}

export type ComparisonBlockRenderer = DocumentBlockRenderer<ComparisonDocumentData, ComparisonPrepared>;
