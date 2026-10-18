import {
  ERROR_CODES,
  type AdminAuthenticationAttempt,
  type AdminAuthenticationCheckResult,
  type AdminAuthenticationThrottlePort,
} from '@endora-commerce/contracts';
import {
  AuthenticationAttemptThrottle,
  type AttemptCounterStore,
  type AttemptPolicy,
  type AttemptThrottleProfile,
  type AuditPort,
  type PlatformLogger,
} from '@endora-commerce/platform/kernel';

/**
 * Throttles repeated wrong passwords and wrong second-factor codes for an
 * administrator account.
 *
 * The counting is the platform's `AuthenticationAttemptThrottle`, which carries
 * the full account of what is counted, when a delay starts, why a known device
 * is exempt from the account counter and what happens while Redis is away. This
 * file is the administrator **profile** over it: the key prefix, the codes, the
 * audit actions, an address counter beside the account one, and the
 * instance-level opt-out below. Nothing here changed when the mechanism moved
 * to the platform — the keys, the cookie values and the answers are the ones
 * this module produced before.
 *
 * ## The numbers are constants, not Settings
 *
 * The comparable limits in the tree are constants too — the second step's
 * five-code budget and its challenge lifetime in `mfa`. A Setting here would be
 * a switch that turns the protection off from the Admin UI it protects.
 */
export {
  ABANDONED_AFTER_SECONDS,
  ACCOUNT_POLICY,
  ADDRESS_POLICY,
  DEFAULT_STORE_DEADLINE_MS,
  addressOrigin,
  type AttemptCounterStore,
  type AttemptPolicy,
} from '@endora-commerce/platform/kernel';

/** The administrator profile: what keys, codes, audit rows and log lines read. */
export const ADMIN_THROTTLE_PROFILE: AttemptThrottleProfile = {
  keyPrefix: 'admin-auth-throttle:v1:',
  factors: { password: 'email', second_factor: 'subject' },
  countAddress: true,
  throttled: {
    code: ERROR_CODES.ADMIN_AUTHENTICATION_THROTTLED,
    message: 'Too many unsuccessful attempts for this account. Wait before trying again.',
  },
  unavailable: {
    code: ERROR_CODES.ADMIN_AUTHENTICATION_UNAVAILABLE,
    message: 'Sign-in is temporarily unavailable. Try again in a moment.',
  },
  objectType: 'admin_user',
  subjectLogKey: 'adminUserId',
  auditActions: {
    throttled: 'admin_user.authentication_throttled',
    cleared: 'admin_user.authentication_throttle_cleared',
  },
  logMessages: {
    subject: 'administrator authentication throttle',
    throttled: 'administrator authentication throttled after repeated unsuccessful attempts',
    cleared: 'administrator authentication throttle cleared by an operator',
  },
};

/** What the throttle reads of an account to decide whether a device is still known. */
export interface AdminCredentialState {
  readonly adminUserId: string;
  /** The account's e-mail address, as stored — normalised. */
  readonly email: string;
  readonly passwordHash: string;
}

export interface AuthenticationThrottleOptions {
  readonly redis: AttemptCounterStore;
  readonly auditLog: AuditPort;
  readonly log: PlatformLogger;
  /** The active, not deleted account with this id, or `null`. */
  readonly credentialOf: (adminUserId: string) => Promise<AdminCredentialState | null>;
  readonly now?: () => number;
  readonly storeDeadlineMs?: number;
  readonly addressPolicy?: AttemptPolicy;
  readonly accountPolicy?: AttemptPolicy;
  /**
   * `false` leaves a stranger's **password** attempts to the address counter
   * alone. See {@link accountWideLimitFromEnvironment}. Default `true`.
   */
  readonly accountWideLimit?: boolean;
}

/** The environment variable that switches the account-wide password limit off. */
export const ACCOUNT_WIDE_LIMIT_VARIABLE = 'ADMIN_AUTH_ACCOUNT_WIDE_LIMIT';

/**
 * Whether the account-wide counter applies to passwords on this instance, from
 * the value of `ADMIN_AUTH_ACCOUNT_WIDE_LIMIT`. Read once, at composition.
 *
 * The account counter is the one a stranger can fill for somebody else, and the
 * known-device exemption is what keeps the account's holder out of it. On an
 * instance that **publishes** an administrator's credentials — a public demo —
 * every visitor is a first-time device, so anybody can keep all of them out
 * with twenty wrong passwords and a few more each half hour. Such an instance
 * sets the variable to `off`.
 *
 * It is an environment variable and not a Setting on purpose: a Setting would
 * be a switch in the Admin UI that the limit protects. Only the exact value
 * `off` switches it off; anything else — `OFF`, ` off `, `false` — leaves the
 * limit on and says so. A
 * warning is logged every time the limit is off.
 */
export function accountWideLimitFromEnvironment(
  value: string | undefined,
  log: PlatformLogger,
): boolean {
  // Compared exactly: `OFF` or ` off ` is a value this function does not know.
  if (value === undefined || value === '' || value === 'on') return true;
  if (value === 'off') {
    log.warn(
      { variable: ACCOUNT_WIDE_LIMIT_VARIABLE },
      'account-wide administrator attempt limit is OFF — intended for demo instances with published credentials',
    );
    return false;
  }
  log.warn(
    { variable: ACCOUNT_WIDE_LIMIT_VARIABLE },
    'ADMIN_AUTH_ACCOUNT_WIDE_LIMIT has a value that is neither `on` nor `off`; the account-wide administrator attempt limit stays on',
  );
  return true;
}

export class AuthenticationThrottle implements AdminAuthenticationThrottlePort {
  private readonly engine: AuthenticationAttemptThrottle;

  constructor(options: AuthenticationThrottleOptions) {
    this.engine = new AuthenticationAttemptThrottle({
      profile: ADMIN_THROTTLE_PROFILE,
      redis: options.redis,
      auditLog: options.auditLog,
      log: options.log,
      credentialOf: async (adminUserId) => {
        const credential = await options.credentialOf(adminUserId);
        return credential === null
          ? null
          : {
              subjectId: credential.adminUserId,
              email: credential.email,
              passwordHash: credential.passwordHash,
            };
      },
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.storeDeadlineMs === undefined ? {} : { storeDeadlineMs: options.storeDeadlineMs }),
      ...(options.addressPolicy === undefined ? {} : { addressPolicy: options.addressPolicy }),
      ...(options.accountPolicy === undefined ? {} : { accountPolicy: options.accountPolicy }),
      ...(options.accountWideLimit === undefined
        ? {}
        : { accountWideLimit: options.accountWideLimit }),
    });
  }

  verify(
    attempt: AdminAuthenticationAttempt,
    check: () => Promise<AdminAuthenticationCheckResult>,
  ): Promise<boolean> {
    return this.engine.verify(attempt, async () => {
      const result = await check();
      return result.adminUserId === undefined
        ? { ok: result.ok }
        : { ok: result.ok, subjectId: result.adminUserId };
    });
  }

  issueKnownDevice(adminUserId: string): Promise<string | null> {
    return this.engine.issueKnownDevice(adminUserId);
  }

  /**
   * Which Redis the counters are in: host, port and database index, or the
   * socket path. Never the credentials — they are not read here at all.
   */
  describeStore(): string {
    return this.engine.describeStore();
  }

  /**
   * Forget every counter of one account — the operator's way out for somebody
   * who is being kept from signing in on a device the account has never been
   * used from. Returns how many keys were removed.
   *
   * `email` clears the password counters, which are keyed by it whether or not
   * an account has it; `adminUserId` clears the second-factor counters.
   */
  clear(account: { email: string; adminUserId?: string }): Promise<number> {
    return this.engine.clear({
      email: account.email,
      ...(account.adminUserId === undefined ? {} : { subjectId: account.adminUserId }),
    });
  }
}
