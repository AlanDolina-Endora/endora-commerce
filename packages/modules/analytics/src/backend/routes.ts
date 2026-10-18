// `config: { rateLimit }` is a declaration-merging augmentation of
// `@fastify/rate-limit`, which the host registers globally; the type-only
// import loads the declarations for this package's own compile and emits
// nothing (the `product_feeds` precedent, `routes.public.ts`).
import type {} from '@fastify/rate-limit';
// `request.actor` is the platform's augmentation, carried by its `./http`
// barrel; the type-only import puts it in this package's program.
import type {} from '@endora-commerce/platform/http';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  analyticsSummaryQuerySchema,
  ingestAnalyticsBatchRequestSchema,
  type Actor,
} from '@endora-commerce/contracts';
import type {
  AnalyticsIngestService,
  IngestContext,
} from './services/analytics-ingest.service.js';
import type { AnalyticsQueryService } from './services/analytics-query.service.js';
import { currentSalesChannel, type RequireAdminFactory } from '@endora-commerce/platform/kernel';

export interface AnalyticsRoutesDeps {
  ingestService: AnalyticsIngestService;
  queryService: AnalyticsQueryService;
  requireAdmin: RequireAdminFactory;
  /**
   * The id of the channel the request resolved to. Defaults to the platform's
   * resolved request channel; injectable so a route test needs no request scope.
   */
  resolveChannelId?: () => string | null;
}

/**
 * Per-route ceiling for the public ingest, on top of the host's global one.
 * Keyed by client IP: the route is open to anonymous browsing, so there is no
 * account to key by. A batch carries up to 100 events, so this admits up to
 * 6 000 events a minute from one client.
 */
export const ANALYTICS_INGEST_RATE_LIMIT = {
  max: 60,
  timeWindow: '1 minute',
  keyGenerator: (request: FastifyRequest): string => `analytics-ingest:${request.ip}`,
};

/**
 * Identity for an ingested batch, taken from the resolved actor only. A
 * customer contributes their account and, when the session carries one, their
 * organization; every other kind of caller contributes none.
 */
function ingestIdentity(request: FastifyRequest): Pick<IngestContext, 'customerAccountId' | 'organizationId'> {
  const actor = request.actor as Actor | undefined;
  if (actor?.kind !== 'customer') return { customerAccountId: null, organizationId: null };
  return {
    customerAccountId: actor.customerAccountId || null,
    organizationId: actor.organizationId || null,
  };
}

export async function registerAnalyticsRoutes(
  app: FastifyInstance,
  deps: AnalyticsRoutesDeps,
): Promise<void> {
  const { ingestService, queryService, requireAdmin } = deps;
  const resolveChannelId = deps.resolveChannelId ?? ((): string | null => currentSalesChannel()?.id ?? null);

  // Public ingest — accepts batches from storefront + admin. No auth gate by
  // design (FR-110): we want anonymous browsing events. Who sent them and on
  // which channel is what the server resolved for this request; the
  // per-event identity and channel fields in the body are ignored.
  app.post(
    '/api/v1/analytics/events',
    {
      schema: { body: ingestAnalyticsBatchRequestSchema },
      config: { rateLimit: ANALYTICS_INGEST_RATE_LIMIT },
    },
    async (request, reply) => {
      const body = ingestAnalyticsBatchRequestSchema.parse(request.body);
      const result = await ingestService.ingest({
        events: body.events,
        context: { salesChannelId: resolveChannelId(), ...ingestIdentity(request) },
        requestId: request.id,
      });
      reply.status(202);
      return { data: result };
    },
  );

  app.get<{ Querystring: { from?: string; to?: string; salesChannelId?: string } }>(
    '/api/v1/admin/analytics/summary',
    { preHandler: requireAdmin('analytics:read') },
    async (request) => {
      const query = analyticsSummaryQuerySchema.parse(request.query);
      const summary = await queryService.summary(query);
      return { data: summary };
    },
  );
}
