import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defineModuleSettingsManifest, ERROR_CODES } from '@endora-commerce/contracts';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { ManifestReconciler } from '../../../src/kernel/settings/manifest-reconciler.js';
import { Setting } from '@endora-commerce/platform/kernel';
import { SettingValue } from '@endora-commerce/platform/kernel';
import { AuditLogEntry } from '@endora-commerce/platform/kernel';
import { SalesChannel } from '@endora-commerce/platform/kernel';

/**
 * T030 — Contract test: PUT /api/v1/admin/settings/:code/value with
 * scope='all' and scope='subset', plus the negative paths (empty subset,
 * out-of-scope channel, wrong shape).
 */
describe('admin set value (T030)', () => {
  let h: BackendServerHandle;

  beforeAll(async () => {
    h = await setupBackendServer();
    const reconciler = new ManifestReconciler(h.em());
    await reconciler.apply([
      defineModuleSettingsManifest({
        moduleCode: 'us2_test_setval',
        groups: [],
        settings: [
          {
            code: 'us2_setval.url',
            name: 'URL',
            valueType: 'string',
            defaultValue: 'https://default.example',
          },
          {
            code: 'us2_setval.scoped_url',
            name: 'Scoped URL',
            valueType: 'string',
            defaultValue: 'https://scoped.example',
            salesChannelCodes: ['pl_retail'],
          },
        ],
      }),
    ]);
  });

  afterAll(async () => {
    const em = h.em();
    for (const s of await em.find(Setting, { ownerModule: 'us2_test_setval' })) em.remove(s);
    await em.flush();
    await teardownBackendServer(h);
  });

  beforeEach(async () => {
    // Clean any setting_values + global override left by prior tests so each
    // case starts blank.
    const em = h.em();
    const settings = await em.find(Setting, { ownerModule: 'us2_test_setval' });
    for (const s of settings) {
      const values = await em.find(SettingValue, { setting: s });
      for (const v of values) em.remove(v);
      s.globalValue = null;
    }
    await em.flush();
  });

  const adminCookie = { b2b_session: 'stub-admin-session' };

  it("scope='all' writes the global override (no per-channel rows) and audits once", async () => {
    const r = await h.app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings/us2_setval.url/value',
      cookies: adminCookie,
      payload: { scope: 'all', value: 'https://new.example' },
    });
    expect(r.statusCode).toBe(200);

    const em = h.em();
    const setting = await em.findOneOrFail(Setting, { code: 'us2_setval.url' });
    expect(setting.globalValue).toBe('https://new.example');

    // No per-channel rows are created — channels inherit the global override.
    const values = await em.find(SettingValue, { setting });
    expect(values).toHaveLength(0);

    const audits = await em.find(AuditLogEntry, {
      action: 'setting.global_value_set',
      objectType: 'setting',
    });
    const audited = audits.filter(
      (a) => (a.stateAfter as { settingCode?: string } | undefined)?.settingCode === 'us2_setval.url',
    );
    expect(audited.length).toBe(1);
    expect((audited[0]!.stateAfter as { value?: unknown } | undefined)?.value).toBe(
      'https://new.example',
    );

    // SalesChannel count assertion preserved as a smoke check on the fixture.
    const allChannels = await em.count(SalesChannel, {});
    expect(allChannels).toBeGreaterThan(0);
  });

  it("scope='subset' targets only the listed channels", async () => {
    const r = await h.app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings/us2_setval.url/value',
      cookies: adminCookie,
      payload: {
        scope: 'subset',
        salesChannelCodes: ['pl_retail'],
        value: 'https://retail.example',
      },
    });
    expect(r.statusCode).toBe(200);

    const em = h.em();
    const values = await em.find(
      SettingValue,
      { setting: { code: 'us2_setval.url' } },
      { populate: ['salesChannel'] },
    );
    expect(values).toHaveLength(1);
    expect(values[0]!.salesChannel.code).toBe('pl_retail');
    expect(values[0]!.value).toBe('https://retail.example');
  });

  // ------------------------------------------------------------------
  // The audit row carries the stored value before the write as well as
  // the value after it (specs/144-seo-search-engine-robots FR-007).
  // ------------------------------------------------------------------

  type AuditState = Record<string, unknown> | null | undefined;

  /** This setting's audit rows under one action, oldest first. */
  async function auditRows(
    settingCode: string,
    action: string,
  ): Promise<Array<{ stateBefore: AuditState; stateAfter: AuditState }>> {
    const em = h.em();
    const setting = await em.findOneOrFail(Setting, { code: settingCode });
    const rows = await em.find(
      AuditLogEntry,
      { action, objectType: 'setting', objectId: setting.id },
      { orderBy: { actedAt: 'asc', id: 'asc' } },
    );
    return rows.map((row) => ({ stateBefore: row.stateBefore, stateAfter: row.stateAfter }));
  }

  async function channelId(code: string): Promise<string> {
    return (await h.em().findOneOrFail(SalesChannel, { code })).id;
  }

  async function putValue(payload: Record<string, unknown>): Promise<number> {
    const r = await h.app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings/us2_setval.url/value',
      cookies: adminCookie,
      payload,
    });
    return r.statusCode;
  }

  it("scope='all' audits the stored global value before the write, and says when there was none", async () => {
    const already = (await auditRows('us2_setval.url', 'setting.global_value_set')).length;

    expect(await putValue({ scope: 'all', value: 'https://first.example' })).toBe(200);
    expect(await putValue({ scope: 'all', value: 'https://second.example' })).toBe(200);

    const rows = (await auditRows('us2_setval.url', 'setting.global_value_set')).slice(already);
    expect(rows).toHaveLength(2);

    // Nothing stored: the manifest default is NOT reported as the previous
    // value — the row records what was stored, and nothing was.
    expect(rows[0]!.stateBefore).toEqual({
      settingCode: 'us2_setval.url',
      value: null,
      valueType: 'string',
      stored: false,
    });
    expect(rows[0]!.stateAfter).toEqual({
      settingCode: 'us2_setval.url',
      value: 'https://first.example',
      valueType: 'string',
    });

    expect(rows[1]!.stateBefore).toEqual({
      settingCode: 'us2_setval.url',
      value: 'https://first.example',
      valueType: 'string',
      stored: true,
    });
    expect(rows[1]!.stateAfter).toEqual({
      settingCode: 'us2_setval.url',
      value: 'https://second.example',
      valueType: 'string',
    });
  });

  it("scope='subset' audits each channel's OWN stored value before the write", async () => {
    const retail = await channelId('pl_retail');
    const vip = await channelId('pl_b2b_vip');
    const already = (await auditRows('us2_setval.url', 'setting.value_set')).length;

    // A global override and another channel's row are both in place, so a
    // before-state that read the resolved value, or the wrong row, shows up.
    expect(await putValue({ scope: 'all', value: 'https://global.example' })).toBe(200);
    expect(
      await putValue({
        scope: 'subset',
        salesChannelCodes: ['pl_b2b_vip'],
        value: 'https://vip.example',
      }),
    ).toBe(200);
    expect(
      await putValue({
        scope: 'subset',
        salesChannelCodes: ['pl_retail'],
        value: 'https://retail-1.example',
      }),
    ).toBe(200);
    expect(
      await putValue({
        scope: 'subset',
        salesChannelCodes: ['pl_retail', 'pl_b2b_vip'],
        value: 'https://both.example',
      }),
    ).toBe(200);

    const rows = (await auditRows('us2_setval.url', 'setting.value_set')).slice(already);
    expect(rows).toHaveLength(4);

    // First write to pl_retail: no row of its own — not the global override,
    // and not pl_b2b_vip's value.
    const firstRetail = rows.find(
      (row) =>
        row.stateAfter?.['salesChannelId'] === retail &&
        row.stateAfter?.['value'] === 'https://retail-1.example',
    );
    expect(firstRetail?.stateBefore).toEqual({
      settingCode: 'us2_setval.url',
      salesChannelId: retail,
      value: null,
      valueType: 'string',
      stored: false,
    });

    const both = rows.filter((row) => row.stateAfter?.['value'] === 'https://both.example');
    expect(both).toHaveLength(2);
    const byChannel = new Map(both.map((row) => [row.stateAfter?.['salesChannelId'], row]));
    expect(byChannel.get(retail)?.stateBefore).toEqual({
      settingCode: 'us2_setval.url',
      salesChannelId: retail,
      value: 'https://retail-1.example',
      valueType: 'string',
      stored: true,
    });
    expect(byChannel.get(vip)?.stateBefore).toEqual({
      settingCode: 'us2_setval.url',
      salesChannelId: vip,
      value: 'https://vip.example',
      valueType: 'string',
      stored: true,
    });
  });

  it('a reset audits the value it removed, per channel and platform-wide', async () => {
    const retail = await channelId('pl_retail');
    expect(await putValue({ scope: 'all', value: 'https://global.example' })).toBe(200);
    expect(
      await putValue({
        scope: 'subset',
        salesChannelCodes: ['pl_retail'],
        value: 'https://retail.example',
      }),
    ).toBe(200);

    const channelResetsBefore = (await auditRows('us2_setval.url', 'setting.value_reset')).length;
    const globalResetsBefore = (await auditRows('us2_setval.url', 'setting.global_value_reset'))
      .length;

    const channelReset = await h.app.inject({
      method: 'DELETE',
      url: '/api/v1/admin/settings/us2_setval.url/values?salesChannelCodes=pl_retail,pl_b2b_vip',
      cookies: adminCookie,
    });
    expect(channelReset.statusCode).toBe(200);

    // pl_b2b_vip had no row: nothing was removed there, so nothing is audited.
    const channelRows = (await auditRows('us2_setval.url', 'setting.value_reset')).slice(
      channelResetsBefore,
    );
    expect(channelRows).toHaveLength(1);
    expect(channelRows[0]!.stateBefore).toEqual({
      settingCode: 'us2_setval.url',
      salesChannelId: retail,
      value: 'https://retail.example',
      valueType: 'string',
      stored: true,
    });
    expect(channelRows[0]!.stateAfter).toEqual({
      settingCode: 'us2_setval.url',
      salesChannelId: retail,
    });

    const globalReset = await h.app.inject({
      method: 'DELETE',
      url: '/api/v1/admin/settings/us2_setval.url/values',
      cookies: adminCookie,
    });
    expect(globalReset.statusCode).toBe(200);

    const globalRows = (await auditRows('us2_setval.url', 'setting.global_value_reset')).slice(
      globalResetsBefore,
    );
    expect(globalRows).toHaveLength(1);
    expect(globalRows[0]!.stateBefore).toEqual({
      settingCode: 'us2_setval.url',
      value: 'https://global.example',
      valueType: 'string',
      stored: true,
    });
    expect(globalRows[0]!.stateAfter).toEqual({ settingCode: 'us2_setval.url' });
  });

  it('a refused write audits nothing', async () => {
    const em = h.em();
    const setting = await em.findOneOrFail(Setting, { code: 'us2_setval.url' });
    const countRows = (): Promise<number> =>
      h.em().count(AuditLogEntry, { objectType: 'setting', objectId: setting.id });
    const before = await countRows();

    expect(await putValue({ scope: 'all', value: 42 })).toBe(400);
    expect(
      await putValue({ scope: 'subset', salesChannelCodes: ['no_such_channel'], value: 'x' }),
    ).toBe(400);
    expect(
      await putValue({
        scope: 'all',
        value: 'https://stale.example',
        expectedVersion: '2000-01-01T00:00:00.000Z',
      }),
    ).toBe(409);

    expect(await countRows()).toBe(before);
  });

  it('rejects empty subset with 400 SETTING_EMPTY_SUBSET', async () => {
    const r = await h.app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings/us2_setval.url/value',
      cookies: adminCookie,
      payload: { scope: 'subset', salesChannelCodes: [], value: 'x' },
    });
    // Zod's discriminated union with min(1) on the array surfaces as
    // VALIDATION_FAILED at the route boundary; the explicit
    // SETTING_EMPTY_SUBSET path runs when the request bypasses Zod (eg.
    // service-level callers). Accept either here.
    expect([400]).toContain(r.statusCode);
    const body = r.json() as { error: { code: string } };
    expect(
      [ERROR_CODES.SETTING_EMPTY_SUBSET, ERROR_CODES.VALIDATION_FAILED].includes(
        body.error.code as typeof ERROR_CODES.SETTING_EMPTY_SUBSET,
      ),
    ).toBe(true);
  });

  it('rejects an out-of-scope channel for a scoped setting (400 SETTING_OUT_OF_SCOPE_FOR_CHANNEL)', async () => {
    const r = await h.app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings/us2_setval.scoped_url/value',
      cookies: adminCookie,
      payload: {
        scope: 'subset',
        salesChannelCodes: ['pl_b2b_vip'],
        value: 'https://x.example',
      },
    });
    expect(r.statusCode).toBe(400);
    expect((r.json() as { error: { code: string } }).error.code).toBe(
      ERROR_CODES.SETTING_OUT_OF_SCOPE_FOR_CHANNEL,
    );
  });

  it('rejects a wrong-shape value (400 SETTING_VALUE_SHAPE_MISMATCH)', async () => {
    const r = await h.app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings/us2_setval.url/value',
      cookies: adminCookie,
      payload: { scope: 'all', value: 42 },
    });
    expect(r.statusCode).toBe(400);
    expect((r.json() as { error: { code: string } }).error.code).toBe(
      ERROR_CODES.SETTING_VALUE_SHAPE_MISMATCH,
    );
  });
});
