import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { RfqSummary } from '../../lib/api/rfq';
import { formatMoney } from '../../lib/i18n/money';

/**
 * Feature 146, US1 #8a–#8c (FR-009) — the account list's value column.
 *
 * `totalAtCustomerPrice` exists only when every line carries a proposal; the
 * list renders its absence as "—", never as `0,00 PLN` and never as a partial
 * sum. The total at the agreed price is null throughout, so the column falls
 * through to the customer-price total being tested.
 */
function summary(overrides: Partial<RfqSummary>): RfqSummary {
  return {
    id: '11111111-2222-4333-8444-555555555555',
    businessId: 'RFQ-0001',
    organizationId: 'org-1',
    customerAccountId: 'acc-1',
    status: 'Pending',
    awaitingCustomerRevisionAcceptance: false,
    lineCount: 2,
    totalAtCustomerPrice: null,
    totalAtAgreedPrice: null,
    currency: 'PLN',
    submittedAt: '2026-10-01T10:00:00.000Z',
    expiresAt: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

let rows: RfqSummary[] = [];

vi.mock('../../lib/session', () => ({
  getSessionCookie: async () => 'session-cookie',
}));
vi.mock('../../lib/server-context', () => ({
  getServerContext: async () => ({ locale: 'pl' }),
}));
vi.mock('../../lib/api/rfq', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/rfq')>('../../lib/api/rfq');
  return { ...actual, listRfqs: async () => rows };
});

async function renderList(): Promise<string> {
  const { default: QuoteRequestsPage } = await import('../../app/(account)/quote-requests/page');
  const element = await QuoteRequestsPage();
  return renderToString(element as React.ReactElement);
}

/** The value cell of the only row — the fourth `<td>`. */
function valueCell(html: string): string {
  const cells = [...html.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1] ?? '');
  return cells[3] ?? '';
}

describe('account quote-request list — customer-price total (FR-009)', () => {
  beforeEach(() => {
    rows = [];
  });

  it('renders a request with no proposal (cart-converted) as "—", not 0,00 PLN (#8a)', async () => {
    rows = [summary({ totalAtCustomerPrice: null })];
    const cell = valueCell(await renderList());
    expect(cell).toBe('—');
    expect(cell).not.toContain('0,00');
  });

  it('renders a partly proposed request as "—", with no partial sum (#8b)', async () => {
    // The API answers null for a request where one of two lines carries a
    // proposal; the list must not invent a figure for it.
    rows = [summary({ totalAtCustomerPrice: null, lineCount: 2 })];
    const cell = valueCell(await renderList());
    expect(cell).toBe('—');
  });

  it('renders the sum of a fully proposed request (#8c: 2 × 100.00 + 1 × 50.00)', async () => {
    rows = [summary({ totalAtCustomerPrice: 250 })];
    const cell = valueCell(await renderList());
    expect(cell).toBe(formatMoney(250, 'PLN'));
    expect(cell).toContain('250');
  });
});
