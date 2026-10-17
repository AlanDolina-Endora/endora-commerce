import { describe, expect, it } from 'vitest';
import { comparisonDocumentDataSchema } from './comparisons.js';
import { invoiceDocumentDataSchema } from './invoices.js';

/**
 * `specs/152-compare-pdf-template/` T007 — the data each host hands the
 * document render port. The facility never reads it; these shapes are what
 * the host's own blocks and the editor sample agree on.
 */

const view = {
  id: '00000000-0000-4000-8000-000000000001',
  shareToken: 'abcdefgh1234',
  displayMode: 'all',
  maxProducts: 4,
  products: [],
  comparableAttributes: [],
  pricedFor: 'channel',
  hiddenProductCount: 0,
  createdAt: '2026-10-17T10:00:00.000Z',
  updatedAt: '2026-10-17T10:00:00.000Z',
};

describe('comparisonDocumentDataSchema', () => {
  it('accepts an anonymous buyer with no storefront address', () => {
    expect(
      comparisonDocumentDataSchema.safeParse({
        view,
        channelName: 'B2B',
        customerName: null,
        organizationName: null,
        shareUrl: null,
        hideEmptyRows: false,
        generatedAt: '2026-10-17T10:00:00.000Z',
      }).success,
    ).toBe(true);
  });
  it('refuses a share URL that is not a URL, and a missing hideEmptyRows', () => {
    const base = {
      view,
      channelName: 'B2B',
      customerName: 'Anna',
      organizationName: 'Acme',
      generatedAt: '2026-10-17T10:00:00.000Z',
    };
    expect(comparisonDocumentDataSchema.safeParse({ ...base, shareUrl: 'nope', hideEmptyRows: true }).success).toBe(false);
    expect(comparisonDocumentDataSchema.safeParse({ ...base, shareUrl: null }).success).toBe(false);
  });
});

describe('invoiceDocumentDataSchema', () => {
  it('carries the amount-in-words locale, pl or en', () => {
    expect(invoiceDocumentDataSchema.shape.amountLocale.options).toEqual(['pl', 'en']);
  });
});
