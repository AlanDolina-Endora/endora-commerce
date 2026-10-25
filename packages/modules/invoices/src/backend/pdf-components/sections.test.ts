import { describe, expect, it } from 'vitest';
import type { InvoiceDetail } from '@endora-commerce/contracts';
import { lineItemsSection, money, unitMoney } from './sections.js';

/**
 * Owner ruling of 2026-10-25 (`specs/pricing/worked-examples.md` §10.18) — the
 * invoice's unit net price column shows up to four places (a Polish invoice
 * may: art. 106e ust. 1 pkt 9 names the unit price without prescribing its
 * precision); the line values and the totals keep two.
 */
describe('invoice PDF — unit net price', () => {
  it('shows a unit price with its significant places, up to four', () => {
    expect(unitMoney(0.0125)).toBe('0,0125');
    expect(unitMoney(1.505)).toBe('1,505');
    expect(unitMoney(1.5)).toBe('1,50');
    expect(unitMoney(1234.5)).toBe(money(1234.5));
  });

  it('the lines table prints the unit net price at four places and the line value at two', () => {
    const invoice = {
      lines: [
        { ordinal: 1, name: 'Screw', unit: 'szt.', quantity: 10_000, unitNetPrice: 0.0125, taxRate: 0.23, netValue: 125, grossValue: 153.75 },
      ],
    } as unknown as InvoiceDetail;
    const table = lineItemsSection(invoice) as { table: { body: Array<Array<{ text: string }>> } };
    const row = table.table.body[1]!.map((c) => c.text);
    expect(row).toContain('0,0125');
    expect(row).toContain(money(125));
  });
});
