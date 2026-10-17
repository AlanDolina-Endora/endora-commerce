import { describe, expect, it } from 'vitest';
import type { DocumentFieldDefinition, DocumentItem, DocumentRenderContext, DocumentValue } from '@endora-commerce/contracts';
import { numberItems, renderItemsTable, type ItemsTableInput } from './items-table.js';

/**
 * T010, T043 — the Line items table, asserted on pdfmake definitions
 * (`specs/153-quote-request-pdf-template/contracts/document-collections.md` §3.2, §3.3).
 */

const money = (amount: number, currency = 'PLN'): DocumentValue => ({ kind: 'money', amount, currency });
const text = (value: string): DocumentValue => ({ kind: 'text', value });
const field = (path: string, over: Partial<DocumentFieldDefinition> = {}): DocumentFieldDefinition => ({
  path,
  label: `L:${path}`,
  valueKind: 'text',
  group: 'line',
  audience: 'customer',
  ...over,
});

const FIELDS: DocumentFieldDefinition[] = [
  field('row.number', { valueKind: 'number', defaultAlign: 'right', defaultFormat: { decimals: 0 } }),
  field('name'),
  field('price', { valueKind: 'money', defaultFormat: { decimals: 2 } }),
  field('discount', { valueKind: 'percent', defaultFormat: { decimals: 1 } }),
  field('note'),
  field('brand', { group: 'product' }),
];
const SUMMARY_FIELDS: DocumentFieldDefinition[] = [
  field('net', { valueKind: 'money' }),
  field('discounts', { valueKind: 'money' }),
];

const items = (rows: Record<string, DocumentValue>[]): DocumentItem[] => numberItems(rows.map((values) => ({ values })));

const LINES = items([
  { name: text('Bolt'), price: money(10), discount: null, note: text('Urgent'), brand: text('Acme') },
  { name: text('Nut'), price: money(2.5), discount: { kind: 'percent', value: 12.5 }, note: null, brand: text('Bolts Inc') },
  { name: text('Washer'), price: null, discount: null, note: null, brand: text('Acme') },
]);

const context: DocumentRenderContext = {
  documentType: 'acme.lines',
  language: 'en-US',
  salesChannelId: null,
  preview: false,
  pageWidth: 500,
};

const column = (id: string, fieldPath: string, over: Record<string, unknown> = {}) => ({
  id,
  field: fieldPath,
  label: '',
  width: 'auto',
  align: 'auto',
  format: {},
  emptyText: '',
  visibleWhen: { op: 'always' },
  ...over,
});

function render(props: Record<string, unknown>, over: Partial<ItemsTableInput> = {}) {
  return renderItemsTable({
    props,
    catalogue: { fields: FIELDS, summaryFields: SUMMARY_FIELDS },
    items: LINES,
    summary: { net: money(17.5), discounts: null },
    language: 'en-US',
    context,
    interpolate: (t) => t.replace('{{who}}', 'Anna'),
    ...over,
  }) as { stack: Record<string, unknown>[]; margin: number[] };
}

type Cell = { text?: string; colSpan?: number; alignment?: string; bold?: boolean; fillColor?: string; italics?: boolean };
const tableOf = (node: { stack: Record<string, unknown>[] }) =>
  node.stack[0] as { table: { headerRows: number; dontBreakRows: boolean; widths: unknown[]; body: Cell[][] }; fontSize: number };
const rowTexts = (body: Cell[][]) => body.map((row) => row.map((cell) => cell.text ?? ''));

describe('numberItems', () => {
  it('assigns row.number 1…n in item order without touching the input', () => {
    const input = [{ values: { name: text('a') } }, { values: { name: text('b') } }];
    const out = numberItems(input);
    expect(out.map((i) => i.values['row.number'])).toEqual([{ kind: 'number', value: 1 }, { kind: 'number', value: 2 }]);
    expect(input[0]!.values).not.toHaveProperty('row.number');
  });
});

describe('renderItemsTable — columns (FR-032–FR-037)', () => {
  it('prints a real table: header row repeated, rows never split, catalogue labels by default', () => {
    const node = render({ columns: [column('c1', 'row.number'), column('c2', 'name'), column('c3', 'price')] });
    const table = tableOf(node);
    expect(table.table.headerRows).toBe(1);
    expect(table.table.dontBreakRows).toBe(true);
    expect(rowTexts(table.table.body)).toEqual([
      ['L:row.number', 'L:name', 'L:price'],
      ['1', 'Bolt', 'PLN\u00a010.00'],
      ['2', 'Nut', 'PLN\u00a02.50'],
      ['3', 'Washer', ''],
    ]);
    expect(node.margin).toEqual([0, 0, 0, 12]);
  });

  it('a header label replaces the catalogue name and is interpolated', () => {
    const table = tableOf(render({ columns: [column('c1', 'name', { label: 'For {{who}}' })] }));
    expect(table.table.body[0]![0]!.text).toBe('For Anna');
  });

  it('never drops a column; any_has_value drops it only when no line has a value', () => {
    const hidden = tableOf(
      render({
        columns: [
          column('c1', 'name'),
          column('c2', 'note', { visibleWhen: { op: 'never' } }),
          column('c3', 'discount', { visibleWhen: { op: 'any_has_value' } }),
        ],
      }),
    );
    expect(hidden.table.body[0]!.map((c) => c.text)).toEqual(['L:name', 'L:discount']);
    const noDiscount = items([{ name: text('a'), discount: null }]);
    const none = tableOf(
      render(
        { columns: [column('c1', 'name'), column('c3', 'discount', { visibleWhen: { op: 'any_has_value' } })] },
        { items: noDiscount },
      ),
    );
    expect(none.table.body[0]!.map((c) => c.text)).toEqual(['L:name']);
  });

  it('a rule may test another field', () => {
    const table = tableOf(
      render({ columns: [column('c1', 'name'), column('c2', 'price', { visibleWhen: { op: 'any_has_value', field: 'missing' } })] }),
    );
    expect(table.table.body[0]!.map((c) => c.text)).toEqual(['L:name']);
  });

  it('formats per kind with the column format over the field default, aligned by kind', () => {
    const table = tableOf(
      render({
        columns: [
          column('c1', 'price', { format: { currencyDisplay: 'none', decimals: 1 } }),
          column('c2', 'discount'),
          column('c3', 'name', { align: 'center' }),
        ],
      }),
    );
    expect(table.table.body[2]!.map((c) => c.text)).toEqual(['2.5', '12.5 %', 'Nut']);
    expect(table.table.body[1]!.map((c) => c.alignment)).toEqual(['right', 'right', 'center']);
    expect(table.table.body[0]!.map((c) => c.alignment)).toEqual(['right', 'right', 'center']);
  });

  it('prints the column empty text where a line has no value', () => {
    const table = tableOf(render({ columns: [column('c1', 'price', { emptyText: '—' })] }));
    expect(table.table.body[3]![0]!.text).toBe('—');
  });

  it('an unknown field prints its empty text in the body and nothing in the header (FR-037)', () => {
    const table = tableOf(render({ columns: [column('c1', 'name'), column('c2', 'attributes.gone', { emptyText: 'n/a' })] }));
    expect(rowTexts(table.table.body).map((row) => row[1])).toEqual(['', 'n/a', 'n/a', 'n/a']);
  });

  it('no line, or no visible column, prints the empty text instead of a grid', () => {
    const empty = render({ columns: [column('c1', 'name')], emptyText: 'No lines for {{who}}' }, { items: [] });
    expect(empty.stack[0]).toEqual({ text: 'No lines for Anna' });
    const allHidden = render({ columns: [column('c1', 'name', { visibleWhen: { op: 'never' } })], emptyText: 'Nothing' });
    expect(allHidden.stack[0]).toEqual({ text: 'Nothing' });
  });

  it('widths: auto, fill and points; fixed widths over the page are scaled down proportionally', () => {
    expect(
      tableOf(render({ columns: [column('a', 'name'), column('b', 'note', { width: 'fill' }), column('c', 'price', { width: 60 })] })).table
        .widths,
    ).toEqual(['auto', '*', 60]);
    const scaled = tableOf(render({ columns: [column('a', 'name', { width: 400 }), column('b', 'price', { width: 400 })] }));
    expect(scaled.table.widths).toEqual([250, 250]);
  });

  it('style: header fill, striped rows, font size, border colour', () => {
    const node = render({
      columns: [column('c1', 'name')],
      headerBackground: '#eeeeee',
      stripedRows: true,
      stripeColor: '#fafafa',
      fontSize: 11,
      borderColor: '#123456',
    });
    const table = tableOf(node) as ReturnType<typeof tableOf> & { layout: { hLineColor: () => string } };
    expect(table.table.body[0]![0]!.fillColor).toBe('#eeeeee');
    expect(table.table.body.slice(1).map((row) => row[0]!.fillColor)).toEqual([undefined, '#fafafa', undefined]);
    expect(table.fontSize).toBe(11);
    expect(table.layout.hLineColor()).toBe('#123456');
  });

  it('survives hostile props: wrong types read as defaults, an unknown op as always', () => {
    const node = render({
      columns: [
        { id: 1, field: 'name', label: 7, width: 'huge', align: 'justify', format: 'x', emptyText: 3, visibleWhen: { op: 'sometimes' } },
        'not a column',
        { field: 42 },
      ],
      fontSize: 'big',
      headerBackground: 'red',
      stripedRows: 'maybe',
      marginBottom: -5,
    });
    const table = tableOf(node);
    expect(rowTexts(table.table.body).map((row) => row[0])).toEqual(['L:name', 'Bolt', 'Nut', 'Washer']);
    expect(table.table.widths[0]).toBe('auto');
    expect(table.fontSize).toBe(9);
    expect(node.margin).toEqual([0, 0, 0, 0]);
    const nothing = render({ columns: 'nope' });
    expect(nothing.stack[0]).toEqual({ text: '' });
  });
});

describe('renderItemsTable — detail row (FR-040)', () => {
  const detailRow = {
    enabled: true,
    entries: [
      { field: 'note', label: 'Note', visibleWhen: { op: 'has_value' } },
      { field: 'brand', label: '', visibleWhen: { op: 'has_value' } },
      { field: 'name', label: 'Hidden', visibleWhen: { op: 'never' } },
    ],
    separator: ' | ',
    italics: true,
    fontSize: 7,
  };

  it('prints the entries that hold, label: value, joined, spanning the table; no row when none prints', () => {
    const table = tableOf(render({ columns: [column('c1', 'name'), column('c2', 'price')], detailRow }));
    const body = table.table.body;
    expect(body).toHaveLength(1 + 3 + 3);
    expect(body[2]![0]).toMatchObject({ text: 'Note: Urgent | Acme', colSpan: 2, italics: true, fontSize: 7 });
    expect(body[4]![0]!.text).toBe('Bolts Inc');
    expect(body[6]![0]!.text).toBe('Acme');
    const noBrand = items([{ name: text('x'), note: null, brand: null }]);
    expect(tableOf(render({ columns: [column('c1', 'name')], detailRow }, { items: noBrand })).table.body).toHaveLength(2);
  });

  it('is off unless enabled', () => {
    const table = tableOf(render({ columns: [column('c1', 'name')], detailRow: { ...detailRow, enabled: false } }));
    expect(table.table.body).toHaveLength(4);
  });
});

describe('renderItemsTable — totals (FR-041)', () => {
  it('prints the rows whose rule holds over the totals, in a separate right-aligned unbreakable table', () => {
    const node = render({
      columns: [column('c1', 'name')],
      totals: [
        { field: 'net', label: '', visibleWhen: { op: 'has_value' }, emphasis: true },
        { field: 'discounts', label: 'Discounts', visibleWhen: { op: 'has_value' } },
        { field: 'discounts', label: 'Discounts always', visibleWhen: { op: 'always' } },
        { field: 'net', label: 'Never', visibleWhen: { op: 'never' } },
        { field: 'unknown', label: 'Unknown', visibleWhen: { op: 'always' } },
      ],
    });
    const totals = node.stack[1] as { unbreakable: boolean; columns: [unknown, { table: { body: Cell[][] } }] };
    expect(totals.unbreakable).toBe(true);
    const body = totals.columns[1].table.body;
    expect(rowTexts(body)).toEqual([
      ['L:net', 'PLN\u00a017.50'],
      ['Discounts always', ''],
      ['Unknown', ''],
    ]);
    expect(body[0]!.every((cell) => cell.bold === true)).toBe(true);
    expect(body[1]![1]!.alignment).toBe('right');
  });

  it('prints no totals table when no row holds', () => {
    const node = render({ columns: [column('c1', 'name')], totals: [{ field: 'discounts', label: 'D' }] });
    expect(node.stack).toHaveLength(1);
  });
});

describe('renderItemsTable — grouping (FR-042)', () => {
  const lines = items([
    { name: text('a'), brand: text('Acme'), price: money(1) },
    { name: text('b'), brand: null, price: money(2) },
    { name: text('c'), brand: text('Bolts'), price: money(3) },
    { name: text('d'), brand: text('Acme'), price: money(4.25) },
  ]);

  it('groups in order of first appearance, keeps order within a group, never restarts the position', () => {
    const table = tableOf(
      render(
        {
          columns: [column('c1', 'row.number'), column('c2', 'name'), column('c3', 'price')],
          grouping: { field: 'brand', emptyLabel: 'Other', subtotalField: 'price', subtotalLabel: 'Subtotal' },
        },
        { items: lines },
      ),
    );
    expect(rowTexts(table.table.body)).toEqual([
      ['L:row.number', 'L:name', 'L:price'],
      ['Acme', '', ''],
      ['1', 'a', 'PLN\u00a01.00'],
      ['4', 'd', 'PLN\u00a04.25'],
      ['Subtotal', '', 'PLN\u00a05.25'],
      ['Other', '', ''],
      ['2', 'b', 'PLN\u00a02.00'],
      ['Subtotal', '', 'PLN\u00a02.00'],
      ['Bolts', '', ''],
      ['3', 'c', 'PLN\u00a03.00'],
      ['Subtotal', '', 'PLN\u00a03.00'],
    ]);
    expect(table.table.body[1]![0]).toMatchObject({ colSpan: 3, bold: true });
    expect(table.table.body[4]![0]).toMatchObject({ colSpan: 2, alignment: 'right' });
  });

  it('a subtotal of mixed currencies prints nothing; no subtotal field, no subtotal row', () => {
    const mixed = items([
      { name: text('a'), brand: text('X'), price: money(1) },
      { name: text('b'), brand: text('X'), price: money(1, 'EUR') },
    ]);
    const table = tableOf(
      render(
        { columns: [column('c1', 'name'), column('c2', 'price')], grouping: { field: 'brand', subtotalField: 'price', subtotalLabel: 'S' } },
        { items: mixed },
      ),
    );
    expect(rowTexts(table.table.body).at(-1)).toEqual(['S', '']);
    const plain = tableOf(
      render({ columns: [column('c1', 'name')], grouping: { field: 'brand', subtotalField: null } }, { items: mixed }),
    );
    expect(plain.table.body).toHaveLength(1 + 1 + 2);
  });
});

describe('renderItemsTable — preview samples', () => {
  it('fills a field’s sample value where a preview line has none', () => {
    const fields = [...FIELDS, field('attributes.colour', { sampleValue: text('Example') })];
    const table = tableOf(
      render(
        { columns: [column('c1', 'attributes.colour')] },
        { catalogue: { fields, summaryFields: [] }, context: { ...context, preview: true } },
      ),
    );
    expect(rowTexts(table.table.body).map((row) => row[0])).toEqual(['L:attributes.colour', 'Example', 'Example', 'Example']);
    const real = tableOf(render({ columns: [column('c1', 'attributes.colour')] }, { catalogue: { fields, summaryFields: [] } }));
    expect(rowTexts(real.table.body).map((row) => row[0])).toEqual(['L:attributes.colour', '', '', '']);
  });
});
