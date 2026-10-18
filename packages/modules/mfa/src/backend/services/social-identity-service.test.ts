/**
 * Federated sign-in resolves a provider identity to an account the way the
 * password sign-in does: a blocked customer account is refused, before any link
 * is written or any audit entry recorded, and the account's organisation travels
 * with the answer so the second-factor policy can be resolved for it.
 */
import type { EntityManager } from '@mikro-orm/postgresql';
import { describe, expect, it, vi } from 'vitest';
import type { AuditPort } from '@endora-commerce/platform/kernel';
import { SocialIdentityService, type SocialIdentityDeps } from './social-identity-service.js';
import type { OAuthIdentity } from './oauth-provider-service.js';

const IDENTITY: OAuthIdentity = {
  provider: 'google',
  sub: 'sub-1',
  email: 'buyer@example.com',
  emailVerified: true,
};

function harness(deps: Partial<SocialIdentityDeps>): {
  service: SocialIdentityService;
  persisted: unknown[];
  audited: unknown[];
} {
  const persisted: unknown[] = [];
  const audited: unknown[] = [];
  const em = {
    findOne: async () => null,
    create: (_entity: unknown, data: unknown) => data,
    persist: (row: unknown) => {
      persisted.push(row);
    },
    flush: async () => undefined,
  } as unknown as EntityManager;
  const audit = {
    record: async (entry: unknown) => {
      audited.push(entry);
    },
  } as unknown as AuditPort;
  const service = new SocialIdentityService(
    () => em,
    {
      resolveCustomerByEmail: async () => null,
      autoCreateCustomer: async () => null,
      resolveAdminByEmail: async () => null,
      ...deps,
    },
    audit,
  );
  return { service, persisted, audited };
}

describe('SocialIdentityService.signInCustomer', () => {
  it('refuses a blocked customer account and records no link', async () => {
    const autoCreateCustomer = vi.fn(async () => ({ id: 'other' }));
    const { service, persisted, audited } = harness({
      resolveCustomerByEmail: async () => ({ id: 'c1', organizationId: 'o1', blocked: true }),
      autoCreateCustomer,
    });

    expect(await service.signInCustomer(IDENTITY)).toEqual({ ok: false, reason: 'blocked' });
    expect(persisted).toEqual([]);
    expect(audited).toEqual([]);
    // A blocked account is an account: it is never answered by creating another.
    expect(autoCreateCustomer).not.toHaveBeenCalled();
  });

  it('signs in an active customer and answers with its organisation', async () => {
    const { service, persisted } = harness({
      resolveCustomerByEmail: async () => ({ id: 'c1', organizationId: 'o1', blocked: false }),
    });

    expect(await service.signInCustomer(IDENTITY)).toEqual({
      ok: true,
      subjectId: 'c1',
      organizationId: 'o1',
    });
    expect(persisted).toHaveLength(1);
  });

  it('answers an auto-created account with the organisation it was created in', async () => {
    const { service } = harness({
      autoCreateCustomer: async () => ({ id: 'c2', organizationId: 'o2' }),
    });

    expect(await service.signInCustomer(IDENTITY)).toEqual({
      ok: true,
      subjectId: 'c2',
      organizationId: 'o2',
    });
  });
});

describe('SocialIdentityService.signInAdmin', () => {
  it('answers with no organisation — administrators belong to none', async () => {
    const { service } = harness({ resolveAdminByEmail: async () => ({ id: 'a1' }) });
    expect(await service.signInAdmin(IDENTITY)).toEqual({
      ok: true,
      subjectId: 'a1',
      organizationId: null,
    });
  });
});
