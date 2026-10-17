import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { InvoiceTemplatesRedirect } from '../../../../packages/modules/invoices/src/admin/pages/InvoiceTemplatesRedirect';

/**
 * `specs/152-compare-pdf-template/` T062, FR-088 — the former invoice template
 * addresses lead to *Document templates*: the list onto the Invoice card, one
 * template onto its editor (the id is the template's in the new screen too).
 */
function Where(): React.ReactElement {
  const location = useLocation();
  return <output data-testid="where">{`${location.pathname}${location.search}`}</output>;
}

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/invoices/templates" element={<InvoiceTemplatesRedirect />} />
        <Route path="/invoices/templates/:id" element={<InvoiceTemplatesRedirect />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('invoice template redirects (spec 152)', () => {
  it('/invoices/templates opens the Invoice card of Document templates', () => {
    renderAt('/invoices/templates');
    expect(screen.getByTestId('where').textContent).toBe('/document-templates?type=invoices.invoice');
  });

  it('/invoices/templates/:id opens that template in the document template editor', () => {
    renderAt('/invoices/templates/22222222-2222-4222-8222-222222222222');
    expect(screen.getByTestId('where').textContent).toBe('/document-templates/22222222-2222-4222-8222-222222222222');
  });
});
