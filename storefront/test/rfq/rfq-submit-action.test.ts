import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Feature 146, US4 (L7) — the server action behind the draft's submit, tested
 * apart from the view. A locked buyer's proposal that reaches the API anyway is
 * refused with `422 RFQ_PRICE_PROPOSAL_NOT_ALLOWED` (FR-022); the action hands
 * the envelope's translated sentence to the view unchanged, and it forwards the
 * buyer's session cookie so the refusal is the buyer's own.
 */
vi.mock('../../lib/session', () => ({
  getSessionCookie: vi.fn(async () => 'sess-123'),
}));

const { submitQuoteRequest } = await import('../../app/(commerce)/quote-request/actions');

const SENTENCE =
  'Twoje konto nie może proponować cen w zapytaniach ofertowych. Usuń proponowane ceny i wyślij zapytanie ponownie — ceny ustali dział sprzedaży.';

const originalFetch = globalThis.fetch;
let calls: Array<{ url: string; init: RequestInit }> = [];

beforeEach(() => {
  calls = [];
  globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(
      JSON.stringify({
        error: { code: 'RFQ_PRICE_PROPOSAL_NOT_ALLOWED', message: SENTENCE, requestId: 'req-1' },
      }),
      { status: 422, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('submitQuoteRequest — a refused proposal', () => {
  it('returns the translated envelope message unchanged', async () => {
    const result = await submitQuoteRequest({
      items: [{ productId: 'prod-1', quantity: 2, desiredUnitPrice: 99.5 }],
    });
    expect(result).toEqual({ ok: false, reason: 'error', message: SENTENCE });
  });

  it('forwards the session cookie to the create endpoint', async () => {
    await submitQuoteRequest({ items: [{ productId: 'prod-1', quantity: 1 }] });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('http://api.test/api/v1/quote-requests');
    expect(calls[0]?.init.method).toBe('POST');
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['Cookie']).toBe('b2b_session=sess-123');
  });
});
