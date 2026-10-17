import {
  QUOTE_REQUEST_DOCUMENT_TYPE,
  formatDocumentValue,
  type CatalogAttributeView,
  type DocumentTypeRegistration,
  type QuoteRequestDocumentData,
} from '@endora-commerce/contracts';
import { quoteDetailsBlock } from './blocks/details.js';
import { quoteHeaderBlock } from './blocks/header.js';
import { quoteNotesBlock } from './blocks/notes.js';
import { quotePartiesBlock } from './blocks/parties.js';
import { formatQuoteDate } from './blocks/types.js';
import { quoteRequestBuiltInLayout } from './built-in-layout.js';
import { createQuoteLinesCollection, quoteSummary } from './quote-lines.js';
import { sampleQuoteRequestData } from './sample.js';
import { quoteDocumentTexts } from './texts.js';

/**
 * The *Quote request* document type (`specs/153-quote-request-pdf-template/`,
 * `contracts/quote-request-document.md` §1): a representative picks the
 * template per quote (`per_document`, owner decision D1); every active content
 * language may hold a layout; four quote blocks, every general-purpose block,
 * and the `lines` collection that brings the Line items table.
 */

export const QUOTE_REQUEST_BLOCK_NAMES = [
  'quote_requests.QuoteHeader',
  'quote_requests.QuoteParties',
  'quote_requests.QuoteNotes',
  'quote_requests.QuoteDetails',
] as const;

const VARIABLE_KEYS = [
  'quoteNumber',
  'validUntil',
  'revisionNumber',
  'status',
  'currency',
  'organizationName',
  'organizationTaxId',
  'customerName',
  'customerEmail',
  'salesRepName',
  'salesRepEmail',
  'channelName',
  'netTotal',
  'grossTotal',
] as const;

export interface QuoteRequestDocumentTypeDeps {
  /** The attributes shown on the product page — the catalogue's product-attribute fields. */
  readonly attributes: () => Promise<readonly CatalogAttributeView[]>;
}

export function createQuoteRequestDocumentType(
  deps: QuoteRequestDocumentTypeDeps,
): DocumentTypeRegistration<QuoteRequestDocumentData, undefined> {
  return {
    code: QUOTE_REQUEST_DOCUMENT_TYPE,
    moduleId: 'quote_requests',
    labelKey: 'documentTypes.quoteRequest.label',
    descriptionKey: 'documentTypes.quoteRequest.description',
    blocks: () => [quoteHeaderBlock, quotePartiesBlock, quoteNotesBlock, quoteDetailsBlock],
    coreBlocks: 'all',
    selection: 'per_document',
    variables: VARIABLE_KEYS.map((key) => ({ key, labelKey: `documentTypes.quoteRequest.variables.${key}` })),
    resolveVariables(data, context) {
      const language = context.language;
      const summary = quoteSummary(data);
      return {
        quoteNumber: data.quote.businessId,
        validUntil: formatQuoteDate(data.quote.expiresAt, language) || null,
        revisionNumber: data.quote.revisionNumber > 0 ? String(data.quote.revisionNumber) : null,
        status: quoteDocumentTexts(language).status[data.quote.status] ?? data.quote.status,
        currency: data.quote.currency,
        organizationName: data.buyer.organizationName,
        organizationTaxId: data.buyer.taxId,
        customerName: data.buyer.customerName,
        customerEmail: data.buyer.customerEmail,
        salesRepName: data.salesRep?.name ?? null,
        salesRepEmail: data.salesRep?.email ?? null,
        channelName: data.channel?.name ?? null,
        netTotal: formatDocumentValue(summary['netTotal'], { decimals: 2 }, language) || null,
        grossTotal: formatDocumentValue(summary['grossTotal'], { decimals: 2 }, language) || null,
      };
    },
    defaultContent: quoteRequestBuiltInLayout,
    pageDefaults: {
      pageSize: 'A4',
      orientation: 'portrait',
      marginTop: 40,
      marginRight: 32,
      marginBottom: 40,
      marginLeft: 32,
      baseFontSize: 9,
      showPageNumbers: true,
    },
    sampleData: sampleQuoteRequestData,
    collections: [createQuoteLinesCollection({ attributes: deps.attributes })],
  };
}
