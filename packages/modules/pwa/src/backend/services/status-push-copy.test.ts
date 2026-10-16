import { describe, expect, it } from 'vitest';
import {
  notificationLanguage,
  orderStatusLabel,
  orderStatusCopy,
  quoteStatusCopy,
  QUOTE_STATUS_EVENTS,
} from './status-push-copy.js';

/**
 * `specs/149-pwa-order-status-push/` T008 — the pure rules behind a status
 * push's sentence: which language, which status label, which bundle key, which
 * parameters and which deep link. Nothing here translates; the composer hands
 * the key and the parameters to `_i18n`.
 */

describe('status push copy — language', () => {
  it('reduces a channel language to the bundle it ships', () => {
    expect(notificationLanguage('pl-PL')).toBe('pl');
    expect(notificationLanguage('en-US')).toBe('en');
    expect(notificationLanguage('pl')).toBe('pl');
    expect(notificationLanguage('PL-pl')).toBe('pl');
  });

  it('falls back to English for a language the platform ships no bundle for', () => {
    expect(notificationLanguage('de-DE')).toBe('en');
    expect(notificationLanguage('')).toBe('en');
    expect(notificationLanguage(null)).toBe('en');
    expect(notificationLanguage(undefined)).toBe('en');
  });
});

describe('status push copy — order status label', () => {
  const definition = {
    code: 'shipment_sent',
    name: { en: 'Shipped', pl: 'Wysłane' },
    defaultName: 'Sent',
  };

  it('uses the label in the notification language', () => {
    expect(orderStatusLabel('shipment_sent', definition, 'pl')).toBe('Wysłane');
    expect(orderStatusLabel('shipment_sent', definition, 'en')).toBe('Shipped');
  });

  it('falls back to the default name, then to the code', () => {
    expect(
      orderStatusLabel('shipment_sent', { ...definition, name: { en: 'Shipped' } }, 'pl'),
    ).toBe('Sent');
    expect(
      orderStatusLabel('shipment_sent', { ...definition, name: {}, defaultName: '' }, 'pl'),
    ).toBe('shipment_sent');
    expect(orderStatusLabel('shipment_sent', null, 'pl')).toBe('shipment_sent');
  });

  it('treats a blank label as missing', () => {
    expect(
      orderStatusLabel('shipment_sent', { ...definition, name: { pl: '  ' } }, 'pl'),
    ).toBe('Sent');
  });
});

describe('status push copy — order sentence and link', () => {
  it('names the order number and the status, and opens the order itself', () => {
    expect(
      orderStatusCopy({ orderId: 'o-1', businessId: 'ORD-1001', statusLabel: 'Wysłane' }),
    ).toEqual({
      titleKey: 'notification.orderStatus.title',
      bodyKey: 'notification.orderStatus.body',
      params: { orderNumber: 'ORD-1001', status: 'Wysłane' },
      url: '/orders/o-1',
    });
  });
});

describe('status push copy — quote sentence and link', () => {
  it('maps each consumed quote event to what happened', () => {
    expect(QUOTE_STATUS_EVENTS).toEqual({
      'rfq.created_by_admin.v1': 'prepared',
      'rfq.modified.v1': 'revised',
      'rfq.approved.v1': 'approved',
      'rfq.canceled.v1': 'canceled',
      'rfq.expired.v1': 'expired',
    });
    // The customer's own submission is not a status push (FR-008).
    expect(Object.keys(QUOTE_STATUS_EVENTS)).not.toContain('rfq.created.v1');
  });

  it.each(['prepared', 'revised', 'approved', 'canceled', 'expired'] as const)(
    'keys the %s body and opens the quote itself',
    (what) => {
      expect(quoteStatusCopy({ quoteId: 'q-1', businessId: 'QR-77', what })).toEqual({
        titleKey: 'notification.quote.title',
        bodyKey: `notification.quote.body.${what}`,
        params: { quoteNumber: 'QR-77' },
        url: '/quote-requests/q-1',
      });
    },
  );
});
