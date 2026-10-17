import { describe, expect, it, vi } from 'vitest';
import type { AdminSearchProvider, AdminSearchStoredConfiguration } from '@endora-commerce/contracts';
import { AdminSearchProviderRegistry } from './provider-registry.js';
import { AdminSearchConfigurationService, configurationVersion } from './configuration-service.js';

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

const crm = fakeProvider({
  entityType: 'crm.opportunity',
  moduleId: 'crm',
  labelKey: 'adminSearch.group.label',
  icon: 'CircleDollarSign',
  weight: 300,
  fields: [
    { code: 'number', labelKey: 'adminSearch.field.number', defaultSelected: true, identifier: true },
    { code: 'title', labelKey: 'adminSearch.field.title', defaultSelected: false, identifier: false },
  ],
});

function build(stored: AdminSearchStoredConfiguration, present: (moduleId: string) => boolean = () => true) {
  const registry = new AdminSearchProviderRegistry(present);
  registry.register(fakeProvider());
  registry.register(crm);
  let current: unknown = stored;
  const setValueForAllChannels = vi.fn(async (_code: string, value: unknown) => {
    current = value;
    return { affectedChannelIds: [], newVersion: 'v' };
  });
  const service = new AdminSearchConfigurationService({
    registry,
    settings: {
      readWithRaw: async () => ({
        raw: { minimumQueryLength: 3, resultsPerEntity: 5, stored: current as AdminSearchStoredConfiguration },
        storedRaw: current,
      }),
    },
    settingsAdmin: { setValueForAllChannels },
    i18n: { translate: async (moduleId, key, language) => `${language}:${moduleId}.${key}` },
  });
  return { service, setValueForAllChannels, current: () => current };
}

const actor = { actorAdminUserId: 'admin-1', requestId: 'req-1' };

async function refusal(promise: Promise<unknown>): Promise<{ statusCode: number; code: string; details?: Array<{ path: string }> }> {
  try {
    await promise;
  } catch (error) {
    return error as { statusCode: number; code: string; details?: Array<{ path: string }> };
  }
  throw new Error('expected a refusal');
}

describe('AdminSearchConfigurationService.view', () => {
  it('lists present providers only, with selected, default and customised flags and labels', async () => {
    const { service } = build(
      { version: 1, entities: { 'crm.opportunity': { enabled: false, fields: ['title'] } } },
      (moduleId) => moduleId !== 'orders',
    );
    const view = await service.view('pl');
    expect(view.minimumQueryLength).toBe(3);
    expect(view.resultsPerEntity).toBe(5);
    expect(view.version).toBe(configurationVersion({ version: 1, entities: { 'crm.opportunity': { enabled: false, fields: ['title'] } } }));
    expect(view.entities).toEqual([
      {
        entityType: 'crm.opportunity',
        label: 'pl:crm.adminSearch.group.label',
        icon: 'CircleDollarSign',
        enabled: false,
        customized: true,
        fields: [
          { code: 'number', label: 'pl:crm.adminSearch.field.number', selected: false, defaultSelected: true },
          { code: 'title', label: 'pl:crm.adminSearch.field.title', selected: true, defaultSelected: false },
        ],
      },
    ]);
  });
});

describe('AdminSearchConfigurationService.update', () => {
  it('reports every failure with its path and stores nothing', async () => {
    const { service, setValueForAllChannels } = build({ version: 1, entities: {} });
    const error = await refusal(
      service.update(
        {
          expectedVersion: null,
          entities: [
            { entityType: 'orders.order', enabled: true, fields: ['gone'] },
            { entityType: 'crm.opportunity', enabled: true, fields: [] },
          ],
        },
        'en',
        actor,
      ),
    );
    expect(error.statusCode).toBe(422);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details?.map((d) => d.path)).toEqual(['entities.0.fields.0', 'entities.1.fields']);
    expect(setValueForAllChannels).not.toHaveBeenCalled();
  });

  it("merges over the stored value, keeping an absent provider's and unsubmitted entries, and writes with the actor", async () => {
    const stored = {
      version: 1 as const,
      entities: {
        'catalog.product': { enabled: false, fields: ['sku'] },
        'crm.opportunity': { enabled: true, fields: ['title'] },
      },
    };
    const { service, setValueForAllChannels, current } = build(stored, (moduleId) => moduleId !== 'catalog');
    const view = await service.update(
      {
        expectedVersion: configurationVersion(stored),
        entities: [{ entityType: 'orders.order', enabled: true, fields: ['billingTaxId'] }],
      },
      'en',
      actor,
    );
    expect(setValueForAllChannels).toHaveBeenCalledWith(
      'admin_search.entity_fields',
      {
        version: 1,
        entities: {
          'catalog.product': { enabled: false, fields: ['sku'] },
          'crm.opportunity': { enabled: true, fields: ['title'] },
          'orders.order': { enabled: true, fields: ['billingTaxId'] },
        },
      },
      null,
      actor,
    );
    expect(view.version).toBe(configurationVersion(current() as AdminSearchStoredConfiguration));
    expect(view.entities.find((e) => e.entityType === 'orders.order')?.customized).toBe(true);
  });

  it('restores defaults for an entry with neither enabled nor fields', async () => {
    const stored = { version: 1 as const, entities: { 'orders.order': { enabled: false, fields: ['number'] } } };
    const { service, current } = build(stored);
    const view = await service.update({ expectedVersion: null, entities: [{ entityType: 'orders.order' }] }, 'en', actor);
    expect((current() as AdminSearchStoredConfiguration).entities).toEqual({});
    expect(view.entities.find((e) => e.entityType === 'orders.order')).toMatchObject({ enabled: true, customized: false });
  });

  it('refuses a stale expected version with 409 VERSION_CONFLICT (FR-026)', async () => {
    const { service, setValueForAllChannels } = build({ version: 1, entities: { 'orders.order': { enabled: true, fields: ['number'] } } });
    const error = await refusal(
      service.update(
        { expectedVersion: configurationVersion({ version: 1, entities: {} }), entities: [{ entityType: 'orders.order' }] },
        'en',
        actor,
      ),
    );
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('VERSION_CONFLICT');
    expect(setValueForAllChannels).not.toHaveBeenCalled();
  });
});

describe('configurationVersion', () => {
  it('is stable over key order and changes with the value', () => {
    const a = configurationVersion({ version: 1, entities: { 'a.b': { enabled: true, fields: ['x'] }, 'c.d': { enabled: false, fields: [] } } });
    const b = configurationVersion({ version: 1, entities: { 'c.d': { enabled: false, fields: [] }, 'a.b': { enabled: true, fields: ['x'] } } });
    expect(a).toBe(b);
    expect(configurationVersion({ version: 1, entities: {} })).not.toBe(a);
  });
});
