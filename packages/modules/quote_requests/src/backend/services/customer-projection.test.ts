import { describe, expect, it } from 'vitest';
import { customerEventsOf } from './customer-projection.js';

/** Feature 153 (owner answer Q4) — a quote PDF's delivery is the administrators' record, never the customer's. */
describe('customerEventsOf', () => {
  it('leaves the pdf-sent events out of a customer reply and keeps every other one', () => {
    const events = [{ eventType: 'submitted' }, { eventType: 'pdf-sent' }, { eventType: 'approved' }] as const;
    expect(customerEventsOf(events).map((e) => e.eventType)).toEqual(['submitted', 'approved']);
  });
});
