import { describe, expect, it } from 'vitest';
import type { DocumentRenderContext, QuoteRequestDocumentData } from '@endora-commerce/contracts';
import { sampleQuoteRequestData } from '../sample.js';
import { quoteDetailsBlock } from './details.js';
import { quoteHeaderBlock } from './header.js';
import { quoteNotesBlock } from './notes.js';
import { quotePartiesBlock } from './parties.js';

/** T025 — the four quote blocks: defaults, toggles, empty sections, hostile props, the PDF's language. */

const context: DocumentRenderContext = { documentType: 'quote_requests.quote_request', language: 'en-US', salesChannelId: null, preview: false, pageWidth: 500 };
const render = (
  block: typeof quoteHeaderBlock,
  props: Record<string, unknown> = {},
  over: { data?: QuoteRequestDocumentData; language?: string } = {},
) =>
  block.render({
    props,
    data: over.data ?? sampleQuoteRequestData(over.language ?? 'en-US'),
    prepared: undefined,
    language: over.language ?? 'en-US',
    context,
    interpolate: (text) => text.replace('{{quoteNumber}}', 'QR-000153'),
  }) as Record<string, unknown>;

/** Every text a pdfmake node holds, depth-first. */
function textsOf(node: unknown): string[] {
  if (node === null || typeof node !== 'object') return [];
  const out: string[] = [];
  const record = node as Record<string, unknown>;
  if (typeof record['text'] === 'string' && record['text'] !== '') out.push(record['text']);
  for (const key of ['stack', 'columns']) {
    if (Array.isArray(record[key])) for (const child of record[key] as unknown[]) out.push(...textsOf(child));
  }
  const table = record['table'] as { body?: unknown[][] } | undefined;
  if (table?.body) for (const row of table.body) for (const cell of row) out.push(...textsOf(cell));
  return out;
}

describe('QuoteHeader', () => {
  it('prints the title, number, date, validity and revision in the PDF language by default', () => {
    expect(textsOf(render(quoteHeaderBlock))).toEqual([
      'Quote',
      'Quote number: QR-000153',
      'Date: October 17, 2026',
      'Valid until: November 16, 2026',
      'Revision: 2',
    ]);
    expect(textsOf(render(quoteHeaderBlock, {}, { language: 'pl-PL' }))).toEqual([
      'Oferta',
      'Numer oferty: QR-000153',
      'Data: 17 października 2026',
      'Ważna do: 16 listopada 2026',
      'Wersja: 2',
    ]);
  });

  it('every line can be switched off; labels are the template’s and interpolated', () => {
    const node = render(quoteHeaderBlock, {
      title: 'Offer {{quoteNumber}}',
      showNumber: false,
      showIssueDate: 'false',
      showRevision: false,
      validUntilLabel: '',
    });
    expect(textsOf(node)).toEqual(['Offer QR-000153', 'November 16, 2026']);
  });

  it('a quote without a validity date prints no validity line; hostile props fall back', () => {
    const data = sampleQuoteRequestData('en-US');
    const node = render(quoteHeaderBlock, { titleSize: 'huge', align: 'justify', marginBottom: -3 }, { data: { ...data, quote: { ...data.quote, expiresAt: null } } });
    expect(textsOf(node)).not.toContain(expect.stringContaining('Valid until'));
    expect(node).toMatchObject({ alignment: 'left', margin: [0, 0, 0, 0] });
  });
});

describe('QuoteParties', () => {
  it('prints buyer, contact and representative in columns', () => {
    const node = render(quotePartiesBlock);
    expect(node['columns']).toHaveLength(3);
    expect(textsOf(node)).toEqual([
      'Buyer', 'Example Industries', 'Example Industries Ltd.', 'Tax ID: PL1234567890', '12 Sample Street', '00-001 Warsaw', 'PL',
      'Contact', 'Anna Example', 'anna@example.com',
      'Your sales representative', 'Jan Sample', 'jan.sample@example.com',
    ]);
  });

  it('leaves an empty section out — no representative assigned, no customer — and switches parts off', () => {
    const data = sampleQuoteRequestData('en-US');
    const node = render(
      quotePartiesBlock,
      { showTaxId: false, showAddress: false, layout: 'stacked' },
      { data: { ...data, salesRep: null, buyer: { ...data.buyer, customerName: null, customerEmail: null } } },
    );
    expect(node['stack']).toHaveLength(1);
    expect(textsOf(node)).toEqual(['Buyer', 'Example Industries', 'Example Industries Ltd.']);
  });
});

describe('QuoteNotes', () => {
  it('prints the header note under its label; nothing when empty unless asked', () => {
    expect(textsOf(render(quoteNotesBlock, { label: 'Remarks' }))[0]).toBe('Remarks');
    const data = sampleQuoteRequestData('en-US');
    const empty = { ...data, quote: { ...data.quote, headerNote: null } };
    expect(textsOf(render(quoteNotesBlock, {}, { data: empty }))).toEqual([]);
    expect(textsOf(render(quoteNotesBlock, { showWhenEmpty: true }, { data: empty }))).toEqual(['Notes']);
  });
});

describe('QuoteDetails', () => {
  it('prints the visible custom fields as a table or a list; nothing when there are none', () => {
    expect(textsOf(render(quoteDetailsBlock))).toEqual(['Details', 'Customer order number', 'PO-2026-117', 'Delivery site', 'Main warehouse']);
    expect(textsOf(render(quoteDetailsBlock, { layout: 'list', heading: '' }))).toEqual([
      'Customer order number: PO-2026-117',
      'Delivery site: Main warehouse',
    ]);
    const data = sampleQuoteRequestData('en-US');
    expect(textsOf(render(quoteDetailsBlock, {}, { data: { ...data, details: [] } }))).toEqual([]);
  });
});
