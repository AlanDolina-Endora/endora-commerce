import type { DocumentBlockEditorConfig } from '@endora-commerce/page-builder-core/contributions';
import { quoteDocumentCanvas } from './canvas.js';

/** `quote_requests.QuoteDetails`'s canvas renderer in the document-template editor. */
const config = quoteDocumentCanvas.components?.['quote_requests.QuoteDetails'] as unknown as DocumentBlockEditorConfig;
export default config;
