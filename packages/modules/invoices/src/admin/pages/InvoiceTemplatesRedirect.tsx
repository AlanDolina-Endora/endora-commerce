import type { ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';

/**
 * `/invoices/templates` and `/invoices/templates/:id` — the addresses invoice
 * templates had before they moved into *Document templates*
 * (`specs/152-compare-pdf-template/` FR-088). A bookmark lands on the Invoice
 * card, or — with a template id — on that template's editor.
 */
export function InvoiceTemplatesRedirect(): ReactNode {
  const { id } = useParams();
  return <Navigate replace to={id ? `/document-templates/${id}` : '/document-templates?type=invoices.invoice'} />;
}

export default InvoiceTemplatesRedirect;
