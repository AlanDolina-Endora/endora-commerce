import { describe, expect, it } from 'vitest';
import {
  documentTemplateContentSchema,
  itemsTablePropsSchema,
  mergeFieldKeyRe,
  type DocumentRenderContext,
} from '@endora-commerce/contracts';
import { createQuoteRequestDocumentType, QUOTE_REQUEST_BLOCK_NAMES } from './quote-request-document-type.js';
import { quoteLineItems } from './quote-lines.js';
import { sampleQuoteRequestData } from './sample.js';
import { QUOTE_DOCUMENT_TEXTS } from './texts.js';

/** T027 — the registration the facility receives. Rendering through the facility is the contract suite's. */

const type = createQuoteRequestDocumentType({ attributes: async () => [] });
const context = (language: string): DocumentRenderContext => ({
  documentType: type.code,
  language,
  salesChannelId: null,
  preview: false,
  pageWidth: 531,
});

describe('the Quote request document type', () => {
  it('per-document selection, four quote blocks, every core block, every language, one collection', () => {
    expect(type.code).toBe('quote_requests.quote_request');
    expect(type.moduleId).toBe('quote_requests');
    expect(type.selection).toBe('per_document');
    expect(type.coreBlocks).toBe('all');
    expect(type.languages).toBeUndefined();
    expect(type.blocks().map((b) => b.name)).toEqual([...QUOTE_REQUEST_BLOCK_NAMES]);
    expect(type.collections?.map((c) => c.key)).toEqual(['lines']);
  });

  it('ships a valid built-in layout in English and Polish; its table settings pass the facility schema', () => {
    const content = documentTemplateContentSchema.parse(type.defaultContent());
    expect(Object.keys(content.languages)).toEqual(['en-US', 'pl-PL']);
    for (const tree of Object.values(content.languages)) {
      const table = tree.content.find((node) => node.type === 'document_templates.ItemsTable');
      expect(itemsTablePropsSchema.safeParse(table?.props).success).toBe(true);
      expect(tree.content.map((node) => node.type)).toEqual([
        'quote_requests.QuoteHeader',
        'quote_requests.QuoteParties',
        'quote_requests.QuoteNotes',
        'document_templates.ItemsTable',
        'quote_requests.QuoteDetails',
        'document_templates.Text',
      ]);
    }
    const pl = JSON.stringify(content.languages['pl-PL']);
    for (const english of [QUOTE_DOCUMENT_TEXTS['en-US'].header.title, QUOTE_DOCUMENT_TEXTS['en-US'].netPricesNote]) {
      expect(pl).not.toContain(`"${english}"`);
    }
    expect(type.defaultContent()).not.toBe(type.defaultContent());
  });

  it('declares the fourteen merge fields of FR-023 and resolves them from the data', () => {
    expect(type.variables?.map((v) => v.key)).toHaveLength(14);
    for (const variable of type.variables ?? []) expect(mergeFieldKeyRe.test(variable.key)).toBe(true);
    const values = type.resolveVariables!(sampleQuoteRequestData('en-US'), context('en-US'));
    expect(values).toMatchObject({
      quoteNumber: 'QR-000153',
      validUntil: 'November 16, 2026',
      revisionNumber: '2',
      status: 'Approved',
      organizationName: 'Example Industries',
      organizationTaxId: 'PL1234567890',
      customerName: 'Anna Example',
      salesRepName: 'Jan Sample',
      channelName: 'B2B store',
    });
    expect(values['netTotal']).toMatch(/^PLN/);
    const pl = type.resolveVariables!(sampleQuoteRequestData('pl-PL'), context('pl-PL'));
    expect(pl['status']).toBe('Zatwierdzone');
    expect(pl['grossTotal']).toMatch(/zł$/);
  });

  it('a value the quote does not have resolves empty, never a placeholder', () => {
    const data = sampleQuoteRequestData('en-US');
    const values = type.resolveVariables!(
      { ...data, salesRep: null, quote: { ...data.quote, expiresAt: null }, lines: [{ ...data.lines[0]!, agreedUnitPrice: null }] },
      context('en-US'),
    );
    expect(values).toMatchObject({ salesRepName: null, validUntil: null, netTotal: null, grossTotal: null });
  });

  it('the sample quote has five priced lines, two discounted, one packed, one with a note', () => {
    const sample = sampleQuoteRequestData('en-US');
    const items = quoteLineItems(sample);
    expect(items).toHaveLength(5);
    expect(items.filter((i) => i.values['discountPercent'] !== null)).toHaveLength(2);
    expect(sample.lines.filter((l) => l.packagingUnitName)).toHaveLength(1);
    expect(sample.lines.filter((l) => l.lineNote)).toHaveLength(1);
    expect(sample.lines.every((l) => l.agreedUnitPrice !== null)).toBe(true);
  });
});
