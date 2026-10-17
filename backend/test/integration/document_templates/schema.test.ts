import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb, type TestDb } from '../../helpers/test-db.js';

/**
 * `specs/152-compare-pdf-template/` T010 — what the schema itself holds
 * (`data-model.md` §1–§2), independent of any service: one default per
 * document type and scope (FR-005), any number of non-defaults, the type-code
 * grammar, a channel's templates going with the channel, and the import
 * marker's primary key (FR-082).
 */
describe('document_templates schema (152 T010)', () => {
  let db: TestDb;
  const channelA = randomUUID();
  const channelB = randomUUID();
  const type = `fixture_${randomUUID().slice(0, 8)}.schema`;

  const insert = async (row: {
    id?: string;
    documentType?: string;
    salesChannelId?: string | null;
    isDefault?: boolean;
  }): Promise<string> => {
    const id = row.id ?? randomUUID();
    await db.orm.em.getConnection().execute(
      `insert into document_templates (id, document_type, name, sales_channel_id, content, is_default)
       values (?, ?, 'T', ?, '{"schemaVersion":1,"languages":{}}'::jsonb, ?)`,
      [id, row.documentType ?? type, row.salesChannelId ?? null, row.isDefault ?? false],
    );
    return id;
  };

  beforeAll(async () => {
    db = await setupTestDb();
    await db.orm.em.getConnection().execute(
      `insert into sales_channels (id, code, name, default_language, default_currency, created_at, updated_at)
       values
         (?, ?, '{"en-US":"Doc A"}'::jsonb, 'en-US', 'USD', now(), now()),
         (?, ?, '{"en-US":"Doc B"}'::jsonb, 'en-US', 'USD', now(), now())`,
      [channelA, `doc-a-${channelA.slice(0, 6)}`, channelB, `doc-b-${channelB.slice(0, 6)}`],
    );
  });

  afterAll(async () => {
    const conn = db.orm.em.getConnection();
    await conn.execute(`delete from document_templates where document_type = ?`, [type]);
    await conn.execute(`delete from document_template_imports where document_type = ?`, [type]);
    await conn.execute(`delete from sales_channels where id in (?, ?)`, [channelA, channelB]);
    await db.close();
  });

  it('refuses a second global default of one type', async () => {
    await insert({ isDefault: true });
    await expect(insert({ isDefault: true })).rejects.toThrow(/document_templates_one_default_per_scope_uq/);
  });

  it('refuses a second default for one channel and accepts one for another channel', async () => {
    await insert({ salesChannelId: channelA, isDefault: true });
    await expect(insert({ salesChannelId: channelA, isDefault: true })).rejects.toThrow(
      /document_templates_one_default_per_scope_uq/,
    );
    await expect(insert({ salesChannelId: channelB, isDefault: true })).resolves.toBeTypeOf('string');
  });

  it('accepts any number of non-default templates in one scope', async () => {
    for (let i = 0; i < 3; i += 1) await insert({});
    for (let i = 0; i < 3; i += 1) await insert({ salesChannelId: channelA });
    const rows = await db.orm.em
      .getConnection()
      .execute(`select count(*)::int as n from document_templates where document_type = ? and not is_default`, [type]);
    expect((rows[0] as { n: number }).n).toBeGreaterThanOrEqual(6);
  });

  it('refuses a document type outside the <module>.<snake_name> grammar', async () => {
    await expect(insert({ documentType: 'NotAType' })).rejects.toThrow(/document_templates_document_type_chk/);
    await expect(insert({ documentType: 'comparisons.Comparison' })).rejects.toThrow(
      /document_templates_document_type_chk/,
    );
  });

  it('refuses a channel that does not exist', async () => {
    await expect(insert({ salesChannelId: randomUUID() })).rejects.toThrow(/document_templates_sales_channel_id_fkey/);
  });

  it("deletes a channel's templates with the channel", async () => {
    const extra = randomUUID();
    const conn = db.orm.em.getConnection();
    await conn.execute(
      `insert into sales_channels (id, code, name, default_language, default_currency, created_at, updated_at)
       values (?, ?, '{"en-US":"Doc C"}'::jsonb, 'en-US', 'USD', now(), now())`,
      [extra, `doc-c-${extra.slice(0, 6)}`],
    );
    const id = await insert({ salesChannelId: extra, isDefault: true });
    await conn.execute(`delete from sales_channels where id = ?`, [extra]);
    const rows = await conn.execute(`select id from document_templates where id = ?`, [id]);
    expect(rows).toEqual([]);
  });

  it('refuses a second import marker for one (document type, source)', async () => {
    const conn = db.orm.em.getConnection();
    const mark = (): Promise<unknown> =>
      conn.execute(
        `insert into document_template_imports (document_type, source, imported_count, skipped_count, report, imported_at)
         values (?, 'legacy_table', 0, 0, '{}'::jsonb, now())`,
        [type],
      );
    await mark();
    await expect(mark()).rejects.toThrow(/document_template_imports_pkey/);
  });
});
