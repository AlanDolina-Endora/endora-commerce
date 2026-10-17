import type { DocumentBlockEditorConfig } from '@endora-commerce/page-builder-core/contributions';
import { comparisonDocumentCanvas } from './canvas.js';

/** `comparisons.ComparisonTable`'s canvas renderer in the document-template editor. */
const config = comparisonDocumentCanvas.components?.['comparisons.ComparisonTable'] as unknown as DocumentBlockEditorConfig;
export default config;
