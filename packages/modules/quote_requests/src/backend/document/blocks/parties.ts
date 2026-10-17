import { bool, num, str } from '../props.js';
import { quoteDocumentTexts } from '../texts.js';
import type { QuoteBlockRenderer } from './types.js';

/**
 * `quote_requests.QuoteParties` — the buyer organisation, the requesting
 * customer and the assigned sales representative
 * (`contracts/quote-request-document.md` §2). A section with nothing to say is
 * left out, so an unassigned quote prints no empty representative heading.
 */
export const quotePartiesBlock: QuoteBlockRenderer = {
  name: 'quote_requests.QuoteParties',
  moduleId: 'quote_requests',
  render({ props, data, language, interpolate }) {
    const texts = quoteDocumentTexts(language).parties;
    const sections: Record<string, unknown>[] = [];
    const section = (heading: string, lines: (string | null | undefined)[]) => {
      const shown = lines.filter((value): value is string => typeof value === 'string' && value.trim() !== '');
      if (shown.length === 0) return;
      const title = interpolate(heading);
      sections.push({
        stack: [
          ...(title.trim() !== '' ? [{ text: title, bold: true, margin: [0, 0, 0, 2] }] : []),
          ...shown.map((text) => ({ text })),
        ],
      });
    };

    const buyer = data.buyer;
    const address = bool(props, 'showAddress', true) && buyer.address
      ? [
          buyer.address.line1,
          buyer.address.line2,
          [buyer.address.postalCode, buyer.address.city].filter((part) => part && part.trim() !== '').join(' '),
          buyer.address.country,
        ]
      : [];
    const taxIdLabel = interpolate(str(props, 'taxIdLabel', texts.taxId));
    section(str(props, 'buyerHeading', texts.buyer), [
      buyer.organizationName,
      bool(props, 'showLegalName', true) && buyer.legalName && buyer.legalName !== buyer.organizationName
        ? buyer.legalName
        : null,
      bool(props, 'showTaxId', true) && buyer.taxId ? `${taxIdLabel} ${buyer.taxId}`.trim() : null,
      ...address,
    ]);
    if (bool(props, 'showCustomer', true)) {
      section(str(props, 'customerHeading', texts.customer), [buyer.customerName, buyer.customerEmail]);
    }
    if (bool(props, 'showSalesRep', true) && data.salesRep) {
      section(str(props, 'salesRepHeading', texts.salesRep), [data.salesRep.name, data.salesRep.email]);
    }

    const margin = [0, 0, 0, num(props, 'marginBottom', 12, 0, 144)];
    if (sections.length === 0) return { text: '', margin };
    return str(props, 'layout', 'columns') === 'stacked'
      ? { stack: sections.map((s) => ({ ...s, margin: [0, 0, 0, 6] })), margin }
      : { columns: sections.map((s) => ({ ...s, width: '*' })), columnGap: 16, margin };
  },
};
