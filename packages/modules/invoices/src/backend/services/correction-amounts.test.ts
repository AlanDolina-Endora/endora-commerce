import { describe, expect, it } from 'vitest';
import { correctionAmounts } from './corrective-invoice.js';

/**
 * Issue #417 — a correction's amounts in exact decimal arithmetic. The rule is
 * unchanged: the credited gross is capped at the original invoice's gross and
 * shared out over the lines in order; each line's net is its gross backed out
 * at the mirrored rate, half-up; the document's VAT is the sum of the lines'
 * (gross − net) and its net the credited gross minus that VAT.
 */
describe('correctionAmounts', () => {
  it('stores the unit net price half-up at four places, not the binary 0.0187', () => {
    // 0.15 over 8 pieces is exactly 0.01875; `(0.15 / 8).toFixed(4)` is 0.0187.
    const r = correctionAmounts('0.15', '100.00', [{ amount: '0.15', quantity: 8, rate: '0' }]);
    expect(r.lines[0]?.unitNetPrice).toBe('0.0188');
  });

  it('rounds a credited amount half-up on its decimal digits, not the binary 1.00', () => {
    // A return total that reaches the port as the number 1.005.
    const r = correctionAmounts(1.005, '100.00', [{ amount: 1.005, quantity: 1, rate: '0' }]);
    expect(r.credited).toBe('1.01');
    expect(r.lines[0]?.gross).toBe('1.01');
  });

  it('backs the net out of each line gross at the mirrored rate (G1, G2)', () => {
    const r = correctionAmounts('40.81', '1000.00', [
      { amount: '36.29', quantity: 1, rate: '0.2300' },
      { amount: '4.52', quantity: 1, rate: '0.0500' },
    ]);
    expect(r.lines.map((l) => [l.gross, l.net])).toEqual([
      ['36.29', '29.50'],
      ['4.52', '4.30'],
    ]);
    expect([r.credited, r.netTotal, r.taxTotal]).toEqual(['40.81', '33.80', '7.01']);
  });

  it('caps the credit at the original gross and shares it out in line order', () => {
    const r = correctionAmounts('50.00', '30.00', [
      { amount: '20.00', quantity: 1, rate: '0' },
      { amount: '20.00', quantity: 2, rate: '0' },
    ]);
    expect(r.credited).toBe('30.00');
    expect(r.lines.map((l) => l.gross)).toEqual(['20.00', '10.00']);
    expect(r.lines[1]?.unitNetPrice).toBe('5.0000');
  });

  it('never credits a negative line', () => {
    const r = correctionAmounts('10.00', '30.00', [{ amount: -5, quantity: 1, rate: '0.23' }]);
    expect(r.lines[0]?.gross).toBe('0.00');
    expect(r.lines[0]?.net).toBe('0.00');
  });
});

/**
 * Owner ruling of 2026-10-24 (issue #417): a correction applies the invoice's
 * VAT method — per rate, the net behind the credited gross and VAT on that
 * net — so a full return credits exactly what was invoiced (V3).
 */
describe('correctionAmounts — VAT per rate (owner ruling)', () => {
  it('credits 9.05 × 3 at 8 % as the invoice charged it: 27.15 net, 2.17 VAT', () => {
    const r = correctionAmounts('29.32', '100.00', [
      { amount: '9.78', quantity: 1, rate: '0.0800' },
      { amount: '9.77', quantity: 1, rate: '0.0800' },
      { amount: '9.77', quantity: 1, rate: '0.0800' },
    ]);
    expect([r.credited, r.netTotal, r.taxTotal]).toEqual(['29.32', '27.15', '2.17']);
    expect(r.lines.map((l) => l.net)).toEqual(['9.05', '9.05', '9.05']);
  });

  it('keeps each rate apart (V2: 29.50 at 23 % and 4.30 at 5 %)', () => {
    const r = correctionAmounts('40.81', '100.00', [
      { amount: '36.29', quantity: 1, rate: '0.23' },
      { amount: '4.52', quantity: 1, rate: '0.05' },
    ]);
    expect([r.netTotal, r.taxTotal]).toEqual(['33.80', '7.01']);
  });
});
