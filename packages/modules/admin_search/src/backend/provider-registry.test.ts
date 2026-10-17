import { describe, expect, it } from 'vitest';
import type { AdminSearchProvider } from '@endora-commerce/contracts';
import { AdminSearchProviderRegistry } from './provider-registry.js';

function provider(over: Partial<AdminSearchProvider> = {}): AdminSearchProvider {
  return {
    entityType: 'orders.order',
    moduleId: 'orders',
    labelKey: 'adminSearch.group.label',
    icon: 'Receipt',
    requiredPermission: 'orders:read',
    weight: 100,
    fields: [
      { code: 'number', labelKey: 'adminSearch.field.number', defaultSelected: true, identifier: true },
      { code: 'organizationName', labelKey: 'adminSearch.field.organizationName', defaultSelected: false, identifier: false },
    ],
    search: async () => ({ hits: [], hasMore: false }),
    ...over,
  };
}

describe('AdminSearchProviderRegistry.register', () => {
  it('accepts a well-formed provider', () => {
    const registry = new AdminSearchProviderRegistry();
    registry.register(provider());
    expect(registry.all().map((p) => p.entityType)).toEqual(['orders.order']);
  });

  it.each([
    ['a malformed entity type', { entityType: 'Orders' }],
    ['an entity type not prefixed by its module id', { entityType: 'crm.order' }],
    ['no field', { fields: [] }],
    [
      'more than 20 fields',
      {
        fields: Array.from({ length: 21 }, (_, i) => ({
          code: `f${i}`,
          labelKey: 'a.b',
          defaultSelected: true,
          identifier: false,
        })),
      },
    ],
    [
      'duplicate field codes',
      {
        fields: [
          { code: 'number', labelKey: 'a.b', defaultSelected: true, identifier: true },
          { code: 'number', labelKey: 'a.c', defaultSelected: false, identifier: false },
        ],
      },
    ],
    [
      'a malformed field code',
      { fields: [{ code: 'Number', labelKey: 'a.b', defaultSelected: true, identifier: true }] },
    ],
    [
      'no default-selected field',
      { fields: [{ code: 'number', labelKey: 'a.b', defaultSelected: false, identifier: true }] },
    ],
    ['a malformed group label key', { labelKey: 'Admin Search' }],
    [
      'a malformed field label key',
      { fields: [{ code: 'number', labelKey: 'a..b', defaultSelected: true, identifier: true }] },
    ],
  ])('refuses %s, naming the module', (_name, over) => {
    const registry = new AdminSearchProviderRegistry();
    expect(() => registry.register(provider(over as Partial<AdminSearchProvider>))).toThrow(/orders/);
  });

  it('refuses a duplicate entity type', () => {
    const registry = new AdminSearchProviderRegistry();
    registry.register(provider());
    expect(() => registry.register(provider())).toThrow(/already registered/);
  });
});

describe('AdminSearchProviderRegistry.listVisible', () => {
  const crm = provider({
    entityType: 'crm.opportunity',
    moduleId: 'crm',
    requiredPermission: 'crm:read',
    weight: 300,
  });
  const orgs = provider({
    entityType: 'organizations.organization',
    moduleId: 'organizations',
    requiredPermission: ['customers:read', 'customers:manage'],
    weight: 400,
  });
  const orders = provider();
  const sameWeight = provider({
    entityType: 'catalog.category',
    moduleId: 'catalog',
    requiredPermission: 'catalog:read',
    weight: 300,
  });

  function registry(isPresent: (id: string) => boolean = () => true): AdminSearchProviderRegistry {
    const r = new AdminSearchProviderRegistry(isPresent);
    for (const p of [orgs, crm, orders, sameWeight]) r.register(p);
    return r;
  }

  it('orders by weight, then entity type', () => {
    const all = ['orders:read', 'crm:read', 'customers:read', 'catalog:read'];
    expect(registry().listVisible(all).map((p) => p.entityType)).toEqual([
      'orders.order',
      'catalog.category',
      'crm.opportunity',
      'organizations.organization',
    ]);
  });

  it("drops an absent module's providers at enumeration", () => {
    const visible = registry((id) => id !== 'crm').listVisible([
      'orders:read',
      'crm:read',
      'customers:read',
      'catalog:read',
    ]);
    expect(visible.map((p) => p.entityType)).not.toContain('crm.opportunity');
  });

  it('drops a provider whose permission the caller lacks, string and any-of forms', () => {
    expect(registry().listVisible(['orders:read']).map((p) => p.entityType)).toEqual([
      'orders.order',
    ]);
    expect(registry().listVisible(['customers:manage']).map((p) => p.entityType)).toEqual([
      'organizations.organization',
    ]);
    expect(registry().listVisible([])).toEqual([]);
  });

  it("treats a full-access role's wildcard as holding every code", () => {
    expect(registry().listVisible(['*'])).toHaveLength(4);
  });

  it('listPresent ignores permissions but not presence', () => {
    expect(
      registry((id) => id !== 'catalog')
        .listPresent()
        .map((p) => p.entityType),
    ).toEqual(['orders.order', 'crm.opportunity', 'organizations.organization']);
  });
});
