import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { EntityManager } from '@mikro-orm/postgresql';
import {
  setQuoteRequestAccountNegotiationSchema,
  setQuoteRequestOrgNegotiationSchema,
  uuidSchema,
  type Actor,
  type CustomerAccountReadPort,
  type OrganizationDetailsPort,
  type QuoteRequestAccountNegotiation,
  type QuoteRequestOrgNegotiation,
  type SalesRepAssignmentPort,
  type StorefrontQuoteRequestNegotiation,
} from '@endora-commerce/contracts';
import type { CommandBus } from '@endora-commerce/platform/commands';
import type { RequireAdminAnyFactory, RequireAdminFactory } from '@endora-commerce/platform/kernel';
import { orgConstraintFor } from '@endora-commerce/platform/tenancy';
import { QuoteRequestOrgPolicy } from './entities/quote-request-org-policy.entity.js';
import {
  customerNotFound,
  makeSetAccountNegotiationCommand,
  makeSetOrganizationNegotiationCommand,
  organizationNotFound,
  overrideOf,
  type NegotiationCommandDeps,
} from './commands/negotiation-policy-commands.js';
import type { NegotiationPolicyService } from './services/negotiation-policy-service.js';
import type { CustomerContextResolver, RequireCustomerGuard } from './routes.customer.js';

/**
 * Feature 146, US4 — the price-negotiation lock's admin controls and the
 * buyer's own read (`contracts/price-negotiation-api.md` §1 – §3; FR-020,
 * FR-025 – FR-027).
 *
 * **Reads are display reads** (coordinator ruling D-3V). The lock's
 * `effectiveFor` opens a named system scope, which is right for the
 * enforcement it exists for and writes an escape-hatch audit row each time; a
 * screen being looked at is not that. So every `GET` here proves the subject
 * visible through the caller's **own** tenant filter first — the
 * `CustomerAccount` is `@OrgScoped`, and its policy row carries no filter at all
 * (plan I1), so it is never read before the account answered — and then reads
 * the policy rows by primary key in the same scope
 * (`NegotiationPolicyService.displayFor`).
 *
 * **Every way of naming a subject the caller may not reach answers one `404`**
 * (C1): an unknown id, a malformed one, an organization outside a sales
 * representative's assignments, a customer of one. The `PUT`s run the audited
 * Commands, which repeat the authority step themselves (threat model T2).
 */

export interface QuoteRequestsNegotiationDeps {
  emFactory: () => EntityManager;
  commandBus: Pick<CommandBus, 'run'>;
  requireAdmin: RequireAdminFactory;
  requireAdminAny: RequireAdminAnyFactory;
  requireCustomer: RequireCustomerGuard;
  resolveCustomerContext: CustomerContextResolver;
  customerAccounts: Pick<CustomerAccountReadPort, 'findById' | 'findInOrganization'>;
  organizations: Pick<OrganizationDetailsPort, 'findById'>;
  salesRepAssignment: Pick<SalesRepAssignmentPort, 'canSeeOrganization'>;
  /** Resolved per call, so the container's current registration is the one asked. */
  negotiationPolicy: () => Pick<NegotiationPolicyService, 'displayFor'>;
}

const isUuid = (value: string): boolean => uuidSchema.safeParse(value).success;

export async function registerQuoteRequestsNegotiationRoutes(
  app: FastifyInstance,
  deps: QuoteRequestsNegotiationDeps,
): Promise<void> {
  const { emFactory, commandBus, requireAdmin, requireAdminAny, requireCustomer } = deps;
  const read = requireAdminAny(['customers:read', 'customers:manage']);
  const write = requireAdmin('customers:manage');
  const commandDeps: NegotiationCommandDeps = {
    salesRepScope: deps.salesRepAssignment,
    customerAccounts: deps.customerAccounts,
    organizations: deps.organizations,
  };

  /**
   * Whether the caller may see the organization: every one for a platform-wide
   * scope (derived from the admin's role, never from the request — the probe's
   * rule, D-3M), else the representative's assignments.
   */
  const canSee = async (request: FastifyRequest, organizationId: string): Promise<boolean> => {
    if (orgConstraintFor().kind === 'all') return true;
    const actor = request.actor as Actor | undefined;
    if (actor?.kind !== 'admin') return false;
    return deps.salesRepAssignment.canSeeOrganization(actor.adminUserId, organizationId);
  };

  const organizationState = async (organizationId: string): Promise<QuoteRequestOrgNegotiation> => {
    // `@OrgScoped`, read by primary key in the caller's own scope, for an
    // organization the caller was just shown to reach.
    const row = await emFactory().findOne(QuoteRequestOrgPolicy, { organizationId });
    return {
      organizationId,
      priceProposalsAllowed: row ? row.priceProposalsAllowed : true,
      updatedAt: row ? row.updatedAt.toISOString() : null,
    };
  };

  /**
   * The account, through its own `@OrgScoped` filter, then the caller's reach
   * over its **current** organization (D-3L). Only an account that answered
   * both has its policy row read.
   */
  const visibleAccount = async (request: FastifyRequest, id: string) => {
    if (!isUuid(id)) throw customerNotFound();
    const account = await deps.customerAccounts.findById(id);
    if (!account || !(await canSee(request, account.organizationId))) throw customerNotFound();
    return account;
  };

  const accountState = async (
    customerAccountId: string,
    organizationId: string,
  ): Promise<QuoteRequestAccountNegotiation> => {
    const { accountRow, organizationRow, effective } = await deps
      .negotiationPolicy()
      .displayFor(customerAccountId, organizationId, emFactory());
    return {
      customerAccountId,
      organizationId,
      override: overrideOf(accountRow?.priceProposalsAllowed),
      organizationPriceProposalsAllowed: organizationRow ? organizationRow.priceProposalsAllowed : true,
      effectivePriceProposalsAllowed: effective.allowed,
      effectiveSource: effective.source,
      updatedAt: accountRow ? accountRow.updatedAt.toISOString() : null,
    };
  };

  // §1 — the organization value.
  app.get<{ Params: { id: string } }>(
    '/api/v1/admin/organizations/:id/quote-price-negotiation',
    { preHandler: read },
    async (request) => {
      const { id } = request.params;
      if (!isUuid(id) || !(await canSee(request, id))) throw organizationNotFound();
      if (!(await deps.organizations.findById(id))) throw organizationNotFound();
      return { data: await organizationState(id) };
    },
  );

  app.put<{ Params: { id: string } }>(
    '/api/v1/admin/organizations/:id/quote-price-negotiation',
    { preHandler: write, schema: { body: setQuoteRequestOrgNegotiationSchema } },
    async (request) => {
      const { id } = request.params;
      if (!isUuid(id)) throw organizationNotFound();
      const body = setQuoteRequestOrgNegotiationSchema.parse(request.body);
      const state = await commandBus.run(
        makeSetOrganizationNegotiationCommand(
          { organizationId: id, priceProposalsAllowed: body.priceProposalsAllowed },
          commandDeps,
        ),
      );
      const data: QuoteRequestOrgNegotiation = {
        organizationId: state.organizationId,
        priceProposalsAllowed: state.priceProposalsAllowed,
        updatedAt: state.updatedAt ? state.updatedAt.toISOString() : null,
      };
      return { data };
    },
  );

  // §2 — the customer-account override.
  app.get<{ Params: { id: string } }>(
    '/api/v1/admin/customers/:id/quote-price-negotiation',
    { preHandler: read },
    async (request) => {
      const account = await visibleAccount(request, request.params.id);
      return { data: await accountState(account.id, account.organizationId) };
    },
  );

  app.put<{ Params: { id: string } }>(
    '/api/v1/admin/customers/:id/quote-price-negotiation',
    { preHandler: write, schema: { body: setQuoteRequestAccountNegotiationSchema } },
    async (request) => {
      const { id } = request.params;
      if (!isUuid(id)) throw customerNotFound();
      const body = setQuoteRequestAccountNegotiationSchema.parse(request.body);
      const state = await commandBus.run(
        makeSetAccountNegotiationCommand({ customerAccountId: id, override: body.override }, commandDeps),
      );
      return { data: await accountState(state.customerAccountId, state.organizationId) };
    },
  );

  // §3 — the buyer's own value (FR-025). Ids from the session only: no
  // parameter can name anybody else, and a query string is never read. The
  // static segment outranks `/api/v1/quote-requests/:id` (plan I4).
  app.get(
    '/api/v1/quote-requests/price-negotiation',
    { preHandler: requireCustomer },
    async (request, reply) => {
      reply.header('cache-control', 'private, no-store');
      const ctx = await deps.resolveCustomerContext(request);
      // The account's current organization (D-3L), through the buyer's own
      // filter. A session opened before the account moved cannot see the new
      // organization's account row, and then the session's organization is
      // the one shown: this read is a display, and enforcement — which reads
      // the current organization in its own named scope — still decides.
      const account = await deps.customerAccounts.findById(ctx.customerAccountId);
      const organizationId = account?.organizationId ?? ctx.organizationId;
      const { effective } = await deps
        .negotiationPolicy()
        .displayFor(ctx.customerAccountId, organizationId, emFactory());
      const data: StorefrontQuoteRequestNegotiation = { priceProposalsAllowed: effective.allowed };
      return { data };
    },
  );
}
