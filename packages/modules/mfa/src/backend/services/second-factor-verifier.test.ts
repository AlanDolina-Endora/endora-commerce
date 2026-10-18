import { describe, expect, it } from 'vitest';
import type {
  AdminAuthenticationAttempt,
  AdminAuthenticationThrottlePort,
  CustomerAuthenticationAttempt,
  CustomerAuthenticationThrottlePort,
} from '@endora-commerce/contracts';
import { createSecondFactorVerifier } from './second-factor-verifier.js';

function recordingThrottle(): {
  throttle: Pick<AdminAuthenticationThrottlePort, 'verify'>;
  attempts: () => AdminAuthenticationAttempt[];
  results: () => unknown[];
} {
  const attempts: AdminAuthenticationAttempt[] = [];
  const results: unknown[] = [];
  return {
    throttle: {
      verify: async (attempt, check) => {
        attempts.push(attempt);
        const result = await check();
        results.push(result);
        return result.ok;
      },
    },
    attempts: () => attempts,
    results: () => results,
  };
}

function recordingCustomerThrottle(): {
  throttle: Pick<CustomerAuthenticationThrottlePort, 'verify'>;
  attempts: () => CustomerAuthenticationAttempt[];
  results: () => unknown[];
} {
  const attempts: CustomerAuthenticationAttempt[] = [];
  const results: unknown[] = [];
  return {
    throttle: {
      verify: async (attempt, check) => {
        attempts.push(attempt);
        const result = await check();
        results.push(result);
        return result.ok;
      },
    },
    attempts: () => attempts,
    results: () => results,
  };
}

/** A customer throttle that must not be reached. */
const UNUSED_CUSTOMER_THROTTLE: Pick<CustomerAuthenticationThrottlePort, 'verify'> = {
  verify: async () => {
    throw new Error('the customer throttle was asked about an administrator code');
  },
};

describe('createSecondFactorVerifier', () => {
  it('checks an administrator code inside the throttle, keyed by the administrator id', async () => {
    const { throttle, attempts, results } = recordingThrottle();
    const verify = createSecondFactorVerifier(
      async () => ({ ok: true, factor: 'recovery' as const }),
      throttle,
      UNUSED_CUSTOMER_THROTTLE,
    );

    const result = await verify({ subjectType: 'admin', subjectId: 'a-1' }, '123456', {
      ip: '203.0.113.9',
      knownDevice: 'v1.a-1.device.stamp',
    });

    expect(result).toEqual({ ok: true, factor: 'recovery' });
    expect(attempts()).toEqual([
      {
        factor: 'second_factor',
        account: 'a-1',
        ip: '203.0.113.9',
        knownDevice: 'v1.a-1.device.stamp',
      },
    ]);
    expect(results()).toEqual([{ ok: true, adminUserId: 'a-1' }]);
  });

  it('answers the failed check, which the throttle has counted', async () => {
    const { throttle, results } = recordingThrottle();
    const verify = createSecondFactorVerifier(
      async () => ({ ok: false }),
      throttle,
      UNUSED_CUSTOMER_THROTTLE,
    );

    await expect(verify({ subjectType: 'admin', subjectId: 'a-1' }, '000000')).resolves.toEqual({
      ok: false,
    });
    expect(results()).toEqual([{ ok: false, adminUserId: 'a-1' }]);
  });

  it('passes the refusal on without looking at the code', async () => {
    const refusal = new Error('throttled');
    let looked = false;
    const verify = createSecondFactorVerifier(
      async () => {
        looked = true;
        return { ok: true };
      },
      {
        verify: async () => {
          throw refusal;
        },
      },
      UNUSED_CUSTOMER_THROTTLE,
    );

    await expect(verify({ subjectType: 'admin', subjectId: 'a-1' }, '123456')).rejects.toBe(refusal);
    expect(looked).toBe(false);
  });

  it('checks a customer code inside the customer throttle, keyed by the account id, without the address', async () => {
    const admin = recordingThrottle();
    const customer = recordingCustomerThrottle();
    const verify = createSecondFactorVerifier(
      async () => ({ ok: true, factor: 'totp' as const }),
      admin.throttle,
      customer.throttle,
    );

    await expect(
      verify({ subjectType: 'customer', subjectId: 'c-1' }, '123456', {
        ip: '203.0.113.9',
        knownDevice: 'v1.c-1.device.stamp',
      }),
    ).resolves.toEqual({ ok: true, factor: 'totp' });
    expect(admin.attempts()).toEqual([]);
    expect(customer.attempts()).toEqual([
      { factor: 'second_factor', account: 'c-1', knownDevice: 'v1.c-1.device.stamp' },
    ]);
    expect(customer.results()).toEqual([{ ok: true, customerAccountId: 'c-1' }]);
  });

  it('passes a customer refusal on without looking at the code', async () => {
    const refusal = new Error('throttled');
    let looked = false;
    const verify = createSecondFactorVerifier(
      async () => {
        looked = true;
        return { ok: true };
      },
      recordingThrottle().throttle,
      {
        verify: async () => {
          throw refusal;
        },
      },
    );

    await expect(verify({ subjectType: 'customer', subjectId: 'c-1' }, '123456')).rejects.toBe(
      refusal,
    );
    expect(looked).toBe(false);
  });
});
