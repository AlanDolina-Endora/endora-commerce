import { align, bool, color, num, str } from '../props.js';
import { quoteDocumentTexts } from '../texts.js';
import { formatQuoteDate, type QuoteBlockRenderer } from './types.js';

/**
 * `quote_requests.QuoteHeader` — the title, the quote number, the date the PDF
 * was produced, the validity date and the revision number, each switchable
 * (`contracts/quote-request-document.md` §2). A label left out of the stored
 * props prints in the PDF's language.
 */
export const quoteHeaderBlock: QuoteBlockRenderer = {
  name: 'quote_requests.QuoteHeader',
  moduleId: 'quote_requests',
  render({ props, data, language, interpolate }) {
    const texts = quoteDocumentTexts(language).header;
    const stack: Record<string, unknown>[] = [
      {
        text: interpolate(str(props, 'title', texts.title)),
        fontSize: num(props, 'titleSize', 18, 8, 36),
        bold: true,
        color: color(props, 'titleColor', '#111827'),
        margin: [0, 0, 0, 4],
      },
    ];
    const line = (label: string, value: string) => {
      if (value === '') return;
      const shown = interpolate(label);
      stack.push({ text: shown.trim() === '' ? value : `${shown} ${value}`, color: '#334155' });
    };
    if (bool(props, 'showNumber', true)) line(str(props, 'numberLabel', texts.number), data.quote.businessId);
    if (bool(props, 'showIssueDate', true)) {
      line(str(props, 'issueDateLabel', texts.issueDate), formatQuoteDate(data.generatedAt, language));
    }
    if (bool(props, 'showValidUntil', true)) {
      line(str(props, 'validUntilLabel', texts.validUntil), formatQuoteDate(data.quote.expiresAt, language));
    }
    if (bool(props, 'showRevision', true) && data.quote.revisionNumber > 0) {
      line(str(props, 'revisionLabel', texts.revision), String(data.quote.revisionNumber));
    }
    return {
      stack,
      alignment: align(props, 'align', 'left'),
      margin: [0, 0, 0, num(props, 'marginBottom', 12, 0, 144)],
    };
  },
};
