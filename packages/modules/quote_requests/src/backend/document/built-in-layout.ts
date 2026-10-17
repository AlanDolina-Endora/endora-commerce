import type { DocumentTemplateContent } from '@endora-commerce/contracts';
import { QUOTE_DOCUMENT_TEXTS, type QuoteDocumentLanguage } from './texts.js';
import { QUOTE_LINES_COLLECTION } from './quote-lines.js';

/**
 * The quote PDF's built-in layout (`contracts/quote-request-document.md` §5,
 * FR-024), in English and Polish: header, buyer and contact, notes, the Line
 * items table, details and the net-prices note.
 *
 * The table prints list price and discount % **only if a line has a
 * discount** — both columns test `discountPercent` — and the discount total
 * only when there is one. Column headers are left empty, so each prints the
 * catalogue's name in the layout's language.
 */

const column = (id: string, field: string, over: Record<string, unknown> = {}) => ({
  id,
  field,
  label: '',
  width: 'auto',
  align: 'auto',
  format: {},
  emptyText: '',
  visibleWhen: { op: 'always' },
  ...over,
});

const ifDiscounted = { op: 'any_has_value', field: 'discountPercent' };

function treeFor(language: QuoteDocumentLanguage) {
  const texts = QUOTE_DOCUMENT_TEXTS[language];
  return {
    root: { props: { footerText: '{{quoteNumber}} · {{date}}', showPageNumbers: true } },
    content: [
      {
        type: 'quote_requests.QuoteHeader',
        props: {
          id: 'quote-header',
          title: texts.header.title,
          numberLabel: texts.header.number,
          issueDateLabel: texts.header.issueDate,
          validUntilLabel: texts.header.validUntil,
          revisionLabel: texts.header.revision,
        },
      },
      {
        type: 'quote_requests.QuoteParties',
        props: {
          id: 'quote-parties',
          buyerHeading: texts.parties.buyer,
          taxIdLabel: texts.parties.taxId,
          customerHeading: texts.parties.customer,
          salesRepHeading: texts.parties.salesRep,
        },
      },
      { type: 'quote_requests.QuoteNotes', props: { id: 'quote-notes', label: texts.notes } },
      {
        type: 'document_templates.ItemsTable',
        props: {
          id: 'quote-lines',
          collection: QUOTE_LINES_COLLECTION,
          columns: [
            column('position', 'row.number', { width: 22 }),
            column('product', 'productName', { width: 'fill' }),
            column('sku', 'sku', { visibleWhen: { op: 'any_has_value' } }),
            column('quantity', 'quantity'),
            column('packaging', 'packagingUnit', { visibleWhen: { op: 'any_has_value' } }),
            column('list', 'listUnitPrice', { visibleWhen: ifDiscounted }),
            column('discount', 'discountPercent', { visibleWhen: { op: 'any_has_value' } }),
            column('price', 'unitPrice'),
            column('vat', 'vatRate'),
            column('net', 'lineNet'),
            column('gross', 'lineGross'),
          ],
          detailRow: {
            enabled: true,
            entries: [{ field: 'lineNote', label: '', visibleWhen: { op: 'has_value' } }],
            separator: ' · ',
            italics: true,
            fontSize: 7,
          },
          totals: [
            { field: 'discountTotal', label: '', visibleWhen: { op: 'has_value' }, emphasis: false },
            { field: 'netTotal', label: '', visibleWhen: { op: 'has_value' }, emphasis: false },
            { field: 'vatTotal', label: '', visibleWhen: { op: 'has_value' }, emphasis: false },
            { field: 'grossTotal', label: '', visibleWhen: { op: 'has_value' }, emphasis: true },
          ],
          grouping: null,
          emptyText: texts.emptyLines,
          fontSize: 8,
          headerBackground: '#f1f5f9',
          borderColor: '#cbd5e1',
          stripedRows: false,
          stripeColor: '#f8fafc',
          marginBottom: 12,
        },
      },
      { type: 'quote_requests.QuoteDetails', props: { id: 'quote-details', heading: texts.details } },
      {
        type: 'document_templates.Text',
        props: { id: 'quote-net-note', text: texts.netPricesNote, fontSize: 8, color: '#475569', italics: 'true' },
      },
    ],
  };
}

/** A fresh envelope per call: callers may mutate what they get. */
export function quoteRequestBuiltInLayout(): DocumentTemplateContent {
  return {
    schemaVersion: 1,
    languages: { 'en-US': treeFor('en-US'), 'pl-PL': treeFor('pl-PL') },
  } as DocumentTemplateContent;
}
