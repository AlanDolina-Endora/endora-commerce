import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PWA_SETTING_CODES, PwaPublicConfigSchema } from '@endora-commerce/contracts';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { expectModuleAbsent, withModuleOff } from '../../helpers/off-state.js';
import { TEST_CUSTOMER_ID } from '../../helpers/test-actors.js';
import { seedShippedOrder, RFQ_SHIPPED_ORDER_ID } from '../../helpers/seed-commerce.js';
import { SEED_PRODUCT_101_ID } from '../../helpers/seed-catalog.js';

/**
 * `pwa` off-state — Constitution XVII item 6.
 *
 * The module is named by two `withModuleOff` callers and neither is item 6's
 * question: `_admin_surfaces/batch-ten-palette-off-state.test.ts` is feature
 * 091's palette assertion, and `pwa/module-owned-surface-off-state.test.ts` is
 * feature 091's *admin contribution* question — whether a module-owned admin
 * surface withdraws. Neither probes the module's API, its storefront or its
 * configuration, and the palette assertion is not repeated here.
 *
 * The four surfaces item 6 asks for map onto this module as follows:
 *
 *  * **API rejection** — the admin PWA configuration read and a write to it.
 *    Both halves are named because this module's admin surface *is* a
 *    configuration editor, so a read that keeps answering renders a screen an
 *    operator can believe is live;
 *  * **storefront absence** — two buyer-facing routes, and they are different
 *    questions. `GET /api/v1/storefront/pwa/config` is what the shop reads to
 *    decide whether it is installable at all;
 *    `POST /api/v1/storefront/pwa/subscriptions` is where a browser registers
 *    for push. The second is the sharper one: a subscription accepted while
 *    the module is off is a device enrolled into notifications the operator
 *    withdrew — the same class of defect the worker gate was repaired for,
 *    one surface over;
 *  * **non-editable configuration** — the theme colour, an ordinary setting.
 *    `pwa.enabled` is deliberately *not* the code written here: it is the
 *    module's activation control, the single exception item 6 names;
 *  * **admin absence** — the presence projection both frontends gate on, plus
 *    the `/admin-roles` permission catalogue the harness sweeps unasked;
 *  * **restoration** — asserted by the harness after both axes. Off is
 *    non-destructive: the manifest configuration, the icon asset, the VAPID
 *    keys and every stored subscription stay, and the restored probes hold the
 *    routes to it.
 *
 * The **deactivated-while-platform-available** case is the first axis the
 * harness drives, and it is the one an operator creates: withdrawing the
 * installable-app capability from `/platform/modules` never touches the
 * lifecycle registry.
 *
 * `specs/149-pwa-order-status-push/` adds the customer's push preferences to
 * the storefront surfaces, and two behavioural cases the route harness cannot
 * express: a status change while `pwa` is off queues nothing and stores
 * nothing, with every saved switch and choice intact when it comes back
 * (FR-024, SC-006); and `quote_requests` off withdraws the quote category and
 * nothing else (FR-025).
 */
describe('pwa off-state (Constitution XVII)', () => {
  let h: BackendServerHandle;
  const admin = { b2b_session: 'stub-admin-session' };
  const customer = { b2b_session: 'stub-customer-session' };
  const channel = { 'x-sales-channel': 'default' };

  beforeAll(async () => {
    h = await setupBackendServer();
  });

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  it('is absent from every surface while off, on both axes, and restored after', async () => {
    await expectModuleAbsent(h, 'pwa', {
      routes: [
        { url: '/api/v1/admin/pwa/config', cookies: admin },
        { method: 'PUT', url: '/api/v1/admin/pwa/config', cookies: admin, payload: {} },
        { url: '/api/v1/storefront/pwa/config', headers: channel },
        {
          method: 'POST',
          url: '/api/v1/storefront/pwa/subscriptions',
          headers: channel,
          payload: {},
        },
        { url: '/api/v1/storefront/pwa/preferences', headers: channel, cookies: customer },
        {
          method: 'PUT',
          url: '/api/v1/storefront/pwa/preferences',
          headers: channel,
          cookies: customer,
          // The harness replays every probe once the module is restored, so
          // this one writes the default rather than leaving a choice behind.
          payload: { orderStatus: true },
        },
      ],
      adminPresence: { cookies: admin },
      settingWrite: {
        code: PWA_SETTING_CODES.THEME_COLOR,
        value: '#123456',
        cookies: admin,
      },
    });
  });

  describe('status pushes (specs/149-pwa-order-status-push/)', () => {
    let quoteId: string;
    const sql = <T>(query: string, params: unknown[] = []): Promise<T[]> =>
      h.em().getConnection().execute(query, params) as Promise<T[]>;
    const settle = (ms = 50): Promise<void> => new Promise((r) => setTimeout(r, ms));

    async function rowsFor(eventId: string): Promise<number> {
      const rows = await sql<{ n: number }>(
        `select count(*)::int as n from push_messages where source_event_id = ?`,
        [eventId],
      );
      return rows[0]!.n;
    }

    async function awaitRow(eventId: string): Promise<number> {
      for (let i = 0; i < 40; i += 1) {
        const n = await rowsFor(eventId);
        if (n > 0) return n;
        await settle();
      }
      return rowsFor(eventId);
    }

    function emitOrderStatus(eventId: string): void {
      h.eventBus.emit('order.status_changed.v1' as never, {
        eventId,
        occurredAt: new Date().toISOString(),
        orderId: RFQ_SHIPPED_ORDER_ID,
        organizationId: '00000000-0000-4000-8000-0000000000aa',
        salesChannelId: '00000000-0000-4000-8000-0000000000c1',
        from: 'pending',
        to: 'shipment_sent',
        actor: { kind: 'admin' as const },
      } as never);
    }

    function emitQuoteApproved(eventId: string): void {
      h.eventBus.emit('rfq.approved.v1' as never, {
        eventId,
        occurredAt: new Date().toISOString(),
        rfqId: quoteId,
      } as never);
    }

    beforeAll(async () => {
      await seedShippedOrder(h.em());
      const add = await h.app.inject({
        method: 'POST',
        url: '/api/v1/cart/items',
        cookies: customer,
        payload: { productId: SEED_PRODUCT_101_ID, quantity: 1 },
      });
      expect(add.statusCode, add.body).toBe(200);
      const convert = await h.app.inject({
        method: 'POST',
        url: '/api/v1/cart/convert-to-quote-request',
        cookies: customer,
        payload: {},
      });
      expect(convert.statusCode, convert.body).toBe(200);
      quoteId = (convert.json() as { data: { quoteRequestId: string } }).data.quoteRequestId;

      const actor = { actorAdminUserId: null };
      await h.settings.adminService.setValueForAllChannels(PWA_SETTING_CODES.PUSH_ENABLED, true, null, actor);
      await h.settings.adminService.setValueForAllChannels(
        PWA_SETTING_CODES.VAPID_PUBLIC_KEY,
        'BPUB',
        null,
        actor,
      );
      await settle();
    });

    afterAll(async () => {
      await sql(`delete from push_notification_preferences where customer_account_id = ?`, [
        TEST_CUSTOMER_ID,
      ]);
      const actor = { actorAdminUserId: null };
      await h.settings.adminService.setValueForAllChannels(
        PWA_SETTING_CODES.PUSH_QUOTE_STATUS_ENABLED,
        true,
        null,
        actor,
      );
    });

    it('queues and stores nothing while pwa is off, and resumes with every choice intact', async () => {
      // Saved before the flip: a switch and a customer choice, both off the default.
      await sql(`delete from push_notification_preferences where customer_account_id = ?`, [
        TEST_CUSTOMER_ID,
      ]);
      const actor = { actorAdminUserId: null };
      await h.settings.adminService.setValueForAllChannels(
        PWA_SETTING_CODES.PUSH_QUOTE_STATUS_ENABLED,
        false,
        null,
        actor,
      );
      const put = await h.app.inject({
        method: 'PUT',
        url: '/api/v1/storefront/pwa/preferences',
        headers: channel,
        cookies: customer,
        payload: { quoteStatus: false },
      });
      expect(put.statusCode, put.body).toBe(200);
      await settle();

      const order = `evt-${randomUUID()}`;
      const quote = `evt-${randomUUID()}`;
      await withModuleOff('pwa', 'deactivated', async () => {
        emitOrderStatus(order);
        emitQuoteApproved(quote);
        await settle(400);
        expect(await rowsFor(order)).toBe(0);
        expect(await rowsFor(quote)).toBe(0);
      });

      // Back on: nothing was deleted, nothing was reset.
      const prefs = await h.app.inject({
        method: 'GET',
        url: '/api/v1/storefront/pwa/preferences',
        headers: channel,
        cookies: customer,
      });
      expect(prefs.json()).toEqual({ data: { orderStatus: true, quoteStatus: false } });
      const config = await h.app.inject({
        method: 'GET',
        url: '/api/v1/admin/pwa/config',
        cookies: admin,
      });
      expect(config.json()).toMatchObject({ orderStatusPushEnabled: true, quoteStatusPushEnabled: false });

      // And the first status change after the flip notifies as configured.
      const next = `evt-${randomUUID()}`;
      emitOrderStatus(next);
      expect(await awaitRow(next)).toBe(1);
    });

    it('withdraws only the quote category while quote_requests is off', async () => {
      await sql(`delete from push_notification_preferences where customer_account_id = ?`, [
        TEST_CUSTOMER_ID,
      ]);
      const actor = { actorAdminUserId: null };
      await h.settings.adminService.setValueForAllChannels(
        PWA_SETTING_CODES.PUSH_QUOTE_STATUS_ENABLED,
        true,
        null,
        actor,
      );
      await settle();

      await withModuleOff('quote_requests', 'deactivated', async () => {
        const order = `evt-${randomUUID()}`;
        emitOrderStatus(order);
        expect(await awaitRow(order)).toBe(1);

        const config = PwaPublicConfigSchema.parse(
          (
            await h.app.inject({
              method: 'GET',
              url: '/api/v1/storefront/pwa/config',
              headers: channel,
            })
          ).json(),
        );
        expect(config).toMatchObject({ orderStatusPushEnabled: true, quoteStatusPushEnabled: false });
      });
    });
  });
});
