import type { FastifyInstance } from 'fastify';
import {
  seoEntityTypeSchema,
  upsertSeoMetaOverrideRequestSchema,
} from '@endora-commerce/contracts';
import type { MetaTagResolverService } from './services/meta-tag-resolver.service.js';
import type { SitemapGeneratorService } from './services/sitemap-generator.service.js';
import type { RequireAdminFactory } from '@endora-commerce/platform/kernel';
import { currentSalesChannel, getResolvedChannel } from '@endora-commerce/platform/kernel';
import { z } from 'zod';
import {
  DEFAULT_ROBOTS_SETTING_CODE,
  UnknownRobotsTokenError,
  robotsPolicyForToken,
} from './services/robots-policy.js';

/** The one read this module's routes make of the settings store. */
export interface SeoRouteSettingsPort {
  get<T>(code: string, salesChannelId: string, schema: z.ZodType<T>): Promise<T>;
}

export interface SeoRoutesDeps {
  metaResolver: MetaTagResolverService;
  sitemap: SitemapGeneratorService;
  requireAdmin: RequireAdminFactory;
  settings: SeoRouteSettingsPort;
}

export async function registerSeoRoutes(
  app: FastifyInstance,
  deps: SeoRoutesDeps,
): Promise<void> {
  const { metaResolver, sitemap, requireAdmin, settings } = deps;

  // -- Public: a sales channel's default robots policy ----------------------
  //
  // `specs/144-seo-search-engine-robots/contracts/crawler-policy.md` §1. The
  // storefront's middleware asks this on behalf of every response it serves
  // and is itself the cache, which is why no intermediary may keep the answer.
  //
  // The channel is the request's resolved one — its `X-Sales-Channel`, else
  // the system default — so there is no "no channel" answer and no value is
  // ever computed across channels (Principle XII). The settings store resolves
  // the channel's own value, else the all-channels value, else the declared
  // default.
  //
  // There is no presence check here. The registration seam answers `503`
  // `MODULE_DISABLED` for every route of an absent module, and the storefront
  // reads that as "this feature does not exist".
  //
  // A stored value that cannot be read — not a string, or not one of the four
  // choices — is a `500` and never a permissive `200`: the storefront keeps
  // what it knew instead of withdrawing a `noindex` nobody withdrew.
  app.get('/api/v1/storefront/seo/robots-policy', async (request, reply) => {
    const channel = getResolvedChannel(request);
    reply.header('Cache-Control', 'no-store');
    const stored = await settings.get(DEFAULT_ROBOTS_SETTING_CODE, channel.id, z.string());
    try {
      return { data: robotsPolicyForToken(stored) };
    } catch (error) {
      if (error instanceof UnknownRobotsTokenError) {
        // The value is a directive spelling, not a secret; it is what an
        // operator needs to find the row.
        request.log.error(
          {
            settingCode: DEFAULT_ROBOTS_SETTING_CODE,
            salesChannelCode: channel.code,
            storedValue: stored,
          },
          'seo: the stored default robots value is not one of the declared choices',
        );
      }
      throw error;
    }
  });

  // -- Public sitemap -------------------------------------------------------
  //
  // Resolves the channel from the request scope (filled by the
  // SalesChannelResolverMiddleware via header / query / host map / system
  // default). Each channel has its own cache row; if the resolver did not
  // resolve a channel (e.g. middleware bypass in tests), we serve nothing.
  app.get('/api/v1/catalog/sitemap.xml', { config: { streamingResponse: true } }, async (_request, reply) => {
    const channel = currentSalesChannel();
    if (!channel) {
      reply
        .status(503)
        .header('Content-Type', 'application/xml; charset=utf-8')
        .header('Cache-Control', 'no-store');
      return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>\n';
    }
    const { payload } = await sitemap.getOrGenerateForChannel(channel.code);
    reply
      .header('Content-Type', 'application/xml; charset=utf-8')
      .header('Cache-Control', 'public, max-age=3600');
    return payload;
  });

  // -- Admin: per-channel listing ------------------------------------------

  app.get(
    '/api/v1/admin/seo/sitemap',
    { preHandler: requireAdmin('catalog:write') },
    async () => {
      const rows = await sitemap.listChannelStatuses();
      return {
        data: rows.map((r) => ({
          salesChannelCode: r.salesChannelCode,
          salesChannelName: r.salesChannelName,
          storefrontUrl: r.storefrontUrl,
          storefrontUrlSource: r.storefrontUrlSource,
          generatedAt: r.generatedAt?.toISOString() ?? null,
          urlCount: r.urlCount,
          byteSize: r.byteSize,
        })),
      };
    },
  );

  // -- Admin: per-channel regenerate ---------------------------------------

  app.post<{ Params: { channelCode: string } }>(
    '/api/v1/admin/seo/sitemap/:channelCode/regenerate',
    { preHandler: requireAdmin('catalog:write') },
    async (request) => {
      const { channelCode } = request.params;
      const { generatedAt } = await sitemap.regenerateForChannel(channelCode);
      const status = await sitemap.getStatusForChannel(channelCode);
      return {
        data: {
          salesChannelCode: channelCode,
          generatedAt: generatedAt.toISOString(),
          urlCount: status.urlCount ?? 0,
          byteSize: status.byteSize ?? 0,
        },
      };
    },
  );

  // -- Admin: per-channel status -------------------------------------------

  app.get<{ Params: { channelCode: string } }>(
    '/api/v1/admin/seo/sitemap/:channelCode/status',
    { preHandler: requireAdmin('catalog:write') },
    async (request) => {
      const status = await sitemap.getStatusForChannel(request.params.channelCode);
      return {
        data: {
          salesChannelCode: request.params.channelCode,
          generatedAt: status.generatedAt?.toISOString() ?? null,
          urlCount: status.urlCount,
          byteSize: status.byteSize,
        },
      };
    },
  );

  // -- Admin: preview / download cached XML --------------------------------
  //
  // `?download=1` flips Content-Disposition to attachment so the browser
  // saves the XML; otherwise the response renders inline (the admin UI
  // opens it in a new tab for preview).
  app.get<{
    Params: { channelCode: string };
    Querystring: { download?: string };
  }>(
    '/api/v1/admin/seo/sitemap/:channelCode/xml',
    { preHandler: requireAdmin('catalog:write'), config: { streamingResponse: true } },
    async (request, reply) => {
      const { channelCode } = request.params;
      const { payload } = await sitemap.getOrGenerateForChannel(channelCode);
      reply
        .header('Content-Type', 'application/xml; charset=utf-8')
        .header('Cache-Control', 'no-store');
      const isDownload =
        typeof request.query.download === 'string' &&
        request.query.download !== '' &&
        request.query.download !== '0' &&
        request.query.download.toLowerCase() !== 'false';
      if (isDownload) {
        reply.header(
          'Content-Disposition',
          `attachment; filename="sitemap-${channelCode}.xml"`,
        );
      } else {
        reply.header('Content-Disposition', 'inline');
      }
      return payload;
    },
  );

  // -- Meta editor ----------------------------------------------------------

  app.get<{
    Params: { entityType: string; entityId: string };
    Querystring: { locale?: string };
  }>(
    '/api/v1/admin/seo/meta/:entityType/:entityId',
    { preHandler: requireAdmin('catalog:write') },
    async (request) => {
      const entityType = seoEntityTypeSchema.parse(request.params.entityType);
      const locale = request.query.locale ?? 'en-US';
      const resolved = await metaResolver.resolve({
        entityType,
        entityId: request.params.entityId,
        locale,
      });
      const override = await metaResolver.getOverride({
        entityType,
        entityId: request.params.entityId,
        locale,
      });
      return {
        data: {
          resolved,
          override: override
            ? {
                title: override.title ?? null,
                description: override.description ?? null,
                ogTitle: override.ogTitle ?? null,
                ogDescription: override.ogDescription ?? null,
                ogImageUrl: override.ogImageUrl ?? null,
              }
            : null,
        },
      };
    },
  );

  app.put<{
    Params: { entityType: string; entityId: string };
  }>(
    '/api/v1/admin/seo/meta/:entityType/:entityId',
    {
      preHandler: requireAdmin('catalog:write'),
      schema: { body: upsertSeoMetaOverrideRequestSchema },
    },
    async (request) => {
      const entityType = seoEntityTypeSchema.parse(request.params.entityType);
      const body = upsertSeoMetaOverrideRequestSchema.parse(request.body);
      const row = await metaResolver.upsertOverride({
        entityType,
        entityId: request.params.entityId,
        locale: body.locale,
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.ogTitle !== undefined ? { ogTitle: body.ogTitle } : {}),
        ...(body.ogDescription !== undefined ? { ogDescription: body.ogDescription } : {}),
        ...(body.ogImageUrl !== undefined ? { ogImageUrl: body.ogImageUrl } : {}),
      });
      return {
        data: {
          id: row.id,
          locale: row.locale,
          title: row.title ?? null,
          description: row.description ?? null,
          ogTitle: row.ogTitle ?? null,
          ogDescription: row.ogDescription ?? null,
          ogImageUrl: row.ogImageUrl ?? null,
        },
      };
    },
  );

  app.delete<{
    Params: { entityType: string; entityId: string };
    Querystring: { locale?: string };
  }>(
    '/api/v1/admin/seo/meta/:entityType/:entityId',
    { preHandler: requireAdmin('catalog:write') },
    async (request, reply) => {
      const entityType = seoEntityTypeSchema.parse(request.params.entityType);
      const locale = request.query.locale ?? 'en-US';
      await metaResolver.deleteOverride({
        entityType,
        entityId: request.params.entityId,
        locale,
      });
      return reply.status(204).send();
    },
  );
}
