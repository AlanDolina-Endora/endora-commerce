import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EntityManager } from '@mikro-orm/postgresql';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { SEED_PRODUCT_101_ID } from '../../helpers/seed-catalog.js';
import { OTHER_TEST_ORGANIZATION_ID, TEST_CUSTOMER_ID, TEST_ORGANIZATION_ID } from '../../helpers/test-actors.js';
import { QuoteRequest } from '../../helpers/package-entities.js';
import { runWithTenantContext, type TenantContext } from '../../../src/tenancy/tenant-context.js';

/**
 * `specs/153-quote-request-pdf-template/` T032, T056 — the two schema changes:
 * the remembered template column (nullable, no foreign key, tenant-filtered
 * with its row) and the `pdf-sent` event type.
 */
describe('153 — quote request PDF schema [integration]', () => {
  let h: BackendServerHandle;
  let quote: string;
  const sql = <T>(query: string, params: unknown[] = []) => h.em().getConnection().execute(query, params) as Promise<T[]>;

  beforeAll(async () => {
    h = await setupBackendServer();
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/admin/quote-requests',
      cookies: { b2b_session: 'stub-admin-session' },
      payload: {
        organizationId: TEST_ORGANIZATION_ID,
        customerAccountId: TEST_CUSTOMER_ID,
        items: [{ productId: SEED_PRODUCT_101_ID, quantity: 1, agreedUnitPrice: 5 }],
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    quote = (res.json() as { data: { id: string } }).data.id;
  });

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  it('quote_requests.document_template_id is a nullable uuid with no foreign key', async () => {
    const [column] = await sql<{ data_type: string; is_nullable: string; column_default: string | null }>(
      `select data_type, is_nullable, column_default from information_schema.columns
        where table_name = 'quote_requests' and column_name = 'document_template_id'`,
    );
    expect(column).toEqual({ data_type: 'uuid', is_nullable: 'YES', column_default: null });
    const fks = await sql(
      `select 1 from pg_constraint con
         join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
        where con.contype = 'f' and con.conrelid = 'quote_requests'::regclass and att.attname = 'document_template_id'`,
    );
    expect(fks).toHaveLength(0);
    // Any uuid is stored — a template deleted later is not the database's concern.
    const any = randomUUID();
    await sql(`update quote_requests set document_template_id = ? where id = ?`, [any, quote]);
    expect((await sql<{ document_template_id: string }>(`select document_template_id from quote_requests where id = ?`, [quote]))[0]!.document_template_id).toBe(any);
  });

  it('the column travels with its tenant-filtered row: invisible, and unwritable, from another organisation', async () => {
    const other: TenantContext = { mode: 'allowed-set', allowedOrganizationIds: [OTHER_TEST_ORGANIZATION_ID], actor: { kind: 'admin', id: 'rep-153-other' } };
    const own: TenantContext = { mode: 'allowed-set', allowedOrganizationIds: [TEST_ORGANIZATION_ID], actor: { kind: 'admin', id: 'rep-153-own' } };
    const inContext = <T>(ctx: TenantContext, fn: (em: EntityManager) => Promise<T>) =>
      runWithTenantContext(ctx, () => fn(h.orm.em.fork() as EntityManager));
    expect(await inContext(other, (em) => em.findOne(QuoteRequest, { id: quote }))).toBeNull();
    const written = randomUUID();
    await inContext(own, async (em) => {
      const row = await em.findOneOrFail(QuoteRequest, { id: quote });
      row.documentTemplateId = written;
      await em.flush();
    });
    expect((await sql<{ document_template_id: string }>(`select document_template_id from quote_requests where id = ?`, [quote]))[0]!.document_template_id).toBe(written);
  });

  it('quote_request_events accepts a pdf-sent event, and still refuses an unknown type', async () => {
    await sql(
      `insert into quote_request_events (id, quote_request_id, event_type, payload, created_at) values (?, ?, 'pdf-sent', '{}'::jsonb, now())`,
      [randomUUID(), quote],
    );
    await expect(
      sql(`insert into quote_request_events (id, quote_request_id, event_type, payload, created_at) values (?, ?, 'pdf-faxed', '{}'::jsonb, now())`, [randomUUID(), quote]),
    ).rejects.toThrow(/qre_event_type_check/);
  });
});
