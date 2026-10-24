import { describe, expect, it } from 'vitest';
import { buildInvoiceLines, readModelVatSummary } from './invoice-line-builder.js';

describe('buildInvoiceLines — VAT summary & reconciliation', () => {
  it('computes gross from net per line and reconciles totals (single rate)', () => {
    const r = buildInvoiceLines([
      { name: 'A', unit: 'szt.', quantity: 1, unitNetPrice: 900, taxRate: 0.23, netValue: 900 },
      { name: 'B', unit: 'h', quantity: 26.5, unitNetPrice: 170, taxRate: 0.23, netValue: 4505 },
    ]);
    expect(r.netTotal).toBe('5405.00');
    expect(r.taxTotal).toBe('1243.15');
    expect(r.grossTotal).toBe('6648.15');
    // per-rate reconciliation: net + vat = gross
    for (const row of r.vatSummary) {
      expect(row.netTotal + row.vatAmount).toBeCloseTo(row.grossTotal, 2);
    }
    // Σ gross of rows = grand total
    const sumGross = r.vatSummary.reduce((s, x) => s + x.grossTotal, 0);
    expect(sumGross).toBeCloseTo(Number(r.grossTotal), 2);
  });

  it('groups multiple VAT rates into separate summary rows', () => {
    const r = buildInvoiceLines([
      { name: 'A', unit: 'szt.', quantity: 1, unitNetPrice: 100, taxRate: 0.23, netValue: 100 },
      { name: 'B', unit: 'szt.', quantity: 1, unitNetPrice: 100, taxRate: 0.08, netValue: 100 },
      { name: 'C', unit: 'szt.', quantity: 1, unitNetPrice: 50, taxRate: 0.23, netValue: 50 },
    ]);
    expect(r.vatSummary).toHaveLength(2);
    const r23 = r.vatSummary.find((x) => x.taxRate === 0.23);
    expect(r23?.netTotal).toBe(150);
    expect(r23?.vatAmount).toBeCloseTo(34.5, 2);
    expect(r.grossTotal).toBe('292.50');
  });

  it('assigns 1-based ordinals and snapshots line values', () => {
    const r = buildInvoiceLines([
      { name: 'X', unit: 'szt.', quantity: 2, unitNetPrice: 10, taxRate: 0.23, netValue: 20 },
    ]);
    expect(r.lines[0]?.ordinal).toBe(1);
    expect(r.lines[0]?.grossValue).toBeCloseTo(24.6, 2);
  });
});

/**
 * Issue #417 — a line's gross is `net × (1 + rate)` rounded half-up on the
 * exact decimal product (`specs/pricing/worked-examples.md` §10.17). The
 * builder rounded the double: 29.50 × 1.23 is 36.28499… in binary, so the
 * invoice read 36.28 where the order's buyer was charged 36.29.
 */
describe('buildInvoiceLines — exact decimal amounts (#417)', () => {
  it('gives 29.50 net at 23 % the gross 36.29, not the binary 36.28 (G1)', () => {
    const r = buildInvoiceLines([
      { name: 'A', unit: 'szt.', quantity: 1, unitNetPrice: 29.5, taxRate: 0.23, netValue: 29.5 },
    ]);
    expect(r.lines[0]?.grossValue).toBe(36.29);
    expect(r.vatSummary[0]?.vatAmount).toBe(6.79);
  });

  it('rounds a lone line gross half-up on the exact product (G1, G4 at 23 %, G2 at 5 %)', () => {
    const one = (net: string, rate: string) =>
      buildInvoiceLines([{ name: 'A', unit: 'szt.', quantity: 1, unitNetPrice: net, taxRate: rate, netValue: net }]).lines[0]!.stored
        .grossValue;
    expect([one('29.50', '0.2300'), one('16.50', '0.2300'), one('4.30', '0.0500')]).toEqual(['36.29', '20.30', '4.52']);
  });

  it('takes two lines at one rate together: 29.50 + 16.50 at 23 % is 46.00 net, 10.58 VAT', () => {
    const r = buildInvoiceLines([
      { name: 'A', unit: 'szt.', quantity: 1, unitNetPrice: '29.50', taxRate: '0.2300', netValue: '29.50' },
      { name: 'B', unit: 'szt.', quantity: 1, unitNetPrice: '16.50', taxRate: '0.2300', netValue: '16.50' },
    ]);
    expect([r.netTotal, r.taxTotal, r.grossTotal]).toEqual(['46.00', '10.58', '56.58']);
    // Each line's share of the 10.58: the exact 6.785 and 3.795 cannot both round up.
    expect(r.lines.map((l) => l.stored.grossValue)).toEqual(['36.28', '20.30']);
  });

  it('takes VAT per rate on each rate’s nets (V1)', () => {
    const r = buildInvoiceLines([
      { name: 'A', unit: 'szt.', quantity: 1, unitNetPrice: '29.50', taxRate: '0.2300', netValue: '29.50' },
      { name: 'B', unit: 'szt.', quantity: 1, unitNetPrice: '4.30', taxRate: '0.0500', netValue: '4.30' },
      { name: 'C', unit: 'szt.', quantity: 1, unitNetPrice: '10.00', taxRate: '0.0800', netValue: '10.00' },
    ]);
    expect(r.vatSummary).toEqual([
      { taxRate: 0.05, netTotal: 4.3, vatAmount: 0.22, grossTotal: 4.52 },
      { taxRate: 0.08, netTotal: 10, vatAmount: 0.8, grossTotal: 10.8 },
      { taxRate: 0.23, netTotal: 29.5, vatAmount: 6.79, grossTotal: 36.29 },
    ]);
    expect([r.netTotal, r.taxTotal, r.grossTotal]).toEqual(['43.80', '7.81', '51.61']);
  });

  it('sums many lines without a binary residue', () => {
    const r = buildInvoiceLines(
      Array.from({ length: 10 }, (_, i) => ({
        name: `L${i}`,
        unit: 'szt.',
        quantity: 1,
        unitNetPrice: '0.10',
        taxRate: '0',
        netValue: '0.10',
      })),
    );
    expect(r.netTotal).toBe('1.00');
    expect(r.grossTotal).toBe('1.00');
  });

  it('carries a negative discount line at 0 %', () => {
    const r = buildInvoiceLines([
      { name: 'A', unit: 'szt.', quantity: 1, unitNetPrice: '29.50', taxRate: '0.23', netValue: '29.50' },
      { name: 'Rabat', unit: 'usł.', quantity: 1, unitNetPrice: '-5.00', taxRate: 0, netValue: '-5.00' },
    ]);
    expect(r.grossTotal).toBe('31.29');
    expect(r.lines[1]?.stored).toEqual({ unitNetPrice: '-5.0000', taxRate: '0.0000', netValue: '-5.00', grossValue: '-5.00' });
  });
});

/**
 * Owner ruling of 2026-10-24 (issue #417): VAT per rate on the sum of the nets
 * at that rate, rounded once; gross = net + VAT. A line's gross is its share,
 * informational, and the line grosses add up to the total. The builder used to
 * round each line's gross and take a rate's VAT as Σ gross − Σ net.
 */
describe('buildInvoiceLines — VAT per rate on the sum of the nets (owner ruling)', () => {
  it('takes three 0.02 lines at 23 % to 0.01 VAT, not the per-line 0.00', () => {
    const line = { name: 'A', unit: 'szt.', quantity: 1, unitNetPrice: '0.02', taxRate: '0.2300', netValue: '0.02' };
    const r = buildInvoiceLines([line, line, line]);
    expect(r.vatSummary).toEqual([{ taxRate: 0.23, netTotal: 0.06, vatAmount: 0.01, grossTotal: 0.07 }]);
    expect([r.netTotal, r.taxTotal, r.grossTotal]).toEqual(['0.06', '0.01', '0.07']);
    expect(r.lines.map((l) => l.stored.grossValue)).toEqual(['0.03', '0.02', '0.02']);
  });

  it('makes the line grosses add up to the gross total', () => {
    const r = buildInvoiceLines([
      { name: 'A', unit: 'szt.', quantity: 1, unitNetPrice: '9.05', taxRate: '0.08', netValue: '9.05' },
      { name: 'B', unit: 'szt.', quantity: 1, unitNetPrice: '9.05', taxRate: '0.08', netValue: '9.05' },
      { name: 'C', unit: 'szt.', quantity: 1, unitNetPrice: '9.05', taxRate: '0.08', netValue: '9.05' },
    ]);
    expect(r.grossTotal).toBe('29.32');
    expect(r.lines.reduce((sum, l) => sum + Math.round(l.grossValue * 100), 0)).toBe(2932);
  });
});

describe('readModelVatSummary — an invoice issued before the ruling', () => {
  it('shows a stored invoice whose totals the per-rate rule reproduces under that rule', () => {
    const lines = [{ taxRate: '0.2300', netValue: '0.02', grossValue: '0.03' }, { taxRate: '0.2300', netValue: '0.02', grossValue: '0.02' }];
    expect(readModelVatSummary(lines, { taxTotal: '0.01', total: '0.05' })).toEqual([
      { taxRate: 0.23, netTotal: 0.04, vatAmount: 0.01, grossTotal: 0.05 },
    ]);
  });

  it('shows a stored invoice issued under the per-line rule as it was issued', () => {
    // Three 0.02 lines at 23 % were issued with line grosses 0.02 and VAT 0.00.
    const line = { taxRate: '0.2300', netValue: '0.02', grossValue: '0.02' };
    expect(readModelVatSummary([line, line, line], { taxTotal: '0.00', total: '0.06' })).toEqual([
      { taxRate: 0.23, netTotal: 0.06, vatAmount: 0, grossTotal: 0.06 },
    ]);
  });
});
