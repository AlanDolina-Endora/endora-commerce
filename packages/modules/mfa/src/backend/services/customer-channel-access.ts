import { ERROR_CODES, type CustomerAccountReadPort } from '@endora-commerce/contracts';
import { HttpError } from '@endora-commerce/platform/http';
import type { SalesChannelAccessPort } from '@endora-commerce/platform/kernel';

/**
 * Feature 154 — the sales-channel access rule, asked on the customer sign-ins
 * this module completes (`specs/154-sales-channel-access/contracts/channel-access-rule.md` §6).
 *
 * Every route that completes a customer sign-in here is open to the kernel's
 * access step — the second step, the enforced set-up and the federated callback
 * all run before a session exists — so the rule is asked explicitly, on the
 * channel the sign-in was **begun** on (carried by the challenge, the set-up
 * ticket or the OAuth transaction) and never on the request's own channel: a
 * provider's redirect carries no storefront channel signal at all.
 *
 * A missing channel (a sign-in begun outside a request) is refused rather than
 * waved through, which is the policy's own answer for an unknown id.
 */
export interface CustomerChannelAccess {
  /** Whether an account of `organizationId` may use `salesChannelId`. Never throws a refusal. */
  permits(organizationId: string | null, salesChannelId: string | null): Promise<boolean>;
  /** Throws the 403 `SALES_CHANNEL_NOT_PERMITTED` refusal unless the account may use the channel. */
  assertAccountMayUse(customerAccountId: string, salesChannelId: string | null): Promise<void>;
}

/**
 * Built over `customer_accounts`' published read and the kernel's access port.
 * No `catch` anywhere: both are reached through `lazyPort`, and a presence
 * answer on an authentication path must stay fail-closed.
 */
export function createCustomerChannelAccess(
  accounts: Pick<CustomerAccountReadPort, 'findById'>,
  access: Pick<SalesChannelAccessPort, 'decide' | 'assertCustomerMayUse'>,
): CustomerChannelAccess {
  return {
    async permits(organizationId, salesChannelId) {
      if (salesChannelId === null) return false;
      // A customer decision reads only the channel id; the code and the
      // anonymous flag are facts about anonymous visitors.
      const decision = await access.decide(
        { kind: 'customer', organizationId: organizationId ?? '' },
        { id: salesChannelId, code: '', anonymousAccess: false },
      );
      return decision.ok;
    },
    async assertAccountMayUse(customerAccountId, salesChannelId) {
      if (salesChannelId === null) throw channelNotPermitted();
      const account = await accounts.findById(customerAccountId);
      await access.assertCustomerMayUse(account?.organizationId ?? null, salesChannelId);
    },
  };
}

/** The refusal for a sign-in begun with no channel at all; the envelope translates it. */
function channelNotPermitted(): HttpError {
  return new HttpError(
    403,
    ERROR_CODES.SALES_CHANNEL_NOT_PERMITTED,
    'This account does not have access to this store.',
  );
}
