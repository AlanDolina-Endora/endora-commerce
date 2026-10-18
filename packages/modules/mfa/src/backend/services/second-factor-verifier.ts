import type {
  AdminAuthenticationOrigin,
  AdminAuthenticationThrottlePort,
  CustomerAuthenticationThrottlePort,
  MfaSubjectRef,
} from '@endora-commerce/contracts';

/** What a second-factor check answers: whether it matched, and which factor did. */
export interface SecondFactorResult {
  ok: boolean;
  factor?: 'totp' | 'recovery';
}

/**
 * Verify a TOTP or recovery code for a subject. `context` says where the
 * request came from, when the caller knows.
 */
export type SecondFactorVerifier = (
  subject: MfaSubjectRef,
  code: string,
  context?: AdminAuthenticationOrigin,
) => Promise<SecondFactorResult>;

/**
 * The second-factor check every route in this module goes through.
 *
 * Every code runs inside the authentication throttle of the account's owner,
 * keyed by the account id: `admin_users`' for an administrator,
 * `customer_accounts`' for a customer. A six-digit code is a small space, and
 * the five-code budget of one sign-in challenge did not bound guessing on its
 * own: a new challenge, with a new budget, costs one more password request.
 * While a delay is running the call rejects with 429 — `ADMIN_` or
 * `CUSTOMER_AUTHENTICATION_THROTTLED` — and the code is not looked at.
 *
 * The customer throttle does not count the client address — the storefront
 * signs shoppers in from its own server — so a customer attempt carries only
 * the known-device value.
 */
export function createSecondFactorVerifier(
  verify: (subject: MfaSubjectRef, code: string) => Promise<SecondFactorResult>,
  adminThrottle: Pick<AdminAuthenticationThrottlePort, 'verify'>,
  customerThrottle: Pick<CustomerAuthenticationThrottlePort, 'verify'>,
): SecondFactorVerifier {
  return async (subject, code, context) => {
    let result: SecondFactorResult = { ok: false };
    if (subject.subjectType === 'customer') {
      await customerThrottle.verify(
        {
          factor: 'second_factor',
          account: subject.subjectId,
          ...(context?.knownDevice !== undefined ? { knownDevice: context.knownDevice } : {}),
        },
        async () => {
          result = await verify(subject, code);
          return { ok: result.ok, customerAccountId: subject.subjectId };
        },
      );
      return result;
    }
    await adminThrottle.verify(
      {
        factor: 'second_factor',
        account: subject.subjectId,
        ...(context?.ip !== undefined ? { ip: context.ip } : {}),
        ...(context?.knownDevice !== undefined ? { knownDevice: context.knownDevice } : {}),
      },
      async () => {
        result = await verify(subject, code);
        return { ok: result.ok, adminUserId: subject.subjectId };
      },
    );
    return result;
  };
}
