import { describe, expect, it, vi } from 'vitest';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { CustomerAccountReadPort, CustomerAccountRecord } from '@endora-commerce/contracts';
import { HttpError } from '@endora-commerce/platform/http';
import { getTenantContext } from '@endora-commerce/platform/tenancy';
import { QuoteRequestAccountPolicy } from '../entities/quote-request-account-policy.entity.js';
import { QuoteRequestOrgPolicy } from '../entities/quote-request-org-policy.entity.js';
import {
  carriesProposal,
  NEGOTIATION_LOCK_SCOPE_REASON,
  NegotiationPolicyService,
} from './negotiation-policy-service.js';

/**
 * Feature 146, Phase 10 (T062) — the request owner's effective
 * price-negotiation value and its enforcement (FR-020, FR-022, FR-037;
 * research R11; threat model T1, T4; analyze M3, M5).
 */

const ACCOUNT = 'acc-1';
const ORG = 'org-1';

interface Rows {
  account?: boolean | null | 'absent';
  organization?: boolean | 'absent';
}

/** A fake `em` holding at most one row per policy table, recording every read and the scope it ran in. */
function fakeEm(rows: Rows, options: { throwOn?: 'account' | 'organization' } = {}) {
  const reads: Array<{ entity: string; where: Record<string, unknown>; mode: string | undefined; reason: string | undefined }> = [];
  const findOne = vi.fn(async (entity: unknown, where: Record<string, unknown>) => {
    const ctx = getTenantContext();
    const name = entity === QuoteRequestAccountPolicy ? 'account' : entity === QuoteRequestOrgPolicy ? 'organization' : 'other';
    reads.push({
      entity: name,
      where,
      mode: ctx?.mode,
      reason: (ctx as { reason?: string } | undefined)?.reason,
    });
    if (options.throwOn === name) throw new Error(`${name} policy read failed (test)`);
    if (name === 'account') {
      if (rows.account === undefined || rows.account === 'absent') return null;
      if (where['customerAccountId'] !== ACCOUNT) return null;
      return { customerAccountId: ACCOUNT, priceProposalsAllowed: rows.account };
    }
    if (name === 'organization') {
      if (rows.organization === undefined || rows.organization === 'absent') return null;
      if (where['organizationId'] !== ORG) return null;
      return { organizationId: ORG, priceProposalsAllowed: rows.organization };
    }
    return null;
  });
  return { em: { findOne } as unknown as EntityManager, findOne, reads };
}

function accountsPort(organizationId: string | null = ORG, options: { throws?: boolean } = {}) {
  const seen: Array<{ mode: string | undefined }> = [];
  const findById = vi.fn(async (id: string): Promise<CustomerAccountRecord | null> => {
    seen.push({ mode: getTenantContext()?.mode });
    if (options.throws) throw new Error('customer account read failed (test)');
    if (organizationId === null || id !== ACCOUNT) return null;
    return { id, organizationId } as CustomerAccountRecord;
  });
  const port: Pick<CustomerAccountReadPort, 'findById'> = { findById };
  return { port, findById, seen };
}

describe('NegotiationPolicyService.effectiveFor (T062)', () => {
  it('answers "allowed" from the default when neither row exists', async () => {
    const { em } = fakeEm({});
    const service = new NegotiationPolicyService({ customerAccounts: accountsPort().port });
    expect(await service.effectiveFor(ACCOUNT, em)).toEqual({ allowed: true, source: 'default' });
  });

  it('answers the organization value when the account has no row', async () => {
    const { em } = fakeEm({ organization: false });
    const service = new NegotiationPolicyService({ customerAccounts: accountsPort().port });
    expect(await service.effectiveFor(ACCOUNT, em)).toEqual({ allowed: false, source: 'organization' });
  });

  it('a null account value inherits the organization value', async () => {
    const { em } = fakeEm({ account: null, organization: false });
    const service = new NegotiationPolicyService({ customerAccounts: accountsPort().port });
    expect(await service.effectiveFor(ACCOUNT, em)).toEqual({ allowed: false, source: 'organization' });
  });

  it('an account override wins over the organization value, both ways (US4 #7a, #7b)', async () => {
    const service = new NegotiationPolicyService({ customerAccounts: accountsPort().port });
    expect(await service.effectiveFor(ACCOUNT, fakeEm({ account: true, organization: false }).em)).toEqual({
      allowed: true,
      source: 'account',
    });
    expect(await service.effectiveFor(ACCOUNT, fakeEm({ account: false, organization: true }).em)).toEqual({
      allowed: false,
      source: 'account',
    });
  });

  it('reads each row by its exact primary key, the organization being the owner’s current one (M3)', async () => {
    const { em, reads } = fakeEm({ account: null, organization: true });
    const { port, findById } = accountsPort();
    await new NegotiationPolicyService({ customerAccounts: port }).effectiveFor(ACCOUNT, em);
    expect(findById).toHaveBeenCalledWith(ACCOUNT);
    expect(reads.map((r) => [r.entity, r.where])).toEqual([
      ['account', { customerAccountId: ACCOUNT }],
      ['organization', { organizationId: ORG }],
    ]);
  });

  it('runs every read inside withSystemScope with the documented reason (T1)', async () => {
    const { em, reads } = fakeEm({ account: null, organization: true });
    const accounts = accountsPort();
    await new NegotiationPolicyService({ customerAccounts: accounts.port }).effectiveFor(ACCOUNT, em);
    expect(NEGOTIATION_LOCK_SCOPE_REASON).toBe(
      'quote_requests: negotiation lock for the request owner, read by primary key after the caller authorised the request',
    );
    expect(reads).toHaveLength(2);
    for (const read of reads) {
      expect(read.mode).toBe('system');
      expect(read.reason).toBe(NEGOTIATION_LOCK_SCOPE_REASON);
    }
    expect(accounts.seen).toEqual([{ mode: 'system' }]);
  });

  it('an owner whose account cannot be found fails rather than reading as "allowed"', async () => {
    const { em } = fakeEm({ organization: false });
    const service = new NegotiationPolicyService({ customerAccounts: accountsPort(null).port });
    await expect(service.effectiveFor(ACCOUNT, em)).rejects.toThrow();
  });

  it.each(['account', 'organization'] as const)('a %s policy read that throws propagates (M5)', async (which) => {
    const { em } = fakeEm({ organization: false }, { throwOn: which });
    const service = new NegotiationPolicyService({ customerAccounts: accountsPort().port });
    await expect(service.effectiveFor(ACCOUNT, em)).rejects.toThrow(`${which} policy read failed (test)`);
  });

  it('an account read that throws propagates (M5)', async () => {
    const { em } = fakeEm({ organization: true });
    const service = new NegotiationPolicyService({ customerAccounts: accountsPort(ORG, { throws: true }).port });
    await expect(service.effectiveFor(ACCOUNT, em)).rejects.toThrow('customer account read failed (test)');
  });
});

describe('carriesProposal (T4)', () => {
  it('is true for any line whose desiredUnitPrice is not undefined, zero included', () => {
    expect(carriesProposal([{ desiredUnitPrice: 0 }])).toBe(true);
    expect(carriesProposal([{}, { desiredUnitPrice: 12.5 }])).toBe(true);
    expect(carriesProposal([{}, { desiredUnitPrice: undefined }])).toBe(false);
    expect(carriesProposal([])).toBe(false);
    expect(carriesProposal(undefined)).toBe(false);
  });
});

describe('NegotiationPolicyService.assertProposalsAllowed (T062)', () => {
  it('reads nothing when no line carries a proposal, even for a locked owner', async () => {
    const { em, findOne } = fakeEm({ organization: false });
    const accounts = accountsPort();
    const service = new NegotiationPolicyService({ customerAccounts: accounts.port });
    await expect(service.assertProposalsAllowed(ACCOUNT, [{}, {}], em)).resolves.toBeUndefined();
    expect(findOne).not.toHaveBeenCalled();
    expect(accounts.findById).not.toHaveBeenCalled();
  });

  it('refuses a locked owner with 422 RFQ_PRICE_PROPOSAL_NOT_ALLOWED', async () => {
    const { em } = fakeEm({ organization: false });
    const service = new NegotiationPolicyService({ customerAccounts: accountsPort().port });
    const refusal = await service
      .assertProposalsAllowed(ACCOUNT, [{}, { desiredUnitPrice: 10 }], em)
      .catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(HttpError);
    expect((refusal as HttpError).statusCode).toBe(422);
    expect((refusal as HttpError).code).toBe('RFQ_PRICE_PROPOSAL_NOT_ALLOWED');
  });

  it('counts desiredUnitPrice: 0 as a proposal (T4)', async () => {
    const { em } = fakeEm({ account: false });
    const service = new NegotiationPolicyService({ customerAccounts: accountsPort().port });
    await expect(service.assertProposalsAllowed(ACCOUNT, [{ desiredUnitPrice: 0 }], em)).rejects.toMatchObject({
      statusCode: 422,
      code: 'RFQ_PRICE_PROPOSAL_NOT_ALLOWED',
    });
  });

  it('lets a proposal through for an allowed owner', async () => {
    const { em } = fakeEm({ account: true, organization: false });
    const service = new NegotiationPolicyService({ customerAccounts: accountsPort().port });
    await expect(service.assertProposalsAllowed(ACCOUNT, [{ desiredUnitPrice: 5 }], em)).resolves.toBeUndefined();
  });

  it('a read that throws propagates — never "allowed" (M5)', async () => {
    const { em } = fakeEm({}, { throwOn: 'account' });
    const service = new NegotiationPolicyService({ customerAccounts: accountsPort().port });
    await expect(service.assertProposalsAllowed(ACCOUNT, [{ desiredUnitPrice: 5 }], em)).rejects.toThrow(
      'account policy read failed (test)',
    );
  });
});
