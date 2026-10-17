import type { FastifyInstance } from 'fastify';
import {
  PushSubscriptionInputSchema,
  PushSubscriptionDeleteSchema,
  UpdatePushPreferencesRequestSchema,
  type PwaIconPurpose,
} from '@endora-commerce/contracts';
import type { PwaConfigResolver } from './services/pwa-config-resolver.js';
import type { PwaIconService } from './services/pwa-icon-service.js';
import type { PushSubscriptionService } from './services/push-subscription-service.js';
import type { PushPreferenceService } from './services/push-preference-service.js';
import { getResolvedChannel, type RequireCustomerGuard } from '@endora-commerce/platform/kernel';
import { callingCustomerAccountId } from './request-actor.js';

export interface PwaStorefrontRoutesDeps {
  configResolver: PwaConfigResolver;
  iconService: PwaIconService;
  subscriptionService: PushSubscriptionService;
  /**
   * A stored asset id to a servable URL, over `assets_library`' published
   * `assetsLibraryPort` (`specs/110-instance-repository/` T118c). Absolute:
   * `assets_library` resolves the origin itself (D-223).
   */
  resolveAssetUrl: (assetId: string) => Promise<string | null>;
  /** The signed-in customer's account-wide push choices (`specs/149-pwa-order-status-push/`). */
  preferenceService: Pick<PushPreferenceService, 'read' | 'update'>;
  /** `auth`'s guard: 401 for a caller who is not a signed-in customer. */
  requireCustomer: RequireCustomerGuard;
}

/**
 * **`resolveChannelId` is gone, and it was never called.**
 *
 * Both composition roots built a `resolveChannelIdByCode` closure — a
 * `getByCode` with a system-default fallback — `plugin.ts` threaded it here as
 * `resolveChannelId`, and the three routes below read `getResolvedChannel`
 * instead, which is the platform's resolved request channel and the sanctioned
 * accessor (Constitution XII). So the option was dead the whole way down: two
 * closures, one option, one dependency field, and no call site. It was one of
 * the eight members of `PwaBridge`, and the only one T118c deleted rather than
 * drained.
 */

export async function registerPwaStorefrontRoutes(
  app: FastifyInstance,
  deps: PwaStorefrontRoutesDeps,
): Promise<void> {
  // GET config — manifest identity + toggles + public VAPID key (FR-001/011).
  app.get('/api/v1/storefront/pwa/config', async (request, reply) => {
    const channelId = getResolvedChannel(request).id;
    const config = await deps.configResolver.getPublicConfig(channelId);
    reply.header('Cache-Control', 'public, max-age=60');
    return reply.send(config);
  });

  // GET icon rendition — redirect to the stored asset URL (FR-005).
  app.get<{ Params: { spec: string } }>(
    '/api/v1/storefront/pwa/icons/:spec',
    async (request, reply) => {
      const match = /^(\d+)-(any|maskable)\.png$/.exec(request.params.spec);
      if (!match) return reply.code(404).send();
      const size = Number(match[1]);
      const purpose = match[2] as PwaIconPurpose;
      const channelId = getResolvedChannel(request).id;
      const assetId = await deps.iconService.resolveRenditionAssetId(channelId, size, purpose);
      if (!assetId) return reply.code(404).send();
      const url = await deps.resolveAssetUrl(assetId);
      if (!url) return reply.code(404).send();
      return reply.redirect(url, 302);
    },
  );

  // POST subscribe — register (upsert) a Web-Push subscription (FR-017).
  app.post('/api/v1/storefront/pwa/subscriptions', async (request, reply) => {
    const channelId = getResolvedChannel(request).id;
    const config = await deps.configResolver.getPublicConfig(channelId);
    if (!config.pushEnabled) {
      return reply.code(403).send({ error: { code: 'PWA_PUSH_DISABLED', message: 'Push is disabled for this channel.' } });
    }
    if (!config.vapidPublicKey) {
      return reply.code(503).send({ error: { code: 'PWA_PUSH_UNCONFIGURED', message: 'Push is not configured.' } });
    }
    const body = PushSubscriptionInputSchema.parse(request.body);
    const customerAccountId = callingCustomerAccountId(request);
    const result = await deps.subscriptionService.register({
      ...body,
      salesChannelId: channelId,
      customerAccountId,
    });
    return reply.code(result.created ? 201 : 200).send({ id: result.id, status: result.status });
  });

  // DELETE subscribe — revoke (FR-018). Idempotent, and only for the party that
  // subscribed: the owning customer's session, or the subscription's own keys
  // when no account owns it. Anything else answers 204 as well, so the reply
  // does not say whether the endpoint is registered.
  app.delete('/api/v1/storefront/pwa/subscriptions', async (request, reply) => {
    const body = PushSubscriptionDeleteSchema.parse(request.body);
    await deps.subscriptionService.revoke(body.endpoint, {
      customerAccountId: callingCustomerAccountId(request),
      keys: body.keys,
    });
    return reply.code(204).send();
  });

  // GET / PUT preferences — the signed-in customer's account-wide choice of
  // which automatic push categories they want (`specs/149-pwa-order-status-push/`
  // FR-017 – FR-022). The account is the session's, never a body value; the
  // guard runs as the `preHandler`, so an anonymous caller is answered 401
  // before validation. The stored value is answered whether or not the
  // category is offered on this channel: what to *show* is the public config's
  // `orderStatusPushEnabled` / `quoteStatusPushEnabled` (FR-020).
  app.get(
    '/api/v1/storefront/pwa/preferences',
    { preHandler: deps.requireCustomer },
    async (request, reply) => {
      const customerAccountId = signedInCustomer(request);
      return reply.send({ data: await deps.preferenceService.read(customerAccountId) });
    },
  );

  app.put(
    '/api/v1/storefront/pwa/preferences',
    { preHandler: deps.requireCustomer },
    async (request, reply) => {
      const customerAccountId = signedInCustomer(request);
      const patch = UpdatePushPreferencesRequestSchema.parse(request.body);
      return reply.send({ data: await deps.preferenceService.update(customerAccountId, patch) });
    },
  );
}

/** The account behind a request `requireCustomer` has already admitted. */
function signedInCustomer(request: Parameters<typeof callingCustomerAccountId>[0]): string {
  const customerAccountId = callingCustomerAccountId(request);
  if (!customerAccountId) {
    // Unreachable behind `requireCustomer`; a guard that admitted a non-customer
    // is a wiring defect, and answering for nobody would be worse than failing.
    throw new Error('pwa: a preferences route was reached without a signed-in customer');
  }
  return customerAccountId;
}
