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

/**
 * The precedence rule, and nothing else (data-model §7): the account override
 * when it is set, else the organization value when its row exists, else
 * "allowed". Pure, so the enforcement read and the display read cannot disagree
 * about it — what can differ between them is only how the two rows were read.
 */
export function resolveEffective(
  accountRow: Pick<QuoteRequestAccountPolicy, 'priceProposalsAllowed'> | null,
  organizationRow: Pick<QuoteRequestOrgPolicy, 'priceProposalsAllowed'> | null,
): EffectiveNegotiation {
  if (accountRow && accountRow.priceProposalsAllowed != null) {
    return { allowed: accountRow.priceProposalsAllowed, source: 'account' };
  }
  if (organizationRow) {
    return { allowed: organizationRow.priceProposalsAllowed, source: 'organization' };
  }
  return { allowed: true, source: 'default' };
}

/** What a display read answers: both rows as read, and the effective value they give. */
export interface NegotiationDisplay {
  accountRow: QuoteRequestAccountPolicy | null;
  organizationRow: QuoteRequestOrgPolicy | null;
  effective: EffectiveNegotiation;
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
        return resolveEffective(override, null);
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
      return resolveEffective(override, organization);
    });
  }

  /**
   * The same value for a **display** (coordinator ruling D-3V): the admin
   * panels and the storefront's own read. `effectiveFor` opens a named system
   * scope, and every opening is an escape-hatch audit row — right for the
   * enforcement it exists for, noise on a screen that is merely being looked
   * at. So this reads both rows by primary key in the caller's **own** scope.
   *
   * The caller must already have proven the account visible — loaded the
   * `CustomerAccount` through its `@OrgScoped` filter (admin) or be its owner
   * (storefront session) — because `QuoteRequestAccountPolicy` carries no
   * filter of its own (plan I1). `organizationId` is the organization the
   * caller resolved for that account; the organization row is `@OrgScoped`, so
   * it answers for a caller who may see that organization.
   */
  async displayFor(
    customerAccountId: string,
    organizationId: string,
    em: EntityManager,
  ): Promise<NegotiationDisplay> {
    const accountRow = await em.findOne(QuoteRequestAccountPolicy, { customerAccountId });
    const organizationRow = await em.findOne(QuoteRequestOrgPolicy, { organizationId });
    return { accountRow, organizationRow, effective: resolveEffective(accountRow, organizationRow) };
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
