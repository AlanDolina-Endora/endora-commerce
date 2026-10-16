import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { AdminSearchProviderQuery } from '@endora-commerce/contracts';
import { createOrderAdminSearchProvider, type OrderAdminSearchRow } from './admin-search-provider.js';

const bundle = (language: 'en' | 'pl'): Record<string, string> =>
  JSON.parse(readFileSync(new URL(`../../i18n/${language}.json`, import.meta.url), 'utf8')) as Record<string, string>;

function query(over: Partial<AdminSearchProviderQuery> = {}): AdminSearchProviderQuery {
  return {
    text: 'ZAM/2026',
    likeEscaped: 'ZAM/2026',
    isUuid: false,
    fields: ['number'],
    limit: 5,
    language: 'pl',
    adminUserId: 'admin-1',
    signal: { aborted: false },
    ...over,
  };
}

const row: OrderAdminSearchRow = {
  id: '0b8f6a3e-6a1f-4c1e-9d5b-1e2f3a4b5c6d',
  businessId: 'ZAM/2026/0042',
  organizationName: 'ACME Sp. z o.o.',
  placedAt: '2026-10-01T09:30:00.000Z',
  total: 1234.5,
  currency: 'PLN',
  status: 'confirmed',
  statusName: { en: 'Confirmed', pl: 'Potwierdzone' },
};

describe('orders admin search provider — descriptor (data-model.md §5)', () => {
  const provider = createOrderAdminSearchProvider({ search: async () => ({ rows: [], hasMore: false }) });

  it('declares the Order record type, its permission, weight and icon', () => {
    expect(provider).toMatchObject({
      entityType: 'orders.order',
      moduleId: 'orders',
      requiredPermission: 'orders:read',
      weight: 100,
      icon: 'Receipt',
      labelKey: 'adminSearch.group.label',
    });
  });

  it('offers the five fields with their defaults and identifiers (FR-022)', () => {
    expect(provider.fields.map((f) => [f.code, f.defaultSelected, f.identifier])).toEqual([
      ['number', true, true],
      ['organizationName', true, false],
      ['customer', true, false],
      ['billingCompanyName', false, false],
      ['billingTaxId', false, true],
    ]);
  });

  it.each(['en', 'pl'] as const)('has every label key in the %s bundle', (language) => {
    const keys = bundle(language);
    for (const key of [provider.labelKey, ...provider.fields.map((f) => f.labelKey)]) {
      expect(keys[key], `${language}: ${key}`).toEqual(expect.any(String));
    }
  });
});

describe('orders admin search provider — mapping', () => {
  it('maps a row to a hit in the request language and passes the query through', async () => {
    const search = vi.fn(async () => ({ rows: [row], hasMore: true }));
    const provider = createOrderAdminSearchProvider({ search });
    const result = await provider.search(query({ fields: ['number', 'billingTaxId'] }));
    expect(search).toHaveBeenCalledWith({
      text: 'ZAM/2026',
      likeEscaped: 'ZAM/2026',
      isUuid: false,
      fields: ['number', 'billingTaxId'],
      limit: 5,
    });
    expect(result).toEqual({
      hasMore: true,
      hits: [
        {
          id: row.id,
          title: 'ZAM/2026/0042',
          subtitle: 'ACME Sp. z o.o. · 2026-10-01 · 1234.50 PLN',
          status: { code: 'confirmed', label: 'Potwierdzone' },
          targetRoute: `/orders/${row.id}`,
        },
      ],
    });
  });

  it('falls back to the English status name, then the code, and leaves out a missing organization', async () => {
    const provider = createOrderAdminSearchProvider({
      search: async () => ({
        rows: [
          { ...row, organizationName: null, statusName: { en: 'Confirmed' } },
          { ...row, id: 'x2', statusName: {} },
        ],
        hasMore: false,
      }),
    });
    const { hits } = await provider.search(query());
    expect(hits[0]?.subtitle).toBe('2026-10-01 · 1234.50 PLN');
    expect(hits[0]?.status?.label).toBe('Confirmed');
    expect(hits[1]?.status?.label).toBe('confirmed');
  });
});
