import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Feature 146, US4 (FR-025) — the storefront's read of the buyer's negotiation
 * lock. The display fails open: an unreadable answer shows the proposal input,
 * and the API still enforces the lock. Review fix N11 — a failure is logged on
 * the server, so a broken read is not invisible.
 */
const apiGetAuthed = vi.fn();
vi.mock('../../lib/api/mutations', () => ({
  apiGetAuthed: (...args: unknown[]) => apiGetAuthed(...args),
  apiMutate: vi.fn(),
}));

const { getQuoteRequestNegotiation } = await import('../../lib/api/rfq');

afterEach(() => {
  apiGetAuthed.mockReset();
  vi.restoreAllMocks();
});

describe('getQuoteRequestNegotiation', () => {
  it('answers the buyer’s value and logs nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    apiGetAuthed.mockResolvedValue({ priceProposalsAllowed: false });
    expect(await getQuoteRequestNegotiation('sess-1')).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('fails open and logs when the read throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    apiGetAuthed.mockRejectedValue(new Error('backend down (test)'));
    expect(await getQuoteRequestNegotiation('sess-1')).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('quote-request negotiation');
  });

  it('fails open and logs when the answer does not parse', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    apiGetAuthed.mockResolvedValue({ unexpected: true });
    expect(await getQuoteRequestNegotiation('sess-1')).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('asks nothing without a session', async () => {
    expect(await getQuoteRequestNegotiation(null)).toBe(true);
    expect(apiGetAuthed).not.toHaveBeenCalled();
  });
});
