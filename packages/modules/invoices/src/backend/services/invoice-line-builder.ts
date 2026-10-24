import {
  compareDecimals,
  decimalDifference,
  decimalSum,
  grossFromNetHalfUp,
  moneySum,
  roundHalfUp,
  type InvoiceLine,
  type VatSummaryRow,
} from '@endora-commerce/contracts';

export interface RawOrderLine {
  name: string;
  unit: string;
  quantity: number;
  /** Net unit price, as written (a decimal string, or a number read as its shortest decimal). */
  unitNetPrice: string | number;
  /** Fractional VAT rate, e.g. `0.23`. */
  taxRate: string | number;
  /** Net line value (quantity × unitNetPrice) at two places. */
  netValue: string | number;
  orderItemId?: string | null;
}

/** The line's amounts as the `invoice_lines` columns store them. */
export interface StoredInvoiceLineAmounts {
  unitNetPrice: string;
  taxRate: string;
  netValue: string;
  grossValue: string;
}

export type BuiltInvoiceLine = InvoiceLine & {
  orderItemId?: string | null;
  stored: StoredInvoiceLineAmounts;
};

export interface BuiltInvoiceTotals {
  lines: BuiltInvoiceLine[];
  vatSummary: VatSummaryRow[];
  /** Two-place decimal strings, as the `invoices` columns store them. */
  netTotal: string;
  taxTotal: string;
  grossTotal: string;
}

/** One line's rate, net and gross, as two-place decimals. */
export interface VatSummaryInput {
  taxRate: string | number;
  netValue: string | number;
  grossValue: string | number;
}

export interface VatSummary {
  rows: Array<{ taxRate: string; netTotal: string; vatAmount: string; grossTotal: string }>;
  netTotal: string;
  taxTotal: string;
  grossTotal: string;
}

/**
 * The per-rate VAT summary of an invoice's lines, and its totals — the one
 * rule both issuance and the read model apply. Per rate: the net is the sum of
 * the lines' nets, the gross the sum of the lines' grosses (each rounded on its
 * own line), and the VAT the difference. The totals are the sums of the rows.
 * Exact decimal arithmetic throughout (issue #417); every input is already at
 * two places, so a sum is exact and the half-up step only normalises.
 */
export function summarizeVat(lines: readonly VatSummaryInput[]): VatSummary {
  const byRate = new Map<string, { net: Array<string | number>; gross: Array<string | number> }>();
  for (const l of lines) {
    const key = roundHalfUp(l.taxRate, 4);
    const cur = byRate.get(key) ?? { net: [], gross: [] };
    cur.net.push(l.netValue);
    cur.gross.push(l.grossValue);
    byRate.set(key, cur);
  }
  const rows = [...byRate.entries()]
    .sort((a, b) => compareDecimals(a[0], b[0]))
    .map(([taxRate, v]) => {
      const netTotal = moneySum(v.net);
      const grossTotal = moneySum(v.gross);
      return { taxRate, netTotal, vatAmount: roundHalfUp(decimalDifference(grossTotal, netTotal)), grossTotal };
    });
  return {
    rows,
    netTotal: roundHalfUp(decimalSum(...rows.map((r) => r.netTotal))),
    taxTotal: roundHalfUp(decimalSum(...rows.map((r) => r.vatAmount))),
    grossTotal: roundHalfUp(decimalSum(...rows.map((r) => r.grossTotal))),
  };
}

/** The summary rows in the contract's number shape — each a two-place decimal, read losslessly. */
export function vatSummaryRows(rows: VatSummary['rows']): VatSummaryRow[] {
  return rows.map((r) => ({
    taxRate: Number(r.taxRate),
    netTotal: Number(r.netTotal),
    vatAmount: Number(r.vatAmount),
    grossTotal: Number(r.grossTotal),
  }));
}

/**
 * Builds immutable invoice line snapshots + the per-rate VAT summary + totals
 * from raw order lines. Pure + deterministic so it can be unit-tested in
 * isolation (SC-003: net + VAT = gross per rate; Σ gross = grand total).
 *
 * A line's gross is `net × (1 + rate)` rounded half-up on the exact decimal
 * product (issue #417, `specs/pricing/worked-examples.md` §10.17); rounding the
 * double made 29.50 at 23 % the gross 36.28.
 */
export function buildInvoiceLines(raw: RawOrderLine[]): BuiltInvoiceTotals {
  const lines = raw.map((r, i): BuiltInvoiceLine => {
    const netValue = roundHalfUp(r.netValue);
    const stored: StoredInvoiceLineAmounts = {
      unitNetPrice: roundHalfUp(r.unitNetPrice, 4),
      taxRate: roundHalfUp(r.taxRate, 4),
      netValue,
      grossValue: grossFromNetHalfUp(netValue, r.taxRate, 'fraction'),
    };
    return {
      ordinal: i + 1,
      name: r.name,
      unit: r.unit,
      quantity: r.quantity,
      unitNetPrice: Number(stored.unitNetPrice),
      taxRate: Number(stored.taxRate),
      netValue: Number(stored.netValue),
      grossValue: Number(stored.grossValue),
      orderItemId: r.orderItemId ?? null,
      stored,
    };
  });

  const summary = summarizeVat(lines.map((l) => l.stored));
  return {
    lines,
    vatSummary: vatSummaryRows(summary.rows),
    netTotal: summary.netTotal,
    taxTotal: summary.taxTotal,
    grossTotal: summary.grossTotal,
  };
}
