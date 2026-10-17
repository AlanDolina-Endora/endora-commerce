import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  AdminSearchCapabilityQuerySchema,
  AdminSearchCapabilitySchema,
  AdminSearchConfigurationViewSchema,
  AdminSearchQuerySchema,
  AdminSearchResponseSchema,
  UpdateAdminSearchConfigurationRequestSchema,
} from '@endora-commerce/contracts';
import type { RequireAdminFactory } from '@endora-commerce/platform/kernel';
import type { AdminSearchConfigurationService } from './configuration-service.js';
import type { AdminSearchService } from './search-service.js';

export interface AdminSearchRouteDeps {
  readonly searchService: AdminSearchService;
  readonly configurationService: AdminSearchConfigurationService;
  readonly requireAdmin: RequireAdminFactory;
  readonly resolveAdminContext: (request: FastifyRequest) => { adminUserId: string };
}

/**
 * Responses carry records the caller's role and scope decided; a shared cache
 * must never hold one, and the browser need not either (contracts §0).
 */
const NO_STORE = 'private, no-store';

/**
 * `/api/v1/admin/global-search*` (`specs/150-admin-global-search/contracts/admin-search-api.md`).
 *
 * Registered through `ctx.routes`, so a switched-off or unavailable
 * `admin_search` answers 503 `MODULE_DISABLED` on every one of them (FR-031).
 *
 * The search and the capability require a signed-in admin and nothing more:
 * each record type's own read permission is applied inside, per type (research
 * R-4, R-20) — a single `admin_search:use` code would widen what a role reads.
 */
export async function registerAdminSearchRoutes(
  app: FastifyInstance,
  deps: AdminSearchRouteDeps,
): Promise<void> {
  const { searchService, configurationService, requireAdmin, resolveAdminContext } = deps;

  app.get(
    '/api/v1/admin/global-search/capability',
    { preHandler: requireAdmin() },
    async (request, reply) => {
      const { language } = AdminSearchCapabilityQuerySchema.parse(request.query ?? {});
      const { adminUserId } = resolveAdminContext(request);
      const data = await searchService.capability({
        language,
        adminUserId,
        requestId: request.id,
      });
      reply.header('Cache-Control', NO_STORE);
      return { data: AdminSearchCapabilitySchema.parse(data) };
    },
  );

  app.get('/api/v1/admin/global-search', { preHandler: requireAdmin() }, async (request, reply) => {
    const query = AdminSearchQuerySchema.parse(request.query ?? {});
    const { adminUserId } = resolveAdminContext(request);
    const response = await searchService.search({
      q: query.q,
      entityTypes: query.entityTypes,
      limit: query.limit,
      language: query.language,
      adminUserId,
      requestId: request.id,
    });
    reply.header('Cache-Control', NO_STORE);
    return AdminSearchResponseSchema.parse(response);
  });

  // Configuration (§3–§4). The gate is the route's `preHandler`, so a caller
  // without the permission is answered 403 before the body is validated
  // (module-admin-surfaces.md, Admin permissions item 3).
  app.get(
    '/api/v1/admin/global-search/configuration',
    { preHandler: requireAdmin('admin_search:configure') },
    async (request, reply) => {
      const { language } = AdminSearchCapabilityQuerySchema.parse(request.query ?? {});
      const data = await configurationService.view(language);
      reply.header('Cache-Control', NO_STORE);
      return { data: AdminSearchConfigurationViewSchema.parse(data) };
    },
  );

  app.put(
    '/api/v1/admin/global-search/configuration',
    { preHandler: requireAdmin('admin_search:configure') },
    async (request, reply) => {
      const { language } = AdminSearchCapabilityQuerySchema.parse(request.query ?? {});
      const body = UpdateAdminSearchConfigurationRequestSchema.parse(request.body ?? {});
      const { adminUserId } = resolveAdminContext(request);
      const data = await configurationService.update(body, language, {
        actorAdminUserId: adminUserId,
        requestId: request.id,
      });
      reply.header('Cache-Control', NO_STORE);
      return { data: AdminSearchConfigurationViewSchema.parse(data) };
    },
  );
}
