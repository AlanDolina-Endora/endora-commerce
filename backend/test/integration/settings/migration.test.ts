import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defineModuleSettingsManifest } from '@endora-commerce/contracts';
import { Migration20261011T135250CoreSettingsMultiline } from '@endora-commerce/platform/migrations';
import { setupTestDb, type TestDb } from '../../helpers/test-db.js';
import { ManifestReconciler } from '../../../src/kernel/settings/manifest-reconciler.js';

/**
 * T006 — Migration test for feature 004 / `005_settings_init.ts`. Verifies that
 * the settings tables, the `setting_value_type` enum, the foreign-key cascades,
 * and the unique/indices listed in `data-model.md` exist after `migration:up`.
 *
 * Constitution Principle III: real Postgres, no DB mocking.
 */
describe('settings migration (T006 — 005_settings_init)', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await setupTestDb();
  });

  afterAll(async () => {
    await db.close();
  });

  it('creates the five settings tables', async () => {
    const conn = db.orm.em.getConnection();
    const rows = await conn.execute<Array<{ table_name: string }>>(
      `select table_name from information_schema.tables
       where table_schema = 'public'
         and table_name in ('setting_groups','settings','setting_values',
                            'setting_group_sales_channels','setting_sales_channels')
       order by table_name`,
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      'setting_group_sales_channels',
      'setting_groups',
      'setting_sales_channels',
      'setting_values',
      'settings',
    ]);
  });

  it('creates the setting_value_type enum with the seven expected values', async () => {
    const conn = db.orm.em.getConnection();
    const rows = await conn.execute<Array<{ enumlabel: string }>>(
      `select e.enumlabel
       from pg_type t
       join pg_enum e on e.enumtypid = t.oid
       where t.typname = 'setting_value_type'
       order by e.enumsortorder`,
    );
    // 'secret' appended by migration 069 (feature 043 — write-only settings);
    // 'credential_ref' appended by migration 100 (feature 058 — credentials).
    expect(rows.map((r) => r.enumlabel)).toEqual([
      'string',
      'number',
      'boolean',
      'json',
      'string_list',
      'secret',
      'credential_ref',
    ]);
  });

  it('enforces UNIQUE (setting_id, sales_channel_id) on setting_values', async () => {
    const conn = db.orm.em.getConnection();
    const rows = await conn.execute<Array<{ indexdef: string }>>(
      `select indexdef from pg_indexes
       where schemaname = 'public' and tablename = 'setting_values'`,
    );
    const hasUnique = rows.some(
      (r) =>
        /UNIQUE/i.test(r.indexdef) &&
        /setting_id/.test(r.indexdef) &&
        /sales_channel_id/.test(r.indexdef),
    );
    expect(hasUnique).toBe(true);
  });

  it('cascades setting_values when its setting or its sales_channel is deleted', async () => {
    const conn = db.orm.em.getConnection();
    const rows = await conn.execute<
      Array<{ conname: string; confrelid_name: string; confdeltype: string }>
    >(
      `select c.conname,
              cl.relname as confrelid_name,
              c.confdeltype
       from pg_constraint c
       join pg_class t on t.oid = c.conrelid and t.relname = 'setting_values'
       join pg_class cl on cl.oid = c.confrelid
       where c.contype = 'f'`,
    );
    const settingFk = rows.find((r) => r.confrelid_name === 'settings');
    const channelFk = rows.find((r) => r.confrelid_name === 'sales_channels');
    expect(settingFk?.confdeltype).toBe('c'); // 'c' = CASCADE
    expect(channelFk?.confdeltype).toBe('c');
  });
});

/**
 * `settings.multiline` (`specs/144-seo-search-engine-robots/`, FR-004) — a
 * column on a table every instance already has, with rows in it.
 *
 * Two claims, and the second is the one an upgrade depends on. That the
 * migration **ran** in this database — which is what registration buys, an
 * unregistered migration being silent — and that running it over a populated
 * table changes nothing but the column: no row lost, no value touched, every
 * existing setting single-line, and no table rewrite.
 */
describe('settings migration — the multiline column', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await setupTestDb();
  });

  afterAll(async () => {
    await db.close();
  });

  it('is registered: the harness database, built from the registry, applied it', async () => {
    const conn = db.orm.em.getConnection();
    const applied = await conn.execute<Array<{ name: string }>>(
      `select name from mikro_orm_migrations where name = ?`,
      [Migration20261011T135250CoreSettingsMultiline.name],
    );
    expect(applied.map((r) => r.name)).toEqual(['Migration20261011T135250CoreSettingsMultiline']);
  });

  it('adds settings.multiline as boolean, not null, default false', async () => {
    const conn = db.orm.em.getConnection();
    const rows = await conn.execute<
      Array<{ data_type: string; is_nullable: string; column_default: string | null }>
    >(
      `select data_type, is_nullable, column_default
       from information_schema.columns
       where table_schema = 'public' and table_name = 'settings' and column_name = 'multiline'`,
    );
    expect(rows).toEqual([{ data_type: 'boolean', is_nullable: 'NO', column_default: 'false' }]);
  });

  it('upgrades a populated table without touching a row, and reverses cleanly', async () => {
    const em = await db.beginTx();
    try {
      // Rows of every kind the table holds: a shipped-shape manifest with an
      // enum, a hidden setting, a json default and an admin-set global value.
      await new ManifestReconciler(em).apply([
        defineModuleSettingsManifest({
          moduleCode: 'multiline_migration_probe',
          groups: [{ code: 'multiline_migration_probe', name: 'Probe' }],
          settings: [
            { code: 'multiline_migration_probe.text', name: 'Text', groupCode: 'multiline_migration_probe', valueType: 'string', defaultValue: 'a' },
            { code: 'multiline_migration_probe.choice', name: 'Choice', groupCode: 'multiline_migration_probe', valueType: 'string', defaultValue: 'x', enumOptions: ['x', 'y'] },
            { code: 'multiline_migration_probe.concealed', name: 'Concealed', groupCode: 'multiline_migration_probe', valueType: 'boolean', defaultValue: true, hidden: true },
            { code: 'multiline_migration_probe.shape', name: 'Shape', groupCode: 'multiline_migration_probe', valueType: 'json', defaultValue: { a: [1, 2] } },
          ],
        }),
      ]);
      await em.execute(
        `update settings set global_value = ?::jsonb where code = 'multiline_migration_probe.text'`,
        [JSON.stringify('line one\nline two')],
      );

      // The pre-migration table, populated: a copy of `settings` in a scratch
      // schema with the column taken off. The migration's own statements name
      // `"settings"` unqualified, so `search_path` points them at the copy and
      // the live table is never locked. Everything here is rolled back.
      await em.execute(`create schema multiline_probe`);
      await em.execute(
        `create table multiline_probe.settings (like public.settings including all)`,
      );
      await em.execute(`insert into multiline_probe.settings select * from public.settings`);
      await em.execute(`alter table multiline_probe.settings drop column multiline`);
      await em.execute(`set local search_path to multiline_probe, public`);

      const snapshot = async (): Promise<string> => {
        const rows = await em.execute<Array<{ row: Record<string, unknown> }>>(
          `select to_jsonb(s) - 'multiline' as row from multiline_probe.settings s order by s.id`,
        );
        return JSON.stringify(rows.map((r) => r.row));
      };
      const storageOf = async (): Promise<string> => {
        const rows = await em.execute<Array<{ relfilenode: string }>>(
          `select relfilenode::text as relfilenode from pg_class
           where oid = 'multiline_probe.settings'::regclass`,
        );
        return rows[0]!.relfilenode;
      };
      const hasColumn = async (): Promise<boolean> => {
        const rows = await em.execute<Array<{ n: string }>>(
          `select count(*)::text as n from information_schema.columns
           where table_schema = 'multiline_probe' and table_name = 'settings'
             and column_name = 'multiline'`,
        );
        return rows[0]!.n === '1';
      };
      const run = async (direction: 'up' | 'down'): Promise<void> => {
        const migration = new Migration20261011T135250CoreSettingsMultiline(
          em.getDriver(),
          em.config,
        );
        await migration[direction]();
        for (const query of migration.getQueries()) await em.execute(query as string);
      };

      const before = await snapshot();
      const rowCount = (JSON.parse(before) as unknown[]).length;
      expect(rowCount).toBeGreaterThanOrEqual(4);
      expect(await hasColumn()).toBe(false);
      const storageBefore = await storageOf();

      await run('up');

      expect(await hasColumn()).toBe(true);
      // Every column but the new one, of every row, byte for byte.
      expect(await snapshot()).toBe(before);
      // Every existing setting is single-line: today's behaviour.
      const flagged = await em.execute<Array<{ multiline: boolean; n: string }>>(
        `select multiline, count(*)::text as n from multiline_probe.settings group by multiline`,
      );
      expect(flagged).toEqual([{ multiline: false, n: String(rowCount) }]);
      // A constant default is a catalogue change: the table was not rewritten.
      expect(await storageOf()).toBe(storageBefore);

      await run('down');

      expect(await hasColumn()).toBe(false);
      expect(await snapshot()).toBe(before);
    } finally {
      await db.rollbackTx();
    }
  });
});
