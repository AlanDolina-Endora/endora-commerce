import {
  compareDecimals,
  decimalDifference,
  moneySum,
  roundHalfUp,
  vatByRate,
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

/** One stored line's rate, net and gross, as two-place decimals. */
export interface VatSummaryInput {
  taxRate: string | number;
  netValue: string | number;
  grossValue: string | number;
}

/** A per-rate VAT summary in the contract's number shape — each figure a two-place decimal, read losslessly. */
function summaryRows(rows: ReadonlyArray<{ rate: string; net: string; vat: string; gross: string }>): VatSummaryRow[] {
  return rows.map((r) => ({
    taxRate: Number(r.rate),
    netTotal: Number(r.net),
    vatAmount: Number(r.vat),
    grossTotal: Number(r.gross),
  }));
}

/**
 * The rule invoices were issued under before the owner's ruling of
 * 2026-10-24: per rate, the sum of the lines' own rounded grosses minus the
 * sum of their nets. Kept only to show such an invoice as it was issued.
 */
function legacyVatSummary(lines: readonly VatSummaryInput[]): VatSummaryRow[] {
  const byRate = new Map<string, { net: Array<string | number>; gross: Array<string | number> }>();
  for (const l of lines) {
    const key = roundHalfUp(l.taxRate, 4);
    const cur = byRate.get(key) ?? { net: [], gross: [] };
    cur.net.push(l.netValue);
    cur.gross.push(l.grossValue);
    byRate.set(key, cur);
  }
  return summaryRows(
    [...byRate.entries()]
      .sort((a, b) => compareDecimals(a[0], b[0]))
      .map(([rate, v]) => {
        const net = moneySum(v.net);
        const gross = moneySum(v.gross);
        return { rate, net, vat: roundHalfUp(decimalDifference(gross, net)), gross };
      }),
  );
}

/**
 * The per-rate VAT summary a stored invoice is shown with. An invoice is a
 * document that was issued, and its summary must add up to the totals it was
 * issued with: the summary is the one VAT method (`vatByRate`) when that
 * reproduces the stored VAT and gross, and otherwise — an invoice issued
 * before the ruling under the per-line rule — the rule it was issued under.
 */
export function readModelVatSummary(
  lines: readonly VatSummaryInput[],
  stored: { taxTotal: string | null | undefined; total: string },
): VatSummaryRow[] {
  const current = vatByRate(
    lines.map((l) => ({ net: l.netValue, rate: l.taxRate })),
    'fraction',
  );
  const reproduces =
    compareDecimals(current.gross, stored.total) === 0 &&
    (stored.taxTotal == null || compareDecimals(current.vat, stored.taxTotal) === 0);
  return reproduces ? summaryRows(current.rows) : legacyVatSummary(lines);
}

/**
 * Builds immutable invoice line snapshots + the per-rate VAT summary + totals
 * from raw order lines. Pure + deterministic so it can be unit-tested in
 * isolation (SC-003: net + VAT = gross per rate; Σ gross = grand total).
 *
 * **The VAT method is the platform's one** (`vatByRate`, owner ruling of
 * 2026-10-24, issue #417; art. 106e ust. 1 pkt 13–14): per rate, VAT on the sum
 * of the lines' nets, rounded half-up once; gross = net + VAT. A line's gross
 * is informational — its share of its rate's VAT added to its net — so the
 * line grosses add up to the invoice gross. The net per line is what the law
 * requires on the line; the gross per line is optional.
 */
export function buildInvoiceLines(raw: RawOrderLine[]): BuiltInvoiceTotals {
  const nets = raw.map((r) => roundHalfUp(r.netValue));
  const vat = vatByRate(
    raw.map((r, i) => ({ net: nets[i]!, rate: r.taxRate })),
    'fraction',
  );
  const lines = raw.map((r, i): BuiltInvoiceLine => {
    const stored: StoredInvoiceLineAmounts = {
      unitNetPrice: roundHalfUp(r.unitNetPrice, 4),
      taxRate: roundHalfUp(r.taxRate, 4),
      netValue: nets[i]!,
      grossValue: vat.lines[i]!.gross,
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

  return {
    lines,
    vatSummary: summaryRows(vat.rows),
    netTotal: vat.net,
    taxTotal: vat.vat,
    grossTotal: vat.gross,
  };
}
