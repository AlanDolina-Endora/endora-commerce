import type { EntityManager } from '@mikro-orm/postgresql';
import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_POLICY,
  type AttemptCounterStore,
  type AttemptPolicy,
  type AuditPort,
  type PlatformLogger,
} from '@endora-commerce/platform/kernel';
import { CustomerAccount } from '../entities/customer-account.entity.js';
import {
  CUSTOMER_DEVICE_POLICY,
  CUSTOMER_PASSWORD_POLICY,
  CUSTOMER_RESET_REQUEST_POLICY,
  CustomerAuthenticationThrottle,
} from './customer-authentication-throttle.js';

/**
 * The customer profile over the platform's attempt throttle: which counters a
 * customer attempt is held to, what a refusal says and what is recorded. The
 * counting itself runs inside Redis and is asserted through the real routes in
 * `backend/test/integration/customer_accounts/customer-sign-in-throttle.test.ts`.
 */
type Script = 'take' | 'fail' | 'release';

interface Call {
  script: Script;
  keys: string[];
  args: string[];
}

function scriptOf(source: string): Script {
  if (source.includes('ZADD')) return 'take';
  return source.includes('mask') ? 'fail' : 'release';
}

interface Account {
  id: string;
  email: string;
  passwordHash: string;
  deletedAt: Date | null;
  blockedAt: Date | null;
}

const BUYER: Account = {
  id: 'c-1',
  email: 'buyer@example.test',
  passwordHash: '$argon2id$stored-hash',
  deletedAt: null,
  blockedAt: null,
};

function harness(
  answers: { take?: [number, number]; fail?: [number, number] } = {},
  initial: Account | null = BUYER,
): {
  throttle: CustomerAuthenticationThrottle;
  calls: () => Call[];
  audits: () => Array<Record<string, unknown>>;
  warnings: () => object[];
  setAccount: (next: Account | null) => void;
} {
  const calls: Call[] = [];
  const audits: Array<Record<string, unknown>> = [];
  const warnings: object[] = [];
  let account = initial;
  const redis: AttemptCounterStore = {
    eval: async (source, numberOfKeys, ...rest) => {
      const script = scriptOf(source);
      calls.push({ script, keys: rest.slice(0, numberOfKeys), args: rest.slice(numberOfKeys) });
      if (script === 'take') return answers.take ?? [1, 0];
      if (script === 'fail') return answers.fail ?? [0, 0];
      return 1;
    },
    scan: async () => ['0', []],
    del: async (...keys) => keys.length,
  };
  const em = {
    findOne: async (entity: unknown, where: Record<string, unknown>) => {
      if (entity !== CustomerAccount) throw new Error('unexpected entity');
      if (account === null || where['id'] !== account.id) return null;
      if (where['deletedAt'] === null && account.deletedAt !== null) return null;
      return account;
    },
  } as unknown as EntityManager;
  const log: PlatformLogger = {
    info: () => undefined,
    warn: (obj) => {
      warnings.push(obj);
    },
    error: () => undefined,
  };
  return {
    throttle: new CustomerAuthenticationThrottle({
      redis,
      emFactory: () => em,
      auditLog: {
        record: async (input: Record<string, unknown>) => {
          audits.push(input);
        },
      } as unknown as AuditPort,
      log,
      now: () => 1_000_000,
    }),
    calls: () => calls,
    audits: () => audits,
    warnings: () => warnings,
    setAccount: (next) => {
      account = next;
    },
  };
}

const policyArgs = (policy: AttemptPolicy): string[] => [
  String(policy.threshold),
  String(policy.windowSeconds * 1000),
  String(policy.baseDelaySeconds * 1000),
  String(policy.maxDelaySeconds * 1000),
];

/** The suffix of each counter key a take named, and the policy arguments it passed. */
function takeOf(calls: Call[]): { counters: string[]; policies: string[] } {
  const take = calls.find((call) => call.script === 'take')!;
  return {
    counters: take.keys.filter((_, index) => index % 2 === 0).map((key) => key.split('}:')[1]!),
    policies: take.args.slice(3),
  };
}

describe('CustomerAuthenticationThrottle — the counters a customer attempt is held to', () => {
  it('holds a stranger’s password to the account counter alone, whatever address it reports', async () => {
    const h = harness();
    await h.throttle.verify(
      { factor: 'password', account: 'buyer@example.test' },
      async () => ({ ok: false }),
    );
    // The contract's attempt has no address; a caller that slips one through
    // structurally must not get a per-address counter out of it.
    await h.throttle.verify(
      { factor: 'password', account: 'buyer@example.test', ip: '203.0.113.9' } as never,
      async () => ({ ok: false }),
    );

    const takes = h.calls().filter((call) => call.script === 'take');
    expect(takes).toHaveLength(2);
    for (const take of takes) {
      expect(take.keys).toHaveLength(2);
      expect(take.keys[0]).toMatch(/^customer-auth-throttle:v1:password:\{[0-9a-f]{64}\}:account$/);
      expect(take.keys.join(' ')).not.toContain('buyer@example.test');
      expect(take.args.slice(3)).toEqual(policyArgs(CUSTOMER_PASSWORD_POLICY));
    }
  });

  it('keys a second factor by the account id, with the administrator account budget', async () => {
    const h = harness();
    await h.throttle.verify({ factor: 'second_factor', account: 'c-1' }, async () => ({ ok: false }));
    const { counters, policies } = takeOf(h.calls());
    expect(counters).toEqual(['account']);
    expect(h.calls()[0]!.keys[0]).toMatch(/^customer-auth-throttle:v1:second_factor:/);
    expect(policies).toEqual(policyArgs(ACCOUNT_POLICY));
  });

  it('counts reset requests per address with their own, slower budget', async () => {
    const h = harness();
    await h.throttle.verify(
      { factor: 'password_reset', account: 'buyer@example.test' },
      async () => ({ ok: false }),
    );
    const { counters, policies } = takeOf(h.calls());
    expect(counters).toEqual(['account']);
    expect(policies).toEqual(policyArgs(CUSTOMER_RESET_REQUEST_POLICY));
  });

  it('holds a known device to its own counter, outside the account one', async () => {
    const h = harness();
    const knownDevice = (await h.throttle.issueKnownDevice('c-1'))!;
    await h.throttle.verify(
      { factor: 'password', account: 'buyer@example.test', knownDevice },
      async () => ({ ok: false }),
    );
    const { counters, policies } = takeOf(h.calls());
    expect(counters).toHaveLength(1);
    expect(counters[0]).toMatch(/^device:[0-9a-f]{64}$/);
    expect(policies).toEqual(policyArgs(CUSTOMER_DEVICE_POLICY));
  });

  it('recognises a known device on the second factor, keyed by the account id', async () => {
    const h = harness();
    const knownDevice = (await h.throttle.issueKnownDevice('c-1'))!;
    await h.throttle.verify(
      { factor: 'second_factor', account: 'c-1', knownDevice },
      async () => ({ ok: false }),
    );
    expect(takeOf(h.calls()).counters[0]).toMatch(/^device:/);
  });

  it('stops honouring a device once the password changes, and for a blocked or deleted account', async () => {
    const h = harness();
    const knownDevice = (await h.throttle.issueKnownDevice('c-1'))!;
    const attempt = { factor: 'password', account: 'buyer@example.test', knownDevice } as const;

    h.setAccount({ ...BUYER, passwordHash: '$argon2id$a-new-hash' });
    await h.throttle.verify(attempt, async () => ({ ok: false }));
    h.setAccount({ ...BUYER, blockedAt: new Date() });
    await h.throttle.verify(attempt, async () => ({ ok: false }));
    h.setAccount({ ...BUYER, deletedAt: new Date() });
    await h.throttle.verify(attempt, async () => ({ ok: false }));

    const takes = h.calls().filter((call) => call.script === 'take');
    expect(takes.map((take) => take.keys[0]!.split('}:')[1])).toEqual([
      'account',
      'account',
      'account',
    ]);
  });

  it('does not honour a device for another account', async () => {
    const h = harness();
    const knownDevice = (await h.throttle.issueKnownDevice('c-1'))!;
    await h.throttle.verify(
      { factor: 'password', account: 'someone-else@example.test', knownDevice },
      async () => ({ ok: false }),
    );
    expect(takeOf(h.calls()).counters).toEqual(['account']);
  });

  it('issues no device for a blocked account', async () => {
    const h = harness({}, { ...BUYER, blockedAt: new Date() });
    await expect(h.throttle.issueKnownDevice('c-1')).resolves.toBeNull();
  });
});

describe('CustomerAuthenticationThrottle — refusals and reports', () => {
  it('refuses with 429 CUSTOMER_AUTHENTICATION_THROTTLED and Retry-After, without running the check', async () => {
    const h = harness({ take: [0, 90_500] });
    let checked = false;
    await expect(
      h.throttle.verify({ factor: 'password', account: 'buyer@example.test' }, async () => {
        checked = true;
        return { ok: true };
      }),
    ).rejects.toMatchObject({
      statusCode: 429,
      code: 'CUSTOMER_AUTHENTICATION_THROTTLED',
      details: { retryAfterSeconds: 91 },
      headers: { 'Retry-After': '91' },
    });
    expect(checked).toBe(false);
  });

  it('records one customer audit row when a delay starts for a real account', async () => {
    const h = harness({ fail: [60_000, 1] });
    await h.throttle.verify(
      { factor: 'password', account: 'buyer@example.test' },
      async () => ({ ok: false, customerAccountId: 'c-1' }),
    );
    expect(h.audits()).toEqual([
      {
        action: 'customer_account.authentication_throttled',
        objectType: 'customer_account',
        objectId: 'c-1',
        stateAfter: { factor: 'password', scope: 'account', retryAfterSeconds: 60 },
      },
    ]);
    expect(h.warnings()).toEqual([
      {
        factor: 'password',
        scope: 'account',
        retryAfterSeconds: 60,
        accountKnown: true,
        customerAccountId: 'c-1',
      },
    ]);
  });

  it('only logs a delay for an address that belongs to nobody', async () => {
    const h = harness({ fail: [60_000, 1] });
    await h.throttle.verify(
      { factor: 'password', account: 'nobody@example.test' },
      async () => ({ ok: false }),
    );
    expect(h.audits()).toEqual([]);
    expect(h.warnings()).toHaveLength(1);
  });

  it('forgets the failures on a success', async () => {
    const h = harness();
    await expect(
      h.throttle.verify({ factor: 'password', account: 'buyer@example.test' }, async () => ({
        ok: true,
        customerAccountId: 'c-1',
      })),
    ).resolves.toBe(true);
    const release = h.calls().find((call) => call.script === 'release')!;
    expect(release.args.at(-1)).toBe('1');
  });

  it('answers 503 CUSTOMER_AUTHENTICATION_UNAVAILABLE when the store fails', async () => {
    const failing = new CustomerAuthenticationThrottle({
      redis: {
        eval: async () => {
          throw new Error('connection refused');
        },
        scan: async () => ['0', []],
        del: async () => 0,
      },
      emFactory: () => ({}) as EntityManager,
      auditLog: { record: async () => undefined } as unknown as AuditPort,
      log: { info: () => undefined, warn: () => undefined, error: () => undefined },
    });
    await expect(
      failing.verify({ factor: 'password', account: 'buyer@example.test' }, async () => ({
        ok: true,
      })),
    ).rejects.toMatchObject({ statusCode: 503, code: 'CUSTOMER_AUTHENTICATION_UNAVAILABLE' });
  });
});
