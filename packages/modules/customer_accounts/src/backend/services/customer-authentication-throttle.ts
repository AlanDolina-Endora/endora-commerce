import type { EntityManager } from '@mikro-orm/postgresql';
import {
  ERROR_CODES,
  type CustomerAuthenticationAttempt,
  type CustomerAuthenticationCheckResult,
  type CustomerAuthenticationThrottlePort,
} from '@endora-commerce/contracts';
import {
  ACCOUNT_POLICY,
  AuthenticationAttemptThrottle,
  type AttemptCounterStore,
  type AttemptPolicy,
  type AttemptThrottleProfile,
  type AuditPort,
  type PlatformLogger,
} from '@endora-commerce/platform/kernel';
import { withSystemScope } from '@endora-commerce/platform/tenancy';
import { CustomerAccount } from '../entities/customer-account.entity.js';

/**
 * The throttle on repeated wrong customer passwords, wrong customer
 * second-factor codes and repeated password-reset requests.
 *
 * The counting is the platform's `AuthenticationAttemptThrottle`, the one the
 * administrator sign-in uses; this file is the customer **profile** over it.
 *
 * ## No address counter
 *
 * The storefront signs a shopper in from a server action: a request from the
 * storefront's own server, which carries no client address the backend could
 * trust. Every shopper therefore reaches the backend from one address, and a
 * per-address counter would let one shopper's typos hold up every other. So an
 * attempt from a device nobody has signed in from is held to the **account**
 * counter alone, and an attempt from a known device to **that device's own**.
 *
 * The known device is what keeps a stranger who knows a shopper's e-mail
 * address from keeping them out: a completed sign-in leaves the signed
 * `CUSTOMER_KNOWN_DEVICE_COOKIE_NAME` cookie, the storefront carries it both
 * ways, and an attempt that presents it is neither counted in nor refused by
 * the account counter. The value is bound to the account's password hash, so a
 * password change or a reset revokes every device at once, and a blocked or
 * deleted account has no known devices.
 *
 * ## The numbers
 *
 * | Factor | Account counter | Known device |
 * | --- | --- | --- |
 * | `password` | {@link CUSTOMER_PASSWORD_POLICY} — 50 per 30 minutes | {@link CUSTOMER_DEVICE_POLICY} — 10 |
 * | `second_factor` | `ACCOUNT_POLICY` — 20 per 30 minutes, the administrator one | 10 |
 * | `password_reset` | {@link CUSTOMER_RESET_REQUEST_POLICY} — 5 per hour | 10 |
 *
 * A password allows more than an administrator's twenty because the account
 * counter is the only one a first-time device meets, and a shopper on a new
 * phone mistypes. A six-digit code is a small space, so the second factor keeps
 * the administrator number. A reset request is not a guess at all: every one is
 * counted, none is "successful", and the limit only stops one address being
 * sent a stream of e-mails.
 *
 * Constants, not Settings, for the reason the administrator profile gives: a
 * Setting would be a switch that turns the protection off.
 */

/** A shopper's passwords, from every device that is not known. */
export const CUSTOMER_PASSWORD_POLICY: AttemptPolicy = {
  threshold: 50,
  windowSeconds: 30 * 60,
  baseDelaySeconds: 60,
  maxDelaySeconds: 15 * 60,
};

/** One known device on its own account, for every factor. */
export const CUSTOMER_DEVICE_POLICY: AttemptPolicy = {
  threshold: 10,
  windowSeconds: 30 * 60,
  baseDelaySeconds: 60,
  maxDelaySeconds: 15 * 60,
};

/** Password-reset requests for one e-mail address, from every device that is not known. */
export const CUSTOMER_RESET_REQUEST_POLICY: AttemptPolicy = {
  threshold: 5,
  windowSeconds: 60 * 60,
  baseDelaySeconds: 15 * 60,
  maxDelaySeconds: 60 * 60,
};

export const CUSTOMER_THROTTLE_PROFILE: AttemptThrottleProfile = {
  keyPrefix: 'customer-auth-throttle:v1:',
  factors: { password: 'email', second_factor: 'subject', password_reset: 'email' },
  countAddress: false,
  throttled: {
    code: ERROR_CODES.CUSTOMER_AUTHENTICATION_THROTTLED,
    message: 'Too many unsuccessful attempts for this account. Wait before trying again.',
  },
  unavailable: {
    code: ERROR_CODES.CUSTOMER_AUTHENTICATION_UNAVAILABLE,
    message: 'Sign-in is temporarily unavailable. Try again in a moment.',
  },
  objectType: 'customer_account',
  subjectLogKey: 'customerAccountId',
  auditActions: {
    throttled: 'customer_account.authentication_throttled',
    cleared: 'customer_account.authentication_throttle_cleared',
  },
  logMessages: {
    subject: 'customer authentication throttle',
    throttled: 'customer authentication throttled after repeated unsuccessful attempts',
    cleared: 'customer authentication throttle cleared by an operator',
  },
};

export interface CustomerAuthenticationThrottleOptions {
  readonly redis: AttemptCounterStore;
  readonly auditLog: AuditPort;
  readonly log: PlatformLogger;
  readonly emFactory: () => EntityManager;
  readonly now?: () => number;
  readonly storeDeadlineMs?: number;
}

/**
 * The customer throttle. The one instance is shared by the sign-in, the reset
 * request and — through `customerAuthenticationThrottlePort` — `mfa`'s
 * second-factor checks, so there is one set of counters whichever module took
 * the attempt.
 */
export class CustomerAuthenticationThrottle implements CustomerAuthenticationThrottlePort {
  private readonly engine: AuthenticationAttemptThrottle;

  constructor(options: CustomerAuthenticationThrottleOptions) {
    this.engine = new AuthenticationAttemptThrottle({
      profile: CUSTOMER_THROTTLE_PROFILE,
      redis: options.redis,
      auditLog: options.auditLog,
      log: options.log,
      accountPolicy: CUSTOMER_PASSWORD_POLICY,
      devicePolicy: CUSTOMER_DEVICE_POLICY,
      factorAccountPolicies: {
        second_factor: ACCOUNT_POLICY,
        password_reset: CUSTOMER_RESET_REQUEST_POLICY,
      },
      // Read only for a known-device value whose signature a route has
      // verified, and when one is minted. Identity is resolved before any
      // tenant context exists, so the read is system-scoped, as the session
      // hook's organisation lookup is. A blocked or deleted account answers
      // `null`, which is what stops its devices being known.
      credentialOf: (customerAccountId) =>
        withSystemScope('customer_accounts: known-device check', async () => {
          const customer = await options.emFactory().findOne(CustomerAccount, {
            id: customerAccountId,
            deletedAt: null,
          });
          if (!customer || customer.blockedAt) return null;
          return {
            subjectId: customer.id,
            email: customer.email,
            passwordHash: customer.passwordHash,
          };
        }),
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.storeDeadlineMs === undefined ? {} : { storeDeadlineMs: options.storeDeadlineMs }),
    });
  }

  verify(
    attempt: CustomerAuthenticationAttempt,
    check: () => Promise<CustomerAuthenticationCheckResult>,
  ): Promise<boolean> {
    return this.engine.verify(attempt, async () => {
      const result = await check();
      return result.customerAccountId === undefined
        ? { ok: result.ok }
        : { ok: result.ok, subjectId: result.customerAccountId };
    });
  }

  issueKnownDevice(customerAccountId: string): Promise<string | null> {
    return this.engine.issueKnownDevice(customerAccountId);
  }
}
