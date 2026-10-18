import type { EntityManager } from '@mikro-orm/postgresql';
import { describe, expect, it } from 'vitest';
import { ApiKeyService, type ApiKeyBindingPorts } from './api-key-service.js';

/**
 * An API key acts with the scopes it is issued, so issuing one hands those
 * scopes out. An administrator may therefore issue a key only with scopes their
 * own role holds; a holder of the wildcard may issue any.
 */

function serviceWithStore(): { service: ApiKeyService; persisted: unknown[] } {
  const persisted: unknown[] = [];
  const em = {
    create: (_entity: unknown, data: Record<string, unknown>) => ({ id: 'key-1', ...data }),
    persist: (row: unknown) => {
      persisted.push(row);
    },
    flush: async () => undefined,
  } as unknown as EntityManager;
  const service = new ApiKeyService(() => em, {} as ApiKeyBindingPorts);
  return { service, persisted };
}

describe('ApiKeyService.create — the scopes an administrator may issue', () => {
  it('issues a key with scopes the administrator holds', async () => {
    const { service, persisted } = serviceWithStore();

    const { apiKey } = await service.create({
      name: 'pim',
      scopes: ['catalog:read'],
      grantorPermissions: ['integrations:manage', 'catalog:read'],
    });

    expect(apiKey.scopes).toEqual(['catalog:read']);
    expect(persisted).toHaveLength(1);
  });

  it('refuses a scope the administrator does not hold, naming it', async () => {
    const { service, persisted } = serviceWithStore();

    await expect(
      service.create({
        name: 'pim',
        scopes: ['catalog:read', 'catalog:write'],
        grantorPermissions: ['integrations:manage', 'catalog:read'],
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'API_KEY_SCOPE_NOT_HELD',
      details: { scopes: 'catalog:write' },
    });
    expect(persisted).toEqual([]);
  });

  it('refuses before any binding is looked up', async () => {
    const { service } = serviceWithStore();

    await expect(
      service.create({
        name: 'distributor',
        scopes: ['orders:read', 'orders:write'],
        binding: {
          organizationId: '00000000-0000-4000-8000-0000000000aa',
          salesChannelId: '00000000-0000-4000-8000-0000000000ab',
          customerAccountId: '00000000-0000-4000-8000-0000000000ac',
        },
        grantorPermissions: ['integrations:manage'],
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'API_KEY_SCOPE_NOT_HELD',
      details: { scopes: 'orders:read, orders:write' },
    });
  });

  it('lets a holder of the wildcard issue any scope', async () => {
    const { service } = serviceWithStore();

    const { apiKey } = await service.create({
      name: 'pim',
      scopes: ['catalog:read', 'catalog:write'],
      grantorPermissions: ['*'],
    });

    expect(apiKey.scopes).toEqual(['catalog:read', 'catalog:write']);
  });
});
