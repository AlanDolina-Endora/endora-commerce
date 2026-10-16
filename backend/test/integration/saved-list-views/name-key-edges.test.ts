import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EntityManager } from '@mikro-orm/postgresql';
import {
  createProductSavedViewRequestSchema,
  createQuoteRequestSavedViewRequestSchema,
  savedListViewNameKey,
} from '@endora-commerce/contracts';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { OrderListViewService } from '../../../../packages/modules/orders/src/backend/services/order-list-view-service.js';
import { ProductListViewService } from '../../../../packages/modules/catalog/src/backend/services/product-list-view-service.js';
import { QuoteRequestListViewService } from '../../../../packages/modules/quote_requests/src/backend/services/quote-request-list-view-service.js';

/**
 * `specs/147-saved-views/` QA — edge cases of the name key (FR-003, FR-022)
 * that the scenario table in `rules-parity.test.ts` does not reach: Polish
 * letters, the 160-character ceiling counted in multibyte letters, Unicode
 * whitespace at the edges, and a platform admin renaming into a name only the
 * caller owns. Run against every list's service.
 */

interface Actor {
  adminUserId: string;
  isPlatformAdmin: boolean;
}
interface Dto {
  id: string;
  name: string;
}
interface Svc {
  create(actor: Actor, input: Record<string, unknown>): Promise<Dto>;
  update(id: string, actor: Actor, patch: Record<string, unknown>): Promise<Dto>;
}

const make = (label: string, emFactory: () => EntityManager): Svc => {
  if (label === 'orders') return new OrderListViewService(emFactory) as unknown as Svc;
  if (label === 'catalog') return new ProductListViewService(emFactory) as unknown as Svc;
  return new QuoteRequestListViewService(emFactory) as unknown as Svc;
};

const LISTS = ['orders', 'catalog', 'quote_requests'];

describe('saved list views — name-key edge cases (spec 147 QA)', () => {
  let h: BackendServerHandle;
  const run = randomUUID().slice(0, 8);

  beforeAll(async () => {
    h = await setupBackendServer();
  });
  afterAll(async () => {
    await teardownBackendServer(h);
  });

  describe.each(LISTS)('%s', (label) => {
    let svc: Svc;
    const owner: Actor = { adminUserId: randomUUID(), isPlatformAdmin: false };
    const admin: Actor = { adminUserId: randomUUID(), isPlatformAdmin: true };
    const input = (name: string, shared = false): Record<string, unknown> => ({
      name,
      shared,
      filters: {},
      sort: { field: 'placedAt', dir: 'desc' },
    });
    beforeAll(() => {
      svc = make(label, () => h.em());
    });

    it('treats Polish capitals and small letters as one key (Ł vs ł)', async () => {
      await svc.create(owner, input(`Łódź ${run}`));
      await expect(svc.create(owner, input(`łÓDŹ ${run}`))).rejects.toMatchObject({ statusCode: 409 });
    });

    it('stores a 160-letter multibyte name and refuses its case twin', async () => {
      const name = `${'Ł'.repeat(150)}${run.slice(0, 5)}${'Z'.repeat(5)}`;
      expect(name.length).toBe(160);
      const created = await svc.create(owner, input(name));
      expect(created.name).toBe(name);
      await expect(svc.create(owner, input(name.toLowerCase()))).rejects.toMatchObject({ statusCode: 409 });
    });

    it('trims Unicode whitespace at the edges the way the contract does', async () => {
      const created = await svc.create(owner, input(` \t Nbsp ${run}　\n`));
      expect(created.name).toBe(`Nbsp ${run}`);
      await expect(svc.create(owner, input(`nbsp ${run}`))).rejects.toMatchObject({ statusCode: 409 });
    });

    it('lets a platform admin rename another owner\'s shared view to a name the admin owns', async () => {
      const mine = await svc.create(admin, input(`Admin owns ${run}`));
      const theirs = await svc.create(owner, input(`Theirs ${run}`, true));
      const renamed = await svc.update(theirs.id, admin, { name: mine.name.toUpperCase() });
      expect(renamed.name).toBe(mine.name.toUpperCase());
    });
  });

  it('JS savedListViewNameKey agrees with SQL lower(btrim()) on Polish and ASCII names', async () => {
    const samples = ['Łódź', 'ŁÓDŹ', 'żółć', 'ŻÓŁĆ', 'Zażółć gęślą jaźń', 'ĄĘŚĆŃ', 'Unpaid', 'UNPAID'];
    for (const s of samples) {
      const rows = (await h.em().execute('select lower(btrim(?)) as k', [s])) as Array<{ k: string }>;
      expect(savedListViewNameKey(s)).toBe(rows[0]?.k);
    }
  });

  it('contract schemas accept exactly 160 multibyte letters and a filter of exactly 8192 bytes', () => {
    const name = 'ł'.repeat(160);
    const pad = (n: number): Record<string, unknown> => ({ q: 'a'.repeat(n) });
    const base = JSON.stringify(pad(0)).length; // {"q":""}
    const exact = pad(8192 - base);
    expect(JSON.stringify(exact).length).toBe(8192);
    for (const schema of [createProductSavedViewRequestSchema, createQuoteRequestSavedViewRequestSchema]) {
      expect(schema.safeParse({ name, shared: false, filters: exact }).success).toBe(true);
      expect(schema.safeParse({ name, shared: false, filters: pad(8192 - base + 1) }).success).toBe(false);
      expect(schema.safeParse({ name: 'ł'.repeat(161), shared: false, filters: {} }).success).toBe(false);
      expect(schema.safeParse({ name: '  　', shared: false, filters: {} }).success).toBe(false);
    }
  });
});
