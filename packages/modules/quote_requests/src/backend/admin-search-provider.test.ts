import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { AdminSearchProviderQuery } from '@endora-commerce/contracts';
import {
  QUOTE_REQUEST_ADMIN_SEARCH_STATUS_KEYS,
  createQuoteRequestAdminSearchProvider,
  type QuoteRequestAdminSearchRow,
} from './admin-search-provider.js';

const bundle = (language: 'en' | 'pl'): Record<string, string> =>
  JSON.parse(readFileSync(new URL(`../../i18n/${language}.json`, import.meta.url), 'utf8')) as Record<string, string>;

function query(over: Partial<AdminSearchProviderQuery> = {}): AdminSearchProviderQuery {
  return {
    text: 'QR-1',
    likeEscaped: 'QR-1',
    isUuid: false,
    fields: ['number'],
    limit: 5,
    language: 'pl',
    adminUserId: 'admin-1',
    signal: { aborted: false },
    ...over,
  };
}

const row: QuoteRequestAdminSearchRow = {
  id: 'r1',
  businessId: 'QR-2026-0007',
  organizationName: 'ACME',
  submittedAt: '2026-10-02T10:00:00.000Z',
  status: 'Created from admin',
};

describe('quote_requests admin search provider — descriptor', () => {
  const provider = createQuoteRequestAdminSearchProvider({
    search: async () => ({ rows: [], hasMore: false }),
    translate: async (key) => key,
  });

  it('declares the Quote Request record type, its permission, weight and icon', () => {
    expect(provider).toMatchObject({
      entityType: 'quote_requests.quote_request',
      moduleId: 'quote_requests',
      requiredPermission: 'rfqs:handle',
      weight: 200,
      icon: 'ClipboardList',
      labelKey: 'adminSearch.group.label',
    });
  });

  it('offers the four fields with their defaults and identifiers (FR-022)', () => {
    expect(provider.fields.map((f) => [f.code, f.defaultSelected, f.identifier])).toEqual([
      ['number', true, true],
      ['organizationName', true, false],
      ['customer', true, false],
      ['customerNote', false, false],
    ]);
  });

  it.each(['en', 'pl'] as const)('has every label and status key in the %s bundle', (language) => {
    const keys = bundle(language);
    const all = [
      provider.labelKey,
      ...provider.fields.map((f) => f.labelKey),
      ...Object.values(QUOTE_REQUEST_ADMIN_SEARCH_STATUS_KEYS),
    ];
    for (const key of all) expect(keys[key], `${language}: ${key}`).toEqual(expect.any(String));
  });
});

describe('quote_requests admin search provider — mapping', () => {
  it('maps a row to a hit with a localized status', async () => {
    const translate = vi.fn(async (key: string, language: string) => `${language}:${key}`);
    const search = vi.fn(async () => ({ rows: [row], hasMore: false }));
    const provider = createQuoteRequestAdminSearchProvider({ search, translate });
    const result = await provider.search(query({ fields: ['number', 'customerNote'] }));
    expect(search).toHaveBeenCalledWith(
      { text: 'QR-1', likeEscaped: 'QR-1', isUuid: false, fields: ['number', 'customerNote'], limit: 5 },
      'admin-1',
    );
    expect(result.hits).toEqual([
      {
        id: 'r1',
        title: 'QR-2026-0007',
        subtitle: 'ACME · 2026-10-02',
        status: { code: 'Created from admin', label: 'pl:adminSearch.status.createdFromAdmin' },
        targetRoute: '/quote-requests/r1',
      },
    ]);
  });

  it('shows an unknown status by its code', async () => {
    const provider = createQuoteRequestAdminSearchProvider({
      search: async () => ({ rows: [{ ...row, status: 'Mystery', organizationName: null, submittedAt: null }], hasMore: false }),
      translate: async (key) => key,
    });
    const { hits } = await provider.search(query());
    expect(hits[0]).toMatchObject({ subtitle: null, status: { code: 'Mystery', label: 'Mystery' } });
  });
});
