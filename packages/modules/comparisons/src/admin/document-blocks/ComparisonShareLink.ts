import type { DocumentBlockEditorConfig } from '@endora-commerce/page-builder-core/contributions';
import { comparisonDocumentCanvas } from './canvas.js';

/** `comparisons.ComparisonShareLink`'s canvas renderer in the document-template editor. */
const config = comparisonDocumentCanvas.components?.['comparisons.ComparisonShareLink'] as unknown as DocumentBlockEditorConfig;
export default config;
