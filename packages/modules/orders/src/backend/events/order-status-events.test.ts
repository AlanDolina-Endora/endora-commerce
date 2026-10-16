import { describe, expect, it } from 'vitest';
import type { EventBus } from '@endora-commerce/platform/events';
import {
  emitOrderStatusAfter,
  orderStatusAfterEventNames,
  orderStatusBeforeEventNames,
  orderStatusEventName,
} from './order-status-events.js';

describe('orderStatusEventName', () => {
  it('builds the from→to before name', () => {
    expect(orderStatusEventName('fromToBefore', { from: 'new', to: 'pending' })).toBe(
      'order.status.from_new_to_pending.before',
    );
  });

  it('builds the from-any before name', () => {
    expect(orderStatusEventName('fromBefore', { from: 'paid' })).toBe('order.status.from_paid.before');
  });

  it('builds the from→to after name', () => {
    expect(orderStatusEventName('fromToAfter', { from: 'paid', to: 'completed' })).toBe(
      'order.status.from_paid_to_completed.after',
    );
  });

  it('builds the to-any after name', () => {
    expect(orderStatusEventName('toAfter', { to: 'shipment_sent' })).toBe('order.status.to_shipment_sent.after');
  });

  it('handles multi-word status codes verbatim', () => {
    expect(orderStatusEventName('fromToAfter', { from: 'shipment_ready', to: 'shipment_sent' })).toBe(
      'order.status.from_shipment_ready_to_shipment_sent.after',
    );
  });
});

describe('order status event name groups', () => {
  it('returns the two before names for a transition', () => {
    expect(orderStatusBeforeEventNames('new', 'pending')).toEqual([
      'order.status.from_new_to_pending.before',
      'order.status.from_new.before',
    ]);
  });

  it('returns the two after names for a transition', () => {
    expect(orderStatusAfterEventNames('new', 'pending')).toEqual([
      'order.status.from_new_to_pending.after',
      'order.status.to_pending.after',
    ]);
  });
});

/**
 * Issue #242 — `order.cancelled.v1` was declared in `OrderEvents` and listed in
 * the module's documentation, and nothing emitted it: a subscriber written
 * against it never ran. Every committed status change is announced by
 * `emitOrderStatusAfter` — the transition service and, through
 * `orderStatusAnnouncePort`, `payments` and `shipments` — so a cancellation is
 * announced there, by whichever path made it.
 */
describe('emitOrderStatusAfter — a cancellation', () => {
  const change = {
    orderId: 'order-1',
    organizationId: 'org-1',
    salesChannelId: 'channel-1',
    from: 'pending',
    to: 'cancelled',
    actor: { kind: 'admin' as const, adminUserId: 'admin-1' },
    reason: 'customer asked',
    businessId: 'ORD-0001',
  };

  function recordingBus(): { bus: EventBus; emitted: Array<{ name: string; payload: Record<string, unknown> }> } {
    const emitted: Array<{ name: string; payload: Record<string, unknown> }> = [];
    const bus = {
      emit: (name: string, payload: Record<string, unknown>) => {
        emitted.push({ name, payload });
      },
    } as unknown as EventBus;
    return { bus, emitted };
  }

  it('announces order.cancelled.v1 once, after order.status_changed.v1', () => {
    const { bus, emitted } = recordingBus();

    emitOrderStatusAfter(bus, change);

    const names = emitted.map((e) => e.name);
    expect(names.filter((n) => n === 'order.cancelled.v1')).toHaveLength(1);
    expect(names.indexOf('order.status_changed.v1')).toBeLessThan(names.indexOf('order.cancelled.v1'));
    expect(emitted.find((e) => e.name === 'order.cancelled.v1')!.payload).toMatchObject({
      eventId: expect.any(String),
      occurredAt: expect.any(String),
      orderId: 'order-1',
      organizationId: 'org-1',
      salesChannelId: 'channel-1',
      from: 'pending',
      actor: { kind: 'admin', adminUserId: 'admin-1' },
      reason: 'customer asked',
      businessId: 'ORD-0001',
    });
  });

  it('does not announce it for any other status', () => {
    const { bus, emitted } = recordingBus();

    emitOrderStatusAfter(bus, { ...change, to: 'completed' });

    expect(emitted.map((e) => e.name)).not.toContain('order.cancelled.v1');
  });

  it('does not announce it for an order that was already cancelled', () => {
    const { bus, emitted } = recordingBus();

    emitOrderStatusAfter(bus, { ...change, from: 'cancelled' });

    expect(emitted).toEqual([]);
  });
});
