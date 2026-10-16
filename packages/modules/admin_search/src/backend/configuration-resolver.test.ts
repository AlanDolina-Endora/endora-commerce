import { describe, expect, it } from 'vitest';
import type { AdminSearchProvider } from '@endora-commerce/contracts';
import {
  mergeConfiguration,
  parseStoredConfiguration,
  resolveConfiguration,
  validateStoredEntries,
  validateSubmittedEntries,
} from './configuration-resolver.js';

/** A provider descriptor for unit tests; `search` answers nothing unless overridden. */
function fakeProvider(over: Partial<AdminSearchProvider> = {}): AdminSearchProvider {
  return {
    entityType: 'orders.order',
    moduleId: 'orders',
    labelKey: 'adminSearch.group.label',
    icon: 'Receipt',
    requiredPermission: 'orders:read',
    weight: 100,
    fields: [
      { code: 'number', labelKey: 'adminSearch.field.number', defaultSelected: true, identifier: true },
      {
        code: 'organizationName',
        labelKey: 'adminSearch.field.organizationName',
        defaultSelected: true,
        identifier: false,
      },
      {
        code: 'billingTaxId',
        labelKey: 'adminSearch.field.billingTaxId',
        defaultSelected: false,
        identifier: true,
      },
    ],
    search: async () => ({ hits: [], hasMore: false }),
    ...over,
  };
}

const orders = fakeProvider();
const crm = fakeProvider({
  entityType: 'crm.opportunity',
  moduleId: 'crm',
  fields: [
    { code: 'number', labelKey: 'a.b', defaultSelected: true, identifier: true },
    { code: 'title', labelKey: 'a.c', defaultSelected: false, identifier: false },
  ],
});

describe('resolveConfiguration (data-model.md §3)', () => {
  it('no stored entry ⇒ defaults, enabled, not customised', () => {
    const [entry] = resolveConfiguration({ version: 1, entities: {} }, [orders]);
    expect(entry).toMatchObject({ enabled: true, fields: ['number', 'organizationName'], customized: false });
  });

  it('keeps a stored subset in offer order', () => {
    const [entry] = resolveConfiguration(
      { version: 1, entities: { 'orders.order': { enabled: true, fields: ['billingTaxId', 'number'] } } },
      [orders],
    );
    expect(entry).toMatchObject({ enabled: true, fields: ['number', 'billingTaxId'], customized: true });
  });

  it('drops codes the provider no longer offers', () => {
    const [entry] = resolveConfiguration(
      { version: 1, entities: { 'orders.order': { enabled: true, fields: ['gone', 'billingTaxId'] } } },
      [orders],
    );
    expect(entry?.fields).toEqual(['billingTaxId']);
  });

  it('falls back to the defaults when nothing offered is left', () => {
    const [entry] = resolveConfiguration(
      { version: 1, entities: { 'orders.order': { enabled: true, fields: ['gone'] } } },
      [orders],
    );
    expect(entry?.fields).toEqual(['number', 'organizationName']);
  });

  it('respects enabled: false', () => {
    const [entry] = resolveConfiguration(
      { version: 1, entities: { 'orders.order': { enabled: false, fields: ['number'] } } },
      [orders],
    );
    expect(entry?.enabled).toBe(false);
  });

  it('ignores entries for absent providers', () => {
    const resolved = resolveConfiguration(
      { version: 1, entities: { 'crm.opportunity': { enabled: false, fields: ['title'] } } },
      [orders],
    );
    expect(resolved.map((r) => r.provider.entityType)).toEqual(['orders.order']);
  });
});

describe('parseStoredConfiguration', () => {
  it('answers the default for a malformed value rather than failing a search', () => {
    expect(parseStoredConfiguration('garbage')).toEqual({ version: 1, entities: {} });
    expect(parseStoredConfiguration(null)).toEqual({ version: 1, entities: {} });
  });

  it('keeps a well-formed value', () => {
    const value = { version: 1, entities: { 'orders.order': { enabled: true, fields: ['number'] } } };
    expect(parseStoredConfiguration(value)).toEqual(value);
  });
});

describe('mergeConfiguration', () => {
  const stored = {
    version: 1 as const,
    entities: {
      'crm.opportunity': { enabled: false, fields: ['title'] },
      'orders.order': { enabled: true, fields: ['number'] },
      'catalog.product': { enabled: true, fields: ['sku'] },
    },
  };

  it('replaces submitted entries, keeps unsubmitted and absent providers’ entries', () => {
    const merged = mergeConfiguration(stored, [
      { entityType: 'orders.order', enabled: false, fields: ['billingTaxId'] },
    ]);
    expect(merged.entities).toEqual({
      'crm.opportunity': { enabled: false, fields: ['title'] },
      'orders.order': { enabled: false, fields: ['billingTaxId'] },
      'catalog.product': { enabled: true, fields: ['sku'] },
    });
  });

  it('removes an entry submitted with neither enabled nor fields (restore defaults)', () => {
    const merged = mergeConfiguration(stored, [{ entityType: 'orders.order' }]);
    expect(merged.entities['orders.order']).toBeUndefined();
    expect(merged.entities['crm.opportunity']).toEqual({ enabled: false, fields: ['title'] });
  });
});

describe('validateSubmittedEntries', () => {
  it('accepts valid entries and a restore-defaults entry', () => {
    expect(
      validateSubmittedEntries(
        [
          { entityType: 'orders.order', enabled: true, fields: ['number'] },
          { entityType: 'crm.opportunity' },
        ],
        [orders, crm],
      ),
    ).toEqual([]);
  });

  it('reports every failure with its path', () => {
    const issues = validateSubmittedEntries(
      [
        { entityType: 'unknown.thing', enabled: true, fields: ['x'] },
        { entityType: 'orders.order', enabled: true, fields: ['number', 'number', 'gone'] },
        { entityType: 'crm.opportunity', enabled: true, fields: [] },
        { entityType: 'orders.order', enabled: true, fields: ['number'] },
      ],
      [orders, crm],
    );
    expect(issues.map((i) => i.path)).toEqual([
      'entities.0.entityType',
      'entities.1.fields.1',
      'entities.1.fields.2',
      'entities.2.fields',
      'entities.3.entityType',
    ]);
  });

  it('refuses an entry with only one of enabled and fields', () => {
    const issues = validateSubmittedEntries([{ entityType: 'orders.order', enabled: true }], [orders]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toBe('entities.0');
  });

  it('accepts an excluded type with no field', () => {
    expect(
      validateSubmittedEntries([{ entityType: 'orders.order', enabled: false, fields: [] }], [orders]),
    ).toEqual([]);
  });
});

describe('validateStoredEntries', () => {
  it("accepts an absent provider's entry unchecked", () => {
    expect(
      validateStoredEntries({ 'crm.opportunity': { enabled: true, fields: ['whatever'] } }, [orders]),
    ).toEqual([]);
  });

  it('refuses a not-offered field, duplicates and an enabled type with no field for a present one', () => {
    const issues = validateStoredEntries(
      {
        'orders.order': { enabled: true, fields: ['number', 'number', 'gone'] },
        'crm.opportunity': { enabled: true, fields: [] },
      },
      [orders, crm],
    );
    expect(issues.map((i) => i.path)).toEqual([
      'entities.orders.order.fields.1',
      'entities.orders.order.fields.2',
      'entities.crm.opportunity.fields',
    ]);
  });
});
