import { describe, expect, it } from 'vitest';
import {
  AdminSearchCapabilitySchema,
  AdminSearchConfigurationViewSchema,
  AdminSearchEntityTypeSchema,
  AdminSearchFieldCodeSchema,
  AdminSearchHitSchema,
  AdminSearchQuerySchema,
  AdminSearchResponseSchema,
  AdminSearchStoredConfigurationSchema,
  UpdateAdminSearchConfigurationRequestSchema,
} from './admin-search.js';

// `specs/150-admin-global-search/contracts/admin-search-api.md` — the schemas
// written first (Principle II); every route and the shell parse with them.

describe('AdminSearchEntityTypeSchema', () => {
  it.each(['orders.order', 'quote_requests.quote_request', 'catalog.product'])('accepts %s', (v) => {
    expect(AdminSearchEntityTypeSchema.safeParse(v).success).toBe(true);
  });
  it.each(['orders', 'Orders.order', 'orders.Order', 'orders.order.x', '.order', 'orders-x.order'])(
    'refuses %s',
    (v) => {
      expect(AdminSearchEntityTypeSchema.safeParse(v).success).toBe(false);
    },
  );
});

describe('AdminSearchFieldCodeSchema', () => {
  it.each(['number', 'organizationName', 'billingTaxId', 'sku'])('accepts %s', (v) => {
    expect(AdminSearchFieldCodeSchema.safeParse(v).success).toBe(true);
  });
  it.each(['Number', 'organization_name', 'org-name', '', 'a'.repeat(41)])('refuses %j', (v) => {
    expect(AdminSearchFieldCodeSchema.safeParse(v).success).toBe(false);
  });
});

describe('AdminSearchQuerySchema', () => {
  it('accepts a plain query and splits entityTypes on commas', () => {
    const parsed = AdminSearchQuerySchema.parse({
      q: 'acme',
      entityTypes: 'orders.order,crm.opportunity,',
      limit: '5',
      language: 'pl',
    });
    expect(parsed).toEqual({
      q: 'acme',
      entityTypes: ['orders.order', 'crm.opportunity'],
      limit: 5,
      language: 'pl',
    });
  });

  it('leaves entityTypes undefined when absent or empty', () => {
    expect(AdminSearchQuerySchema.parse({ q: 'x', language: 'en' }).entityTypes).toBeUndefined();
    expect(
      AdminSearchQuerySchema.parse({ q: 'x', entityTypes: '', language: 'en' }).entityTypes,
    ).toBeUndefined();
  });

  it('refuses a text longer than 100 characters', () => {
    expect(AdminSearchQuerySchema.safeParse({ q: 'a'.repeat(101), language: 'en' }).success).toBe(
      false,
    );
    expect(AdminSearchQuerySchema.safeParse({ q: 'a'.repeat(100), language: 'en' }).success).toBe(
      true,
    );
  });

  it('refuses a limit outside 1..25 and a malformed entity type', () => {
    expect(AdminSearchQuerySchema.safeParse({ q: 'x', limit: '26', language: 'en' }).success).toBe(
      false,
    );
    expect(AdminSearchQuerySchema.safeParse({ q: 'x', limit: '0', language: 'en' }).success).toBe(
      false,
    );
    expect(
      AdminSearchQuerySchema.safeParse({ q: 'x', entityTypes: 'Orders', language: 'en' }).success,
    ).toBe(false);
  });

  it('refuses an unsupported language', () => {
    expect(AdminSearchQuerySchema.safeParse({ q: 'x', language: 'de' }).success).toBe(false);
  });
});

describe('AdminSearchHitSchema.targetRoute', () => {
  const hit = (targetRoute: string) => ({
    id: '1',
    title: 'T',
    subtitle: null,
    status: null,
    targetRoute,
  });
  it.each(['/orders/0b8f', '/catalog/categories?focus=abc-1', '/crm/opportunities/x'])(
    'accepts %s',
    (route) => {
      expect(AdminSearchHitSchema.safeParse(hit(route)).success).toBe(true);
    },
  );
  it.each(['https://evil.example/x', '//evil.example/x', 'orders/1', 'javascript:alert(1)'])(
    'refuses %s',
    (route) => {
      expect(AdminSearchHitSchema.safeParse(hit(route)).success).toBe(false);
    },
  );
});

describe('AdminSearchResponseSchema', () => {
  it('accepts a response with an ok and a timed-out group', () => {
    const body = {
      data: {
        query: 'acme',
        groups: [
          {
            entityType: 'orders.order',
            label: 'Orders',
            icon: 'Receipt',
            status: 'ok',
            hits: [
              {
                id: 'o1',
                title: 'ZAM/1',
                subtitle: 'ACME · 2026-10-01',
                status: { code: 'placed', label: 'Placed' },
                targetRoute: '/orders/o1',
              },
            ],
            hasMore: true,
          },
          {
            entityType: 'crm.opportunity',
            label: 'Sales opportunities',
            icon: 'CircleDollarSign',
            status: 'timed_out',
            hits: [],
            hasMore: false,
          },
        ],
      },
      meta: { belowMinimumLength: false, minimumQueryLength: 3, limit: 5, tookMs: 12 },
    };
    expect(AdminSearchResponseSchema.safeParse(body).success).toBe(true);
  });

  it('refuses an unknown group status and an icon outside the allowlist', () => {
    const base = {
      entityType: 'orders.order',
      label: 'Orders',
      icon: 'Receipt',
      status: 'ok',
      hits: [],
      hasMore: false,
    };
    const wrap = (group: object) => ({
      data: { query: 'x', groups: [group] },
      meta: { belowMinimumLength: false, minimumQueryLength: 3, limit: 5, tookMs: 0 },
    });
    expect(AdminSearchResponseSchema.safeParse(wrap({ ...base, status: 'boom' })).success).toBe(
      false,
    );
    expect(AdminSearchResponseSchema.safeParse(wrap({ ...base, icon: 'NotAnIcon' })).success).toBe(
      false,
    );
  });
});

describe('AdminSearchCapabilitySchema', () => {
  it('accepts the capability and refuses an out-of-range minimum', () => {
    const ok = {
      minimumQueryLength: 3,
      resultsPerEntity: 5,
      entityTypes: [{ entityType: 'orders.order', label: 'Orders', icon: 'Receipt' }],
    };
    expect(AdminSearchCapabilitySchema.safeParse(ok).success).toBe(true);
    expect(AdminSearchCapabilitySchema.safeParse({ ...ok, minimumQueryLength: 1 }).success).toBe(
      false,
    );
    expect(AdminSearchCapabilitySchema.safeParse({ ...ok, resultsPerEntity: 11 }).success).toBe(
      false,
    );
  });
});

describe('AdminSearchConfigurationViewSchema', () => {
  it('accepts a view', () => {
    const view = {
      version: '',
      minimumQueryLength: 3,
      resultsPerEntity: 5,
      entities: [
        {
          entityType: 'orders.order',
          label: 'Orders',
          icon: 'Receipt',
          enabled: true,
          customized: false,
          fields: [{ code: 'number', label: 'Order number', selected: true, defaultSelected: true }],
        },
      ],
    };
    expect(AdminSearchConfigurationViewSchema.safeParse(view).success).toBe(true);
  });
});

describe('UpdateAdminSearchConfigurationRequestSchema', () => {
  it('accepts a full entry and a restore-defaults entry', () => {
    expect(
      UpdateAdminSearchConfigurationRequestSchema.safeParse({
        expectedVersion: null,
        entities: [
          { entityType: 'orders.order', enabled: true, fields: ['number'] },
          { entityType: 'catalog.category' },
        ],
      }).success,
    ).toBe(true);
  });

  it('refuses more than 20 fields and a malformed code', () => {
    expect(
      UpdateAdminSearchConfigurationRequestSchema.safeParse({
        expectedVersion: 'v1',
        entities: [
          {
            entityType: 'orders.order',
            enabled: true,
            fields: Array.from({ length: 21 }, (_, i) => `f${i}`),
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      UpdateAdminSearchConfigurationRequestSchema.safeParse({
        expectedVersion: 'v1',
        entities: [{ entityType: 'orders.order', enabled: true, fields: ['bad_code'] }],
      }).success,
    ).toBe(false);
  });
});

describe('AdminSearchStoredConfigurationSchema', () => {
  it('accepts the default value and a customised entry', () => {
    expect(AdminSearchStoredConfigurationSchema.safeParse({ version: 1, entities: {} }).success).toBe(
      true,
    );
    expect(
      AdminSearchStoredConfigurationSchema.safeParse({
        version: 1,
        entities: { 'orders.order': { enabled: false, fields: ['number'] } },
      }).success,
    ).toBe(true);
  });

  it('refuses another version, a malformed entity type, and more than 20 fields', () => {
    expect(AdminSearchStoredConfigurationSchema.safeParse({ version: 2, entities: {} }).success).toBe(
      false,
    );
    expect(
      AdminSearchStoredConfigurationSchema.safeParse({
        version: 1,
        entities: { Orders: { enabled: true, fields: ['number'] } },
      }).success,
    ).toBe(false);
    expect(
      AdminSearchStoredConfigurationSchema.safeParse({
        version: 1,
        entities: {
          'orders.order': { enabled: true, fields: Array.from({ length: 21 }, (_, i) => `f${i}`) },
        },
      }).success,
    ).toBe(false);
  });

  it('refuses more than 64 entity types', () => {
    const entities = Object.fromEntries(
      Array.from({ length: 65 }, (_, i) => [`m${i}.thing`, { enabled: true, fields: ['a'] }]),
    );
    expect(AdminSearchStoredConfigurationSchema.safeParse({ version: 1, entities }).success).toBe(
      false,
    );
  });
});
