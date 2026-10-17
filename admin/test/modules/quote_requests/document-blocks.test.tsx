import { StrictMode, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { DocumentSampleProvider } from '@endora-commerce/page-builder-core/contributions';
import { renderWithI18n } from '../../helpers/render-with-i18n';
import { expectNoAxeViolations } from '../../helpers/axe';
import quoteRequestsEn from '../../../../packages/modules/quote_requests/i18n/en.json';
import { sampleQuoteRequestData } from '../../../../packages/modules/quote_requests/src/backend/document/sample';
import { quoteDocumentCanvas } from '../../../../packages/modules/quote_requests/src/admin/document-blocks/canvas';
import { contributions } from '../../../../packages/modules/quote_requests/src/admin/index';

/**
 * `specs/153-quote-request-pdf-template/` T030 — the four quote blocks' canvas
 * renderers draw the served sample, contributed for the `document` context,
 * with no accessibility violation.
 */

const BUNDLE = { quote_requests: quoteRequestsEn as Record<string, string> };
const render = (name: string, props: Record<string, unknown> = {}): HTMLElement => {
  const component = quoteDocumentCanvas.components![name] as { render: (props: Record<string, unknown>) => ReactElement };
  const Render = component.render;
  return renderWithI18n(
    <StrictMode>
      <DocumentSampleProvider value={sampleQuoteRequestData('en-US')}>
        <Render {...props} />
      </DocumentSampleProvider>
    </StrictMode>,
    BUNDLE,
  ).container;
};

describe('quote document blocks on the canvas', () => {
  it('are contributed for the document context', () => {
    expect(contributions.blocks?.filter((b) => b.context === 'document').map((b) => b.name)).toEqual([
      'quote_requests.QuoteHeader',
      'quote_requests.QuoteParties',
      'quote_requests.QuoteNotes',
      'quote_requests.QuoteDetails',
    ]);
  });

  it('the header draws the sample quote’s number, defaulting its labels', async () => {
    const container = render('quote_requests.QuoteHeader');
    expect(screen.getByText('Quote')).toBeTruthy();
    expect(screen.getByText('Quote number: QR-000153')).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it('the parties, notes and details draw the sample', async () => {
    const parties = render('quote_requests.QuoteParties');
    expect(screen.getByText('Example Industries')).toBeTruthy();
    expect(screen.getByText('Jan Sample')).toBeTruthy();
    await expectNoAxeViolations(parties);
    render('quote_requests.QuoteNotes', { label: 'Remarks' });
    expect(screen.getByText('Remarks')).toBeTruthy();
    const details = render('quote_requests.QuoteDetails');
    expect(screen.getByText('PO-2026-117')).toBeTruthy();
    await expectNoAxeViolations(details);
  });
});
