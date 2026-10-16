import { describe, expect, it } from 'vitest';
import type { AdminSearchProvider, SettingWriteValidationInput } from '@endora-commerce/contracts';
import { AdminSearchProviderRegistry } from './provider-registry.js';
import { createAdminSearchSettingsValidator } from './settings-validator.js';

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

function input(code: string, proposedValue: unknown): SettingWriteValidationInput {
  return { code, ownerModuleId: 'admin_search', proposedValue, projection: [], targetedChannelIds: [] };
}

function validator(present: (moduleId: string) => boolean = () => true) {
  const registry = new AdminSearchProviderRegistry(present);
  registry.register(fakeProvider());
  return createAdminSearchSettingsValidator(registry);
}

async function refusal(promise: Promise<void>): Promise<{ code: string; statusCode: number; details: unknown }> {
  try {
    await promise;
  } catch (error) {
    return error as { code: string; statusCode: number; details: unknown };
  }
  throw new Error('expected a refusal');
}

describe('admin_search settings validator', () => {
  it('answers for exactly its three codes, as admin_search', () => {
    const v = validator();
    expect(v.contributorModuleId).toBe('admin_search');
    expect([...v.codes].sort()).toEqual([
      'admin_search.entity_fields',
      'admin_search.minimum_query_length',
      'admin_search.results_per_entity',
    ]);
  });

  it.each([2, 3, 10])('accepts minimum_query_length %s', async (value) => {
    await expect(validator().validate(input('admin_search.minimum_query_length', value))).resolves.toBeUndefined();
  });

  it.each([1, 11, 2.5, '3'])('refuses minimum_query_length %j', async (value) => {
    const error = await refusal(validator().validate(input('admin_search.minimum_query_length', value)));
    expect(error.code).toBe('VALIDATION_FAILED');
  });

  it.each([1, 10])('accepts results_per_entity %s', async (value) => {
    await expect(validator().validate(input('admin_search.results_per_entity', value))).resolves.toBeUndefined();
  });

  it.each([0, 11, 1.5])('refuses results_per_entity %j', async (value) => {
    const error = await refusal(validator().validate(input('admin_search.results_per_entity', value)));
    expect(error.code).toBe('VALIDATION_FAILED');
  });

  it('refuses a malformed entity_fields value', async () => {
    const error = await refusal(validator().validate(input('admin_search.entity_fields', { version: 2 })));
    expect(error.code).toBe('VALIDATION_FAILED');
  });

  it('refuses a not-offered field, duplicates and an enabled type with no field, with details', async () => {
    const error = await refusal(
      validator().validate(
        input('admin_search.entity_fields', {
          version: 1,
          entities: { 'orders.order': { enabled: true, fields: ['number', 'number', 'gone'] } },
        }),
      ),
    );
    expect(error.statusCode).toBe(422);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details).toHaveLength(2);
    const empty = await refusal(
      validator().validate(
        input('admin_search.entity_fields', { version: 1, entities: { 'orders.order': { enabled: true, fields: [] } } }),
      ),
    );
    expect(empty.code).toBe('VALIDATION_FAILED');
  });

  it("accepts an absent provider's entry", async () => {
    await expect(
      validator((id) => id !== 'orders').validate(
        input('admin_search.entity_fields', {
          version: 1,
          entities: { 'orders.order': { enabled: true, fields: ['anything'] } },
        }),
      ),
    ).resolves.toBeUndefined();
  });
});
