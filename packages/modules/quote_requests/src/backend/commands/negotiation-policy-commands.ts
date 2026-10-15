import {
  ERROR_CODES,
  type CustomerAccountReadPort,
  type OrganizationDetailsPort,
  type QuoteRequestNegotiationOverride,
  type SalesRepAssignmentPort,
} from '@endora-commerce/contracts';
import type { Command, CommandActor } from '@endora-commerce/platform/commands';
import { HttpError } from '@endora-commerce/platform/http';
import { QuoteRequestAccountPolicy } from '../entities/quote-request-account-policy.entity.js';
import { QuoteRequestOrgPolicy } from '../entities/quote-request-org-policy.entity.js';
import { adminCanSeeOrganization, isPlatformWideScope } from '../services/admin-org-visibility.js';

/**
 * Feature 146, US4 — the two audited writes of the price-negotiation lock
 * (FR-026; research R12; `contracts/price-negotiation-api.md` §5).
 *
 * **The authority step is inside the Command** (threat model T2). The route's
 * gate is necessary and not sufficient: a Command is reachable from more than
 * one caller, and the audit row must never record a write that should not have
 * happened. So each `run` proves the caller may reach the subject **before its
 * first read-for-write**, and a refusal throws the same `404` an unknown id
 * gets (C1) — nothing read, nothing written, and the bus records no audit row
 * because the transaction rolls back.
 *
 * **Find, then create or assign, then flush** — never `em.upsert`,
 * `nativeUpdate` or `nativeInsert`, which bypass the unit of work and with it
 * the org write guard, the second line of defence.
 *
 * A write that changes nothing returns `skipAudit: true` and touches no row:
 * asking for the value the subject already has — including the default, when
 * it has no row — is not a change, and an audit row saying one happened is
 * worse than none.
 */

/** What the two Commands ask of the world besides their own `em`. */
export interface NegotiationCommandDeps {
  salesRepScope: Pick<SalesRepAssignmentPort, 'canSeeOrganization'>;
  customerAccounts: Pick<CustomerAccountReadPort, 'findById' | 'findInOrganization'>;
  organizations: Pick<OrganizationDetailsPort, 'findById'>;
  /**
   * Whether the ambient scope reaches every organization — a platform
   * administrator, or a system caller. Read from the tenant context, which the
   * host derives from the admin's role and never from the request (the Phase 4
   * probe's rule, D-3M). Injectable for the unit test only.
   */
  isPlatformAdmin?: () => boolean;
}

export interface OrganizationNegotiationState {
  organizationId: string;
  priceProposalsAllowed: boolean;
  /** `null` when no row exists (the default applies). */
  updatedAt: Date | null;
}

export interface AccountNegotiationState {
  customerAccountId: string;
  /** The account's **current** organization (D-3L). */
  organizationId: string;
  override: QuoteRequestNegotiationOverride;
  /** `null` when no row exists ("as organization"). */
  updatedAt: Date | null;
}

/** One refusal per subject, for an unknown id and an unreachable one alike (C1). */
export const organizationNotFound = (): HttpError =>
  new HttpError(404, ERROR_CODES.NOT_FOUND, 'Organization not found.');
export const customerNotFound = (): HttpError =>
  new HttpError(404, ERROR_CODES.NOT_FOUND, 'Customer not found.');

async function canReach(
  deps: NegotiationCommandDeps,
  actor: CommandActor,
  organizationId: string,
): Promise<boolean> {
  return adminCanSeeOrganization(
    deps.salesRepScope,
    actor.actorAdminUserId,
    organizationId,
    deps.isPlatformAdmin ?? isPlatformWideScope,
  );
}

export function overrideOf(value: boolean | null | undefined): QuoteRequestNegotiationOverride {
  if (value === true) return 'allowed';
  if (value === false) return 'not_allowed';
  return 'inherit';
}

function valueOf(override: QuoteRequestNegotiationOverride): boolean | null {
  if (override === 'allowed') return true;
  if (override === 'not_allowed') return false;
  return null;
}

/** `quote_request_policy.organization.set` — whether members of an organization may propose prices. */
export function makeSetOrganizationNegotiationCommand(
  input: { organizationId: string; priceProposalsAllowed: boolean },
  deps: NegotiationCommandDeps,
): Command<OrganizationNegotiationState> {
  return {
    action: 'quote_request_policy.organization.set',
    objectType: 'organization',
    objectId: input.organizationId,
    run: async ({ em, actor }) => {
      // Authority first, then existence: an out-of-scope organization and an
      // unknown one answer the same refusal, and neither reaches the table.
      if (!(await canReach(deps, actor, input.organizationId))) throw organizationNotFound();
      if (!(await deps.organizations.findById(input.organizationId))) throw organizationNotFound();

      const row = await em.findOne(QuoteRequestOrgPolicy, { organizationId: input.organizationId });
      const before = row ? row.priceProposalsAllowed : true;
      if (before === input.priceProposalsAllowed) {
        return {
          result: {
            organizationId: input.organizationId,
            priceProposalsAllowed: before,
            updatedAt: row ? row.updatedAt : null,
          },
          skipAudit: true,
        };
      }
      let written: QuoteRequestOrgPolicy;
      if (row) {
        row.priceProposalsAllowed = input.priceProposalsAllowed;
        written = row;
      } else {
        written = em.create(QuoteRequestOrgPolicy, {
          organizationId: input.organizationId,
          priceProposalsAllowed: input.priceProposalsAllowed,
        });
        em.persist(written);
      }
      await em.flush();
      return {
        result: {
          organizationId: input.organizationId,
          priceProposalsAllowed: input.priceProposalsAllowed,
          updatedAt: written.updatedAt,
        },
        before: { priceProposalsAllowed: before },
        after: { priceProposalsAllowed: input.priceProposalsAllowed },
      };
    },
  };
}

/** `quote_request_policy.customer_account.set` — the per-account override of the organization value. */
export function makeSetAccountNegotiationCommand(
  input: { customerAccountId: string; override: QuoteRequestNegotiationOverride },
  deps: NegotiationCommandDeps,
): Command<AccountNegotiationState> {
  return {
    action: 'quote_request_policy.customer_account.set',
    objectType: 'customer_account',
    objectId: input.customerAccountId,
    run: async ({ em, actor }) => {
      // The account's current organization (D-3L), membership confirmed in
      // one query, then the caller's reach — research R12's order.
      const account = await deps.customerAccounts.findById(input.customerAccountId);
      if (!account) throw customerNotFound();
      const member = await deps.customerAccounts.findInOrganization(
        input.customerAccountId,
        account.organizationId,
      );
      if (!member) throw customerNotFound();
      if (!(await canReach(deps, actor, account.organizationId))) throw customerNotFound();

      const row = await em.findOne(QuoteRequestAccountPolicy, {
        customerAccountId: input.customerAccountId,
      });
      const before = overrideOf(row?.priceProposalsAllowed);
      if (before === input.override) {
        return {
          result: {
            customerAccountId: input.customerAccountId,
            organizationId: account.organizationId,
            override: before,
            updatedAt: row ? row.updatedAt : null,
          },
          skipAudit: true,
        };
      }
      let written: QuoteRequestAccountPolicy;
      if (row) {
        // "As organization" keeps the row and writes `null` (data-model §6).
        row.priceProposalsAllowed = valueOf(input.override);
        written = row;
      } else {
        written = em.create(QuoteRequestAccountPolicy, {
          customerAccountId: input.customerAccountId,
          priceProposalsAllowed: valueOf(input.override),
        });
        em.persist(written);
      }
      await em.flush();
      return {
        result: {
          customerAccountId: input.customerAccountId,
          organizationId: account.organizationId,
          override: input.override,
          updatedAt: written.updatedAt,
        },
        before: { override: before },
        after: { override: input.override },
      };
    },
  };
}
