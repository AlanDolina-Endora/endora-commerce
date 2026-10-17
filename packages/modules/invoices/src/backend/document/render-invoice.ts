import type {
  DocumentRenderInput,
  DocumentRenderPort,
  InvoiceDetail,
  InvoiceDocumentData,
} from '@endora-commerce/contracts';
import { INVOICE_DOCUMENT_TYPE, INVOICE_RENDER_LANGUAGE } from './invoice-document-type.js';

/**
 * The one render input of an invoice PDF (`contracts/invoice-document.md` §2).
 *
 * Every path that produces an invoice PDF — the admin download, the regenerate,
 * the customer download **and the e-mail attachment** (owner answer N1,
 * FR-093) — builds its input here, so the same invoice is printed from the same
 * template whichever way it reaches the customer: the default of its channel,
 * else the default for all channels, else the built-in layout (FR-084).
 */
export function invoiceRenderInput(detail: InvoiceDetail): DocumentRenderInput<InvoiceDocumentData> {
  return {
    documentType: INVOICE_DOCUMENT_TYPE,
    salesChannelId: detail.salesChannelId ?? null,
    language: INVOICE_RENDER_LANGUAGE,
    data: { invoice: detail, amountLocale: 'pl' },
  };
}

/** The PDF bytes of an invoice, through the document-template facility (which `invoices` binds, N2). */
export async function renderInvoicePdf(
  documents: Pick<DocumentRenderPort, 'render'>,
  detail: InvoiceDetail,
): Promise<Buffer> {
  const result = await documents.render(invoiceRenderInput(detail));
  return Buffer.from(result.bytes);
}
