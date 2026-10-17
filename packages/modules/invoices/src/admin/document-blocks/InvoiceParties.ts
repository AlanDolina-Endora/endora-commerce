import type { DocumentBlockEditorConfig } from '@endora-commerce/page-builder-core/contributions';
import { invoicePuckConfig } from '../templates/invoice-puck-config.js';

/** `invoices.InvoiceParties`'s canvas renderer in the document-template editor (`specs/152-compare-pdf-template/`). */
const config = invoicePuckConfig.components?.['invoices.InvoiceParties'] as unknown as DocumentBlockEditorConfig;
export default config;
