import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AdminRole,
  AdminUser,
  Organization,
  OrganizationSalesRepAssignment,
  PriceListMatrixEntry,
} from '../../helpers/package-entities.js';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { ADMIN_COOKIES } from '../../helpers/test-actors.js';
import { SEED_PRODUCT_101_ID } from '../../helpers/seed-catalog.js';

/**
 * Feature 148 / FR-024, SC-005 — a scoped administrator and the price matrix.
 *
 * A sales representative assigned to organization A sees entries that are not
 * organization-specific and entries naming A; an entry naming B does not exist
 * for them by any status code, body or count. They cannot create an entry for
 * B or move one to B — that answers exactly like an unknown organization — and
 * an overlap with an entry they cannot see does not name it.
 */
describe('price matrix — tenant scope (feature 148)', () => {
  let h: BackendServerHandle;
  const stamp = Date.now();
  const PLATFORM = { b2b_session: 'stub-admin-session' };
  const REP_SESSION = `stub-148-rep-${stamp}`;
  const REP = { b2b_session: REP_SESSION };
  const UNKNOWN_ORG = '00000000-0000-4000-8000-0000001480ff';
  let listId: string;
  let orgA: string;
  let orgB: string;
  let categoryId: string;
  let entryA: string;
  let entryB: string;
  let entryAll: string;

  const call = (
    cookies: Record<string, string>,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
  ) => h.app.inject({ method, url, cookies, ...(payload ? { payload } : {}) });
  const matrix = () => `/api/v1/admin/price-lists-engine/${listId}/matrix`;
  /** The refusal body without the per-request correlation id. */
  const refusal = (res: { json: () => unknown }): unknown => {
    const { error } = res.json() as { error: Record<string, unknown> };
    const { requestId: _requestId, ...rest } = error;
    return rest;
  };

  beforeAll(async () => {
    h = await setupBackendServer();
    const em = h.em();
    let repRole = await em.findOne(AdminRole, { code: 'sales_representative' });
    if (!repRole) {
      repRole = em.create(AdminRole, {
        code: 'sales_representative',
        name: 'Sales Representative',
        permissions: ['price_lists:read', 'price_lists:write'],
      });
    } else {
      repRole.permissions = Array.from(
        new Set([...repRole.permissions, 'price_lists:read', 'price_lists:write']),
      );
    }
    await em.persistAndFlush(repRole);

    const organization = (label: string) =>
      em.create(Organization, {
        name: `Feature 148 ${label}`,
        taxId: `PL148T${label}${String(stamp).slice(-7)}`,
        status: 'active',
        vatStatus: 'vat_payer',
        registeredAddress: { street: '-', city: '-', postalCode: '-', country: 'PL' },
      });
    const a = organization('A');
    const b = organization('B');
    await em.persistAndFlush([a, b]);
    orgA = a.id;
    orgB = b.id;

    const admin = (label: string) =>
      em.create(AdminUser, {
        email: `pl148-${label}-${stamp}@audit.local`,
        passwordHash: 'x'.repeat(60),
        adminRoleId: repRole!.id,
        firstName: 'Feature',
        lastName: label,
      });
    const rep = admin('rep');
    const otherRep = admin('other-rep');
    await em.persistAndFlush([rep, otherRep]);
    await em.persistAndFlush([
      em.create(OrganizationSalesRepAssignment, { organizationId: orgA, adminUserId: rep.id }),
      em.create(OrganizationSalesRepAssignment, { organizationId: orgB, adminUserId: otherRep.id }),
    ]);
    ADMIN_COOKIES[REP_SESSION] = { adminUserId: rep.id };

    const created = await call(PLATFORM, 'POST', '/api/v1/admin/price-lists-engine', {
      name: `Scope list ${stamp}`,
      type: 'base',
    });
    expect(created.statusCode).toBe(201);
    listId = (created.json() as { data: { id: string } }).data.id;
    const rows = await em
      .getConnection()
      .execute<Array<{ category_id: string }>>(
        `select category_id from product_categories where product_id = ?`,
        [SEED_PRODUCT_101_ID],
      );
    categoryId = rows[0]!.category_id;

    const make = async (organizationId: string | null, minQuantity: number) => {
      const res = await call(PLATFORM, 'POST', matrix(), {
        categoryId,
        organizationId,
        minQuantity,
        maxQuantity: minQuantity + 9,
        price: { type: 'discount_percent', percent: '5' },
      });
      expect(res.statusCode, res.body).toBe(201);
      return (res.json() as { data: { id: string } }).data.id;
    };
    entryA = await make(orgA, 1);
    entryB = await make(orgB, 1);
    entryAll = await make(null, 1);
  });

  afterAll(async () => {
    delete ADMIN_COOKIES[REP_SESSION];
    await h.em().nativeDelete(PriceListMatrixEntry, { priceListId: listId });
    await teardownBackendServer(h);
  });

  it('lists only entries that are not organization-specific or name an in-scope organization', async () => {
    const res = await call(REP, 'GET', matrix());
    expect(res.statusCode).toBe(200);
    const data = (res.json() as { data: { items: Array<{ id: string }>; total: number } }).data;
    expect(data.items.map((i) => i.id).sort()).toEqual([entryA, entryAll].sort());
    expect(data.total).toBe(2);
    const filtered = await call(REP, 'GET', `${matrix()}?organizationId=${orgB}`);
    expect((filtered.json() as { data: { total: number } }).data.total).toBe(0);
  });

  it('answers an out-of-scope entry exactly like a missing one', async () => {
    const missing = `${matrix()}/00000000-0000-4000-8000-0000001480ee`;
    for (const method of ['GET', 'PATCH', 'DELETE'] as const) {
      const payload = method === 'PATCH' ? { minQuantity: 2 } : undefined;
      const hidden = await call(REP, method, `${matrix()}/${entryB}`, payload);
      const absent = await call(REP, method, missing, payload);
      expect(hidden.statusCode).toBe(404);
      expect(refusal(hidden)).toEqual(refusal(absent));
    }
    // The platform administrator still sees it.
    expect((await call(PLATFORM, 'GET', `${matrix()}/${entryB}`)).statusCode).toBe(200);
  });

  it('refuses creating or moving an entry to an out-of-scope organization like an unknown one', async () => {
    const body = (organizationId: string) => ({
      categoryId,
      organizationId,
      minQuantity: 100,
      price: { type: 'discount_percent', percent: '5' },
    });
    const outOfScope = await call(REP, 'POST', matrix(), body(orgB));
    const unknown = await call(REP, 'POST', matrix(), body(UNKNOWN_ORG));
    expect(outOfScope.statusCode).toBe(400);
    expect(refusal(outOfScope)).toEqual(refusal(unknown));

    const moved = await call(REP, 'PATCH', `${matrix()}/${entryA}`, { organizationId: orgB });
    expect(moved.statusCode).toBe(400);
    expect(refusal(moved)).toMatchObject({ code: 'VALIDATION_FAILED' });

    const ok = await call(REP, 'POST', matrix(), body(orgA));
    expect(ok.statusCode).toBe(201);
  });

  /**
   * An overlap needs equal coordinates, the organization included, and a write
   * naming an out-of-scope organization is refused before the overlap check —
   * so a representative can only ever collide with an entry they can see. The
   * service still omits `conflictingEntryId` for an invisible one, as a
   * defence that this case documents rather than reaches.
   */
  it('names an overlapping entry the caller can see', async () => {
    const conflict = await call(REP, 'POST', matrix(), {
      categoryId,
      minQuantity: 5,
      price: { type: 'discount_percent', percent: '1' },
    });
    expect(conflict.statusCode).toBe(409);
    expect(refusal(conflict)).toMatchObject({
      code: 'PRICE_MATRIX_ENTRY_OVERLAP',
      details: { conflictingEntryId: entryAll },
    });
  });
});
