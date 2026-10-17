import type { DocumentBlockEditorConfig } from '@endora-commerce/page-builder-core/contributions';
import { invoicePuckConfig } from '../templates/invoice-puck-config.js';

/** `invoices.InvoiceLineItems`'s canvas renderer in the document-template editor (`specs/152-compare-pdf-template/`). */
const config = invoicePuckConfig.components?.['invoices.InvoiceLineItems'] as unknown as DocumentBlockEditorConfig;
export default config;
