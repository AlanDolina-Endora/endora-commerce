import { describe, expect, it } from 'vitest';
import type { CustomerAccountRecord } from '@endora-commerce/contracts';
import type { Command, CommandContext } from '@endora-commerce/platform/commands';
import { PushNotificationPreference } from '../entities/push-notification-preference.entity.js';
import { PushPreferenceService } from './push-preference-service.js';

/**
 * `specs/149-pwa-order-status-push/` T024 — the customer preference store over
 * a stub Command Bus and a stub account port: absence means both on and is
 * never written by a read; a write is a partial patch, stamped with the
 * account's organisation, run as the `pwa.push_preference.update` Command.
 */

type Row = PushNotificationPreference;

/** An in-memory stand-in for the two `em` calls the service makes. */
function memoryEm(rows: Row[]) {
  return {
    findOne: async (_entity: unknown, where: { customerAccountId: string }) =>
      rows.find((r) => r.customerAccountId === where.customerAccountId) ?? null,
    create: (_entity: unknown, data: Partial<Row>) => {
      const row = Object.assign(new PushNotificationPreference(), data);
      return row;
    },
    persist: (row: Row) => {
      if (!rows.includes(row)) rows.push(row);
    },
    flush: async () => undefined,
  };
}

function account(overrides: Partial<CustomerAccountRecord> = {}): CustomerAccountRecord {
  return { id: 'cust-1', organizationId: 'org-1', ...overrides } as CustomerAccountRecord;
}

interface Ran {
  command: Command<unknown>;
  before: unknown;
  after: unknown;
}

function harness(options: { rows?: Row[]; account?: CustomerAccountRecord | null } = {}) {
  const rows = options.rows ?? [];
  const em = memoryEm(rows);
  const ran: Ran[] = [];
  let writes = 0;
  const service = new PushPreferenceService(
    () => em as never,
    {
      findById: async () => ('account' in options ? options.account! : account()),
    },
    {
      run: async <T>(command: Command<T>): Promise<T> => {
        const ctx = {
          em: {
            ...em,
            persist: (row: Row) => {
              writes += 1;
              em.persist(row);
            },
          },
          actor: {
            actorAdminUserId: null,
            impersonatedCustomerAccountId: null,
            kind: 'customer',
          },
        } as unknown as CommandContext;
        const captured = command.capture ? await command.capture(ctx) : null;
        const outcome = await command.run(ctx);
        ran.push({
          command: command as Command<unknown>,
          before: outcome.before ?? captured,
          after: outcome.after,
        });
        return outcome.result;
      },
    },
  );
  return { service, rows, ran, writes: () => writes };
}

function stored(overrides: Partial<Row>): Row {
  return Object.assign(new PushNotificationPreference(), {
    customerAccountId: 'cust-1',
    organizationId: 'org-1',
    orderStatusEnabled: true,
    quoteStatusEnabled: true,
    ...overrides,
  });
}

describe('PushPreferenceService.read', () => {
  it('answers both on for an account that never chose, and writes nothing', async () => {
    const h = harness();
    expect(await h.service.read('cust-1')).toEqual({ orderStatus: true, quoteStatus: true });
    expect(h.rows).toEqual([]);
    expect(h.ran).toEqual([]);
  });

  it('answers the stored choice', async () => {
    const h = harness({ rows: [stored({ quoteStatusEnabled: false })] });
    expect(await h.service.read('cust-1')).toEqual({ orderStatus: true, quoteStatus: false });
  });
});

describe('PushPreferenceService.update', () => {
  it('creates the row on a first write, stamping the account’s organisation', async () => {
    const h = harness();
    const result = await h.service.update('cust-1', { quoteStatus: false });

    expect(result).toEqual({ orderStatus: true, quoteStatus: false });
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0]).toMatchObject({
      customerAccountId: 'cust-1',
      organizationId: 'org-1',
      orderStatusEnabled: true,
      quoteStatusEnabled: false,
    });
  });

  it('runs as one audited Command naming the row, with before and after', async () => {
    const h = harness();
    await h.service.update('cust-1', { orderStatus: false });

    expect(h.ran).toHaveLength(1);
    const { command, before, after } = h.ran[0]!;
    expect(command.action).toBe('pwa.push_preference.update');
    expect(command.objectType).toBe('push_notification_preference');
    expect(command.objectId).toBe(h.rows[0]!.id);
    expect(before).toBeNull();
    expect(after).toEqual({ orderStatus: false, quoteStatus: true });
  });

  it('keeps the field a partial patch omits', async () => {
    const existing = stored({ orderStatusEnabled: false, quoteStatusEnabled: true });
    const h = harness({ rows: [existing] });
    const result = await h.service.update('cust-1', { quoteStatus: false });

    expect(result).toEqual({ orderStatus: false, quoteStatus: false });
    expect(h.rows).toHaveLength(1);
    expect(h.ran[0]!.command.objectId).toBe(existing.id);
    expect(h.ran[0]!.before).toEqual({ orderStatus: false, quoteStatus: true });
    expect(h.ran[0]!.after).toEqual({ orderStatus: false, quoteStatus: false });
  });

  it('re-stamps the organisation from the account at every write', async () => {
    const h = harness({
      rows: [stored({ organizationId: 'org-old' })],
      account: account({ organizationId: 'org-new' }),
    });
    await h.service.update('cust-1', { orderStatus: true });
    expect(h.rows[0]!.organizationId).toBe('org-new');
  });

  it('refuses an account that does not resolve, writing nothing', async () => {
    const h = harness({ account: null });
    await expect(h.service.update('cust-1', { orderStatus: false })).rejects.toThrow(
      /does not resolve/,
    );
    expect(h.rows).toEqual([]);
    expect(h.ran).toEqual([]);
  });
});
