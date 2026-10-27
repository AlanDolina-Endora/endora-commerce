import { describe, expect, it } from 'vitest';
import { analyticsRange, completionRate, secondsToDays, shareOf } from './analytics-range.js';

/**
 * The range and the ratios of Project analytics (research R-15, FR-037,
 * FR-038) — pure, so the SQL only counts and sums.
 */

describe('analyticsRange', () => {
  it('runs from the first day at midnight UTC to the midnight after the last, the last day included', () => {
    const { start, end } = analyticsRange({ from: '2026-01-01', to: '2026-01-31' });
    expect(start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('is one whole day when both ends are the same day', () => {
    const { start, end } = analyticsRange({ from: '2026-10-25', to: '2026-10-25' });
    expect(end.getTime() - start.getTime()).toBe(86_400_000);
  });

  it('crosses a year and a leap day', () => {
    expect(analyticsRange({ from: '2028-02-28', to: '2028-02-29' }).end.toISOString()).toBe('2028-03-01T00:00:00.000Z');
    expect(analyticsRange({ from: '2026-12-31', to: '2026-12-31' }).end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('refuses a range that ends before it starts, or a day that is not one', () => {
    expect(() => analyticsRange({ from: '2026-02-01', to: '2026-01-31' })).toThrow(RangeError);
    expect(() => analyticsRange({ from: 'yesterday', to: '2026-01-31' })).toThrow(RangeError);
  });
});

describe('the ratios', () => {
  it('completion rate is completed over closed, and nothing when nothing closed', () => {
    expect(completionRate(14, 15)).toBeCloseTo(14 / 29, 12);
    expect(completionRate(3, 0)).toBe(1);
    expect(completionRate(0, 0)).toBeNull();
  });

  it('a share is a part of its whole, and zero of nothing', () => {
    expect(shareOf(7, 15)).toBeCloseTo(7 / 15, 12);
    expect(shareOf(0, 0)).toBe(0);
  });

  it('seconds read as days, and an average over nothing is nothing', () => {
    expect(secondsToDays(86_400 * 1.5)).toBe(1.5);
    expect(secondsToDays(null)).toBeNull();
  });
});
