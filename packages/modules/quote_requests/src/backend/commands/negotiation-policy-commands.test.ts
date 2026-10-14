import { describe, expect, it, vi } from 'vitest';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { CustomerAccountRecord, OrganizationRecord } from '@endora-commerce/contracts';
import type { CommandActor, CommandContext } from '@endora-commerce/platform/commands';
import { HttpError } from '@endora-commerce/platform/http';
import { QuoteRequestAccountPolicy } from '../entities/quote-request-account-policy.entity.js';
import { QuoteRequestOrgPolicy } from '../entities/quote-request-org-policy.entity.js';
import {
  makeSetAccountNegotiationCommand,
  makeSetOrganizationNegotiationCommand,
  type NegotiationCommandDeps,
} from './negotiation-policy-commands.js';

/**
 * Feature 146, Phase 10b (T063) — the two audited writes of the
 * price-negotiation lock (FR-026; research R12; threat model T2, T16).
 *
 * The Commands are exercised directly, without the bus: what the bus does with
 * `before` / `after` / `skipAudit` is its own test's subject
 * (`platform/src/commands/command-bus.test.ts`). What is this file's subject is
 * the order of things inside `run` — the authority step before any
 * read-for-write, a refusal that touches nothing — and the shape of what the
 * bus is handed to audit.
 */

const ORG = '00000000-0000-4000-8000-00000000a001';
const OTHER_ORG = '00000000-0000-4000-8000-00000000a002';
const ACCOUNT = '00000000-0000-4000-8000-00000000c001';
const REP = '00000000-0000-4000-8000-00000000b001';

const ADMIN: CommandActor = { actorAdminUserId: REP, impersonatedCustomerAccountId: null, kind: 'admin' };

type Row = Record<string, unknown>;

/**
 * A fake transactional `em` holding at most one row per policy table. Every
 * call is recorded in one shared log, so a test can assert what ran before
 * what — the authority ports write into the same log. The three bypass methods
 * throw: a write path that reached one of them is the T2 defect.
 */
function harness(
  rows: { organization?: Row | null; account?: Row | null } = {},
  options: {
    platformAdmin?: boolean;
    canSee?: (organizationId: string) => boolean;
    account?: Partial<CustomerAccountRecord> | null;
    member?: boolean;
    organizationExists?: boolean;
  } = {},
) {
  const log: string[] = [];
  const created: Row[] = [];
  const stored = {
    organization: rows.organization ?? null,
    account: rows.account ?? null,
  };
  const bypass = (name: string) =>
    vi.fn(() => {
      log.push(`em.${name}`);
      throw new Error(`em.${name} must never be called on a policy row (T2)`);
    });
  const emImpl = {
    findOne: vi.fn(async (entity: unknown) => {
      if (entity === QuoteRequestOrgPolicy) {
        log.push('em.findOne:organization');
        return stored.organization;
      }
      if (entity === QuoteRequestAccountPolicy) {
        log.push('em.findOne:account');
        return stored.account;
      }
      log.push('em.findOne:other');
      return null;
    }),
    create: vi.fn((entity: unknown, data: Row) => {
      log.push(entity === QuoteRequestOrgPolicy ? 'em.create:organization' : 'em.create:account');
      const row = { ...data, updatedAt: new Date('2026-10-14T10:00:00.000Z') };
      created.push(row);
      return row;
    }),
    persist: vi.fn(() => {
      log.push('em.persist');
    }),
    flush: vi.fn(async () => {
      log.push('em.flush');
    }),
    upsert: bypass('upsert'),
    nativeUpdate: bypass('nativeUpdate'),
    nativeInsert: bypass('nativeInsert'),
  };
  const em = emImpl as unknown as EntityManager;

  const accountRecord =
    options.account === null
      ? null
      : ({ id: ACCOUNT, organizationId: ORG, ...(options.account ?? {}) } as CustomerAccountRecord);
  const deps: NegotiationCommandDeps = {
    isPlatformAdmin: () => {
      log.push('isPlatformAdmin');
      return options.platformAdmin ?? false;
    },
    salesRepScope: {
      canSeeOrganization: vi.fn(async (adminUserId: string, organizationId: string) => {
        log.push(`canSeeOrganization:${adminUserId}:${organizationId}`);
        return options.canSee ? options.canSee(organizationId) : true;
      }),
    },
    customerAccounts: {
      findById: vi.fn(async (id: string) => {
        log.push(`findById:${id}`);
        return accountRecord && accountRecord.id === id ? accountRecord : null;
      }),
      findInOrganization: vi.fn(async (id: string, organizationId: string) => {
        log.push(`findInOrganization:${id}:${organizationId}`);
        if (options.member === false) return null;
        return accountRecord && accountRecord.id === id && accountRecord.organizationId === organizationId
          ? accountRecord
          : null;
      }),
    },
    organizations: {
      findById: vi.fn(async (id: string) => {
        log.push(`organizations.findById:${id}`);
        if (options.organizationExists === false) return null;
        return { id } as OrganizationRecord;
      }),
    },
  };
  const ctx = (actor: CommandActor = ADMIN): CommandContext => ({ em, actor });
  return { em: emImpl, deps, log, created, stored, ctx };
}

const isWrite = (entry: string) => entry.startsWith('em.') && entry !== 'em.findOne:other';
const firstWriteIndex = (log: string[]) => log.findIndex(isWrite);

async function expectNotFound(promise: Promise<unknown>): Promise<HttpError> {
  const error = await promise.then(
    () => {
      throw new Error('expected a refusal');
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(HttpError);
  expect((error as HttpError).statusCode).toBe(404);
  expect((error as HttpError).code).toBe('NOT_FOUND');
  return error as HttpError;
}

describe('quote_request_policy.organization.set (T063)', () => {
  it('declares the action, the object type and the object id the audit row carries', () => {
    const { deps } = harness();
    const command = makeSetOrganizationNegotiationCommand({ organizationId: ORG, priceProposalsAllowed: false }, deps);
    expect(command.action).toBe('quote_request_policy.organization.set');
    expect(command.objectType).toBe('organization');
    expect(command.objectId).toBe(ORG);
  });

  it('creates the row when none exists and records true → false', async () => {
    const h = harness();
    const command = makeSetOrganizationNegotiationCommand({ organizationId: ORG, priceProposalsAllowed: false }, h.deps);
    const outcome = await command.run(h.ctx());
    expect(outcome.skipAudit).toBeFalsy();
    expect(outcome.before).toEqual({ priceProposalsAllowed: true });
    expect(outcome.after).toEqual({ priceProposalsAllowed: false });
    expect(h.created).toEqual([expect.objectContaining({ organizationId: ORG, priceProposalsAllowed: false })]);
    expect(h.log).toContain('em.flush');
    expect(outcome.result).toMatchObject({ organizationId: ORG, priceProposalsAllowed: false });
    expect(outcome.result.updatedAt).toBeInstanceOf(Date);
  });

  it('assigns an existing row and records its old value', async () => {
    const row: Row = { organizationId: ORG, priceProposalsAllowed: false, updatedAt: new Date() };
    const h = harness({ organization: row });
    const command = makeSetOrganizationNegotiationCommand({ organizationId: ORG, priceProposalsAllowed: true }, h.deps);
    const outcome = await command.run(h.ctx());
    expect(outcome.before).toEqual({ priceProposalsAllowed: false });
    expect(outcome.after).toEqual({ priceProposalsAllowed: true });
    expect(row['priceProposalsAllowed']).toBe(true);
    expect(h.created).toEqual([]);
    expect(h.log).toContain('em.flush');
  });

  it('skips the audit and writes nothing when the value does not change — existing row or the default', async () => {
    const existing = harness({ organization: { organizationId: ORG, priceProposalsAllowed: false, updatedAt: new Date() } });
    const same = await makeSetOrganizationNegotiationCommand(
      { organizationId: ORG, priceProposalsAllowed: false },
      existing.deps,
    ).run(existing.ctx());
    expect(same.skipAudit).toBe(true);
    expect(existing.log).not.toContain('em.flush');

    // No row is "allowed": asking for "allowed" changes nothing, and creates no row.
    const absent = harness();
    const unchanged = await makeSetOrganizationNegotiationCommand(
      { organizationId: ORG, priceProposalsAllowed: true },
      absent.deps,
    ).run(absent.ctx());
    expect(unchanged.skipAudit).toBe(true);
    expect(absent.created).toEqual([]);
    expect(absent.log).not.toContain('em.flush');
    expect(unchanged.result).toEqual({ organizationId: ORG, priceProposalsAllowed: true, updatedAt: null });
  });

  it('asks canSeeOrganization for a non-platform admin before any read-for-write', async () => {
    const h = harness();
    await makeSetOrganizationNegotiationCommand({ organizationId: ORG, priceProposalsAllowed: false }, h.deps).run(h.ctx());
    const check = h.log.indexOf(`canSeeOrganization:${REP}:${ORG}`);
    expect(check).toBeGreaterThanOrEqual(0);
    expect(check).toBeLessThan(firstWriteIndex(h.log));
  });

  it('refuses an organization outside the representative’s scope with the unknown-id 404, touching nothing (T2, C1)', async () => {
    const h = harness({}, { canSee: (organizationId) => organizationId !== OTHER_ORG });
    const refused = await expectNotFound(
      makeSetOrganizationNegotiationCommand({ organizationId: OTHER_ORG, priceProposalsAllowed: false }, h.deps).run(
        h.ctx(),
      ),
    );
    expect(h.log.filter(isWrite)).toEqual([]);

    const unknown = harness({}, { organizationExists: false });
    const missing = await expectNotFound(
      makeSetOrganizationNegotiationCommand({ organizationId: ORG, priceProposalsAllowed: false }, unknown.deps).run(
        unknown.ctx(),
      ),
    );
    expect(unknown.log.filter(isWrite)).toEqual([]);
    expect(refused.message).toBe(missing.message);
    expect(refused.details).toEqual(missing.details);
  });

  it('lets a platform administrator through without the representative check', async () => {
    const h = harness({}, { platformAdmin: true, canSee: () => false });
    const outcome = await makeSetOrganizationNegotiationCommand(
      { organizationId: ORG, priceProposalsAllowed: false },
      h.deps,
    ).run(h.ctx());
    expect(outcome.after).toEqual({ priceProposalsAllowed: false });
    expect(h.deps.salesRepScope.canSeeOrganization).not.toHaveBeenCalled();
  });

  it('refuses an actor with no administrator id when the scope is not platform-wide', async () => {
    const h = harness();
    await expectNotFound(
      makeSetOrganizationNegotiationCommand({ organizationId: ORG, priceProposalsAllowed: false }, h.deps).run(
        h.ctx({ actorAdminUserId: null, impersonatedCustomerAccountId: null, kind: 'customer' }),
      ),
    );
    expect(h.log.filter(isWrite)).toEqual([]);
  });
});

describe('quote_request_policy.customer_account.set (T063)', () => {
  it('declares the action, the object type and the object id the audit row carries', () => {
    const { deps } = harness();
    const command = makeSetAccountNegotiationCommand({ customerAccountId: ACCOUNT, override: 'not_allowed' }, deps);
    expect(command.action).toBe('quote_request_policy.customer_account.set');
    expect(command.objectType).toBe('customer_account');
    expect(command.objectId).toBe(ACCOUNT);
  });

  it.each([
    ['allowed', true],
    ['not_allowed', false],
  ] as const)('creates the row for %s and records inherit → %s', async (override, stored) => {
    const h = harness();
    const outcome = await makeSetAccountNegotiationCommand({ customerAccountId: ACCOUNT, override }, h.deps).run(h.ctx());
    expect(outcome.before).toEqual({ override: 'inherit' });
    expect(outcome.after).toEqual({ override });
    expect(h.created).toEqual([expect.objectContaining({ customerAccountId: ACCOUNT, priceProposalsAllowed: stored })]);
    expect(outcome.result).toMatchObject({ customerAccountId: ACCOUNT, organizationId: ORG, override });
  });

  it('"as organization" keeps the row and writes null (the audit before/after is always a value)', async () => {
    const row: Row = { customerAccountId: ACCOUNT, priceProposalsAllowed: false, updatedAt: new Date() };
    const h = harness({ account: row });
    const outcome = await makeSetAccountNegotiationCommand({ customerAccountId: ACCOUNT, override: 'inherit' }, h.deps).run(
      h.ctx(),
    );
    expect(outcome.before).toEqual({ override: 'not_allowed' });
    expect(outcome.after).toEqual({ override: 'inherit' });
    expect(row['priceProposalsAllowed']).toBeNull();
    expect(h.created).toEqual([]);
    expect(h.log).toContain('em.flush');
  });

  it('skips the audit and writes nothing when the override does not change', async () => {
    const absent = harness();
    const inherit = await makeSetAccountNegotiationCommand(
      { customerAccountId: ACCOUNT, override: 'inherit' },
      absent.deps,
    ).run(absent.ctx());
    expect(inherit.skipAudit).toBe(true);
    expect(absent.created).toEqual([]);
    expect(absent.log).not.toContain('em.flush');

    const nullRow = harness({ account: { customerAccountId: ACCOUNT, priceProposalsAllowed: null, updatedAt: new Date() } });
    expect(
      (
        await makeSetAccountNegotiationCommand({ customerAccountId: ACCOUNT, override: 'inherit' }, nullRow.deps).run(
          nullRow.ctx(),
        )
      ).skipAudit,
    ).toBe(true);

    const allowed = harness({ account: { customerAccountId: ACCOUNT, priceProposalsAllowed: true, updatedAt: new Date() } });
    const same = await makeSetAccountNegotiationCommand(
      { customerAccountId: ACCOUNT, override: 'allowed' },
      allowed.deps,
    ).run(allowed.ctx());
    expect(same.skipAudit).toBe(true);
    expect(allowed.log).not.toContain('em.flush');
  });

  it('resolves the account, confirms membership of its current organization, then asks canSeeOrganization — all before any read-for-write', async () => {
    const h = harness({}, { account: { organizationId: OTHER_ORG } });
    await makeSetAccountNegotiationCommand({ customerAccountId: ACCOUNT, override: 'allowed' }, h.deps).run(h.ctx());
    const found = h.log.indexOf(`findById:${ACCOUNT}`);
    const member = h.log.indexOf(`findInOrganization:${ACCOUNT}:${OTHER_ORG}`);
    const scope = h.log.indexOf(`canSeeOrganization:${REP}:${OTHER_ORG}`);
    expect(found).toBeGreaterThanOrEqual(0);
    expect(member).toBeGreaterThan(found);
    expect(scope).toBeGreaterThan(member);
    expect(scope).toBeLessThan(firstWriteIndex(h.log));
  });

  it('refuses an unknown account, a non-member and an out-of-scope organization with one 404, touching nothing (T2, C1)', async () => {
    const unknown = harness({}, { account: null });
    const a = await expectNotFound(
      makeSetAccountNegotiationCommand({ customerAccountId: ACCOUNT, override: 'not_allowed' }, unknown.deps).run(
        unknown.ctx(),
      ),
    );
    expect(unknown.log.filter(isWrite)).toEqual([]);

    const notMember = harness({}, { member: false });
    const b = await expectNotFound(
      makeSetAccountNegotiationCommand({ customerAccountId: ACCOUNT, override: 'not_allowed' }, notMember.deps).run(
        notMember.ctx(),
      ),
    );
    expect(notMember.log.filter(isWrite)).toEqual([]);
    expect(notMember.deps.salesRepScope.canSeeOrganization).not.toHaveBeenCalled();

    const outOfScope = harness({}, { canSee: () => false });
    const c = await expectNotFound(
      makeSetAccountNegotiationCommand({ customerAccountId: ACCOUNT, override: 'not_allowed' }, outOfScope.deps).run(
        outOfScope.ctx(),
      ),
    );
    expect(outOfScope.log.filter(isWrite)).toEqual([]);

    expect(new Set([a.message, b.message, c.message]).size).toBe(1);
  });

  it('lets a platform administrator through without the representative check, membership still confirmed', async () => {
    const h = harness({}, { platformAdmin: true, canSee: () => false });
    await makeSetAccountNegotiationCommand({ customerAccountId: ACCOUNT, override: 'allowed' }, h.deps).run(h.ctx());
    expect(h.deps.salesRepScope.canSeeOrganization).not.toHaveBeenCalled();
    expect(h.deps.customerAccounts.findInOrganization).toHaveBeenCalledWith(ACCOUNT, ORG);
  });
});
