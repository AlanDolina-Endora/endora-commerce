import type { EntityManager } from '@mikro-orm/postgresql';
import { ERROR_CODES, type CustomerAccountReadPort } from '@endora-commerce/contracts';
import { HttpError } from '@endora-commerce/platform/http';
import { withSystemScope } from '@endora-commerce/platform/tenancy';
import { QuoteRequestAccountPolicy } from '../entities/quote-request-account-policy.entity.js';
import { QuoteRequestOrgPolicy } from '../entities/quote-request-org-policy.entity.js';

/**
 * The escape hatch's documentation (feature 050, FR-005). The authorisation it
 * refers to is the caller's: the visibility check that loaded the request
 * (`findVisibleForCustomer`), or the session itself on create.
 */
export const NEGOTIATION_LOCK_SCOPE_REASON =
  'quote_requests: negotiation lock for the request owner, read by primary key after the caller authorised the request';

export type NegotiationSource = 'account' | 'organization' | 'default';

export interface EffectiveNegotiation {
  allowed: boolean;
  source: NegotiationSource;
}

/** The one shape the predicate reads: a line as the customer sent it. */
export interface ProposalLine {
  readonly desiredUnitPrice?: number | null | undefined;
}

/**
 * Whether any line carries a customer proposal — `desiredUnitPrice !==
 * undefined` on the validated body **as sent** (threat model T4). `0` is a
 * proposal; a truthiness test would let a zero price through. Never ask this of
 * the lines a rewrite computes: those carry the stored proposals an edit omits
 * (T5), which are not the customer proposing anything.
 */
export function carriesProposal(lines: ReadonlyArray<ProposalLine> | undefined): boolean {
  return (lines ?? []).some((line) => line.desiredUnitPrice !== undefined);
}

export interface NegotiationPolicyDeps {
  /** The owner's **current** organization (decision D-3L, analyze M3). */
  customerAccounts: Pick<CustomerAccountReadPort, 'findById'>;
}

/**
 * Feature 146, US4 — whether a quote request's owner may propose prices
 * (research R11; data-model §7; FR-020, FR-022, FR-037).
 *
 * effective = the account override when it is set, else the organization value
 * when its row exists, else "allowed".
 *
 * **Every read is tenant-blind on purpose** (threat model T1). For the lock,
 * "no row" means "allowed", so a read a tenant filter can narrow — an
 * organization administrator acting on a colleague's draft, a session opened
 * before the account moved — would turn an existing lock into a pass. So the
 * owner id comes from the request row or the session (never the body), and
 * the account, its override and its organization's value are each read by
 * exact primary key inside one named `withSystemScope`: such a read can only
 * answer "this row" or "no row", and "no row" then really means no row.
 *
 * **There is no `catch`** (analyze M5): an unreadable lock fails the request
 * rather than letting a proposal through, and an owner whose account does not
 * resolve is an error, not a default.
 */
export class NegotiationPolicyService {
  constructor(private readonly deps: NegotiationPolicyDeps) {}

  /** The owner's effective value, read on the caller's `em`. */
  effectiveFor(customerAccountId: string, em: EntityManager): Promise<EffectiveNegotiation> {
    return withSystemScope(NEGOTIATION_LOCK_SCOPE_REASON, async () => {
      const override = await em.findOne(QuoteRequestAccountPolicy, { customerAccountId });
      if (override && override.priceProposalsAllowed != null) {
        return { allowed: override.priceProposalsAllowed, source: 'account' };
      }
      // The account's organization now — not the request's stamp, which is
      // history: an account moved after raising a draft follows its new one.
      const account = await this.deps.customerAccounts.findById(customerAccountId);
      if (!account) {
        throw new Error(
          `quote_requests: the negotiation lock cannot be read — customer account ${customerAccountId} did not resolve`,
        );
      }
      const organization = await em.findOne(QuoteRequestOrgPolicy, {
        organizationId: account.organizationId,
      });
      if (organization) {
        return { allowed: organization.priceProposalsAllowed, source: 'organization' };
      }
      return { allowed: true, source: 'default' };
    });
  }

  /**
   * Refuse a body carrying a proposal when the owner may not propose
   * (FR-022). A body with none reads nothing, so cart conversion and resubmit
   * — which never send one — are never refused (FR-023).
   */
  async assertProposalsAllowed(
    customerAccountId: string,
    lines: ReadonlyArray<ProposalLine> | undefined,
    em: EntityManager,
  ): Promise<void> {
    if (!carriesProposal(lines)) return;
    const { allowed } = await this.effectiveFor(customerAccountId, em);
    if (!allowed) {
      throw new HttpError(
        422,
        ERROR_CODES.RFQ_PRICE_PROPOSAL_NOT_ALLOWED,
        'Your account cannot propose prices on quote requests.',
      );
    }
  }
}
