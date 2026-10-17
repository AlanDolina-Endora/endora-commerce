import { randomUUID } from 'node:crypto';
import type { EntityManager } from '@mikro-orm/postgresql';
import type {
  CustomerAccountReadPort,
  PushPreferences,
  UpdatePushPreferencesRequest,
} from '@endora-commerce/contracts';
import type { CommandBus } from '@endora-commerce/platform/commands';
import { PushNotificationPreference } from '../entities/push-notification-preference.entity.js';
import type { PushPreferenceReader } from './status-push-composer.js';

/** What an account that never chose is treated as wanting (FR-018, research R-4). */
const DEFAULT_PREFERENCES: PushPreferences = { orderStatus: true, quoteStatus: true };

function toPreferences(row: PushNotificationPreference): PushPreferences {
  return { orderStatus: row.orderStatusEnabled, quoteStatus: row.quoteStatusEnabled };
}

/**
 * A customer account's account-wide push preference
 * (`specs/149-pwa-order-status-push/` FR-017 – FR-019, FR-022).
 *
 * **Absence means both on**, so a read never writes and nothing is seeded.
 * A write is a person's stated choice about what is delivered to them, so —
 * unlike a device subscription, which churns with browsers and is
 * `command-coverage-ignore` infrastructure — it runs as the
 * `pwa.push_preference.update` Command (Principle XIII, research R-12): one
 * audit row with the server-derived customer actor, before and after.
 *
 * The account id is always the caller's own (the route reads it off the
 * session, never a body). The organisation is stamped from the account at
 * every write (D-187) and an account that does not resolve refuses the write,
 * the `PushSubscriptionService` rule.
 */
export class PushPreferenceService implements PushPreferenceReader {
  constructor(
    private readonly emFactory: () => EntityManager,
    private readonly customerAccounts: Pick<CustomerAccountReadPort, 'findById'>,
    private readonly commandBus: Pick<CommandBus, 'run'>,
  ) {}

  async read(customerAccountId: string): Promise<PushPreferences> {
    const row = await this.emFactory().findOne(PushNotificationPreference, { customerAccountId });
    return row ? toPreferences(row) : { ...DEFAULT_PREFERENCES };
  }

  async update(
    customerAccountId: string,
    patch: UpdatePushPreferencesRequest,
  ): Promise<PushPreferences> {
    const account = await this.customerAccounts.findById(customerAccountId);
    if (!account) {
      throw new Error(
        `PushPreferenceService: customer account ${customerAccountId} does not resolve, so the preference it would own has no organisation to carry.`,
      );
    }
    const existing = await this.emFactory().findOne(PushNotificationPreference, {
      customerAccountId,
    });
    // Generated before the run for a first write, so the audit row names the
    // object it created.
    const objectId = existing?.id ?? randomUUID();

    return this.commandBus.run<PushPreferences>({
      action: 'pwa.push_preference.update',
      objectType: 'push_notification_preference',
      objectId,
      run: async ({ em }) => {
        const current = await em.findOne(PushNotificationPreference, { customerAccountId });
        const before = current ? toPreferences(current) : null;
        const base = before ?? DEFAULT_PREFERENCES;
        const next: PushPreferences = {
          orderStatus: patch.orderStatus ?? base.orderStatus,
          quoteStatus: patch.quoteStatus ?? base.quoteStatus,
        };
        const row =
          current ??
          em.create(PushNotificationPreference, {
            id: objectId,
            customerAccountId,
            organizationId: account.organizationId,
          });
        row.organizationId = account.organizationId;
        row.orderStatusEnabled = next.orderStatus;
        row.quoteStatusEnabled = next.quoteStatus;
        em.persist(row);
        await em.flush();
        return { result: next, before, after: next };
      },
    });
  }
}
