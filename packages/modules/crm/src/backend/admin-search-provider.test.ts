import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { AdminSearchProviderQuery } from '@endora-commerce/contracts';
import { createOpportunityAdminSearchProvider, type OpportunityAdminSearchRow } from './admin-search-provider.js';

const bundle = (language: 'en' | 'pl'): Record<string, string> =>
  JSON.parse(readFileSync(new URL(`../../i18n/${language}.json`, import.meta.url), 'utf8')) as Record<string, string>;

function query(over: Partial<AdminSearchProviderQuery> = {}): AdminSearchProviderQuery {
  return {
    text: 'SZ-1',
    likeEscaped: 'SZ-1',
    isUuid: false,
    fields: ['number', 'title'],
    limit: 5,
    language: 'pl',
    adminUserId: 'admin-1',
    signal: { aborted: false },
    ...over,
  };
}

const row: OpportunityAdminSearchRow = {
  id: 'o1',
  number: 'SZ-0001',
  title: 'Fit-out of the Kraków office',
  organizationName: 'ACME',
  statusCode: 'qualified',
  statusName: 'Kwalifikowana',
};

describe('crm admin search provider — descriptor', () => {
  const provider = createOpportunityAdminSearchProvider({ search: async () => ({ rows: [], hasMore: false }) });

  it('declares the Sales Opportunity record type, its permission, weight and icon', () => {
    expect(provider).toMatchObject({
      entityType: 'crm.opportunity',
      moduleId: 'crm',
      requiredPermission: 'crm:read',
      weight: 300,
      icon: 'CircleDollarSign',
      labelKey: 'adminSearch.group.label',
    });
  });

  it('offers the four fields with their defaults and identifiers (FR-022)', () => {
    expect(provider.fields.map((f) => [f.code, f.defaultSelected, f.identifier])).toEqual([
      ['number', true, true],
      ['title', true, false],
      ['organizationName', true, false],
      ['description', false, false],
    ]);
  });

  it.each(['en', 'pl'] as const)('has every label key in the %s bundle', (language) => {
    const keys = bundle(language);
    for (const key of [provider.labelKey, ...provider.fields.map((f) => f.labelKey)]) {
      expect(keys[key], `${language}: ${key}`).toEqual(expect.any(String));
    }
  });
});

describe('crm admin search provider — mapping', () => {
  it('maps a row to the opportunity screen with its status name', async () => {
    const search = vi.fn(async () => ({ rows: [row], hasMore: true }));
    const provider = createOpportunityAdminSearchProvider({ search });
    const result = await provider.search(query());
    expect(search).toHaveBeenCalledWith(
      { text: 'SZ-1', likeEscaped: 'SZ-1', isUuid: false, fields: ['number', 'title'], limit: 5 },
      'pl',
    );
    expect(result).toEqual({
      hasMore: true,
      hits: [
        {
          id: 'o1',
          title: 'SZ-0001 · Fit-out of the Kraków office',
          subtitle: 'ACME',
          status: { code: 'qualified', label: 'Kwalifikowana' },
          targetRoute: '/crm/opportunities/o1',
        },
      ],
    });
  });
});
