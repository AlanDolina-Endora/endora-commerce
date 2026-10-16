import { describe, expect, it } from 'vitest';
import {
  buildPricedProductIdsQuery,
  buildUnitPriceMergeQuery,
  compareDecimalStrings,
  compareOrderRows,
  type UnitPriceStream,
} from './unit-price-ordering.js';

/**
 * The three shapes research §R4 measured, asserted on the statement the builder
 * produces.
 *
 * This test pins the *shape*; `test/perf/catalog/price-sort-cost.bench.ts` pins
 * the *cost*, with `explain (analyze, buffers)` output for each. Both are needed:
 * the plan measurement runs only under `PERF_RUN=true` against a corpus, and a
 * shape regression that costs 160× throughput should not wait for somebody to
 * run a benchmark.
 */

const streams: UnitPriceStream[] = [
  { priceListId: 'aaaaaaaa-0000-4000-8000-000000000001', isSale: false, productIds: null },
  { priceListId: 'bbbbbbbb-0000-4000-8000-000000000002', isSale: false, productIds: null },
  { priceListId: 'cccccccc-0000-4000-8000-000000000003', isSale: false, productIds: null },
];

function build(overrides: Partial<Parameters<typeof buildUnitPriceMergeQuery>[0]> = {}) {
  return buildUnitPriceMergeQuery({
    streams,
    currencyCode: 'PLN',
    direction: 'asc',
    after: null,
    perStreamLimit: 50,
    watermark: null,
    ...overrides,
  });
}

describe('unit-price ordering query', () => {
  it('writes the exclusion as a scalar subquery with its own limit, never as `not exists`', () => {
    // Finding 1: `not exists` is a sublink the planner may pull up into a hash
    // anti-join, which materialises the branch — 208 ms and 150 385 buffers,
    // against 0.69 ms for this form.
    const { sql } = build();
    expect(sql).not.toMatch(/not\s+exists/i);
    expect(sql).toContain('limit 1) is null');
    // Stream 0 excludes nothing, stream 1 excludes one, stream 2 excludes two.
    expect(sql.match(/limit 1\) is null/g)).toHaveLength(3);
  });

  it('bounds every stream after the leading one by the watermark, and never the leading one', () => {
    // Finding 2: a fully shadowed branch scans its whole list to discover it
    // yields nothing — 50 000 probes, 179 ms. The bound takes it to 213 probes.
    const { sql, params } = build({ watermark: '99.5000' });
    const branches = sql.split('union all');
    expect(branches).toHaveLength(3);
    expect(branches[0]).not.toContain('<= ?::numeric');
    expect(branches[1]).toContain('b."amount" <= ?::numeric');
    expect(branches[2]).toContain('b."amount" <= ?::numeric');
    expect(params.filter((p) => p === '99.5000')).toHaveLength(2);
  });

  it('reverses the watermark comparison with the direction', () => {
    const { sql } = build({ direction: 'desc', watermark: '10.0000' });
    expect(sql.split('union all')[1]).toContain('b."amount" >= ?::numeric');
    expect(sql).toContain('order by t."amount" desc, t."product_id" desc');
  });

  it('asks the planner for nothing — no hint, no session setting', () => {
    // Finding 3: the identical query planned as a streaming merge at 202 000
    // bracket rows and as bitmap scans plus a sort at 1 687 000. The watermark
    // is what makes the streaming plan the planner's own choice again. A design
    // that needs `enable_hashjoin = off` to be fast is not a design.
    const { sql } = build({ watermark: '99.5000' });
    expect(sql).not.toMatch(/enable_\w+/);
    expect(sql).not.toMatch(/\bset\b/i);
    expect(sql).not.toMatch(/materialized/i);
  });

  it('scans the partial index: equality on list and currency, quantity fixed at one', () => {
    const { sql } = build();
    expect(sql).toContain('b."price_list_id" = ?');
    expect(sql).toContain('b."currency_code" = ?');
    expect(sql).toContain('b."min_quantity" = 1');
    expect(sql).toContain('order by b."amount" asc, b."product_id" asc');
  });

  it('resumes from a keyset over (amount, product id), as a row comparison', () => {
    const { sql, params } = build({ after: { amount: '12.3400', productId: 'p1' } });
    expect(sql).toContain('(b."amount", b."product_id") > (?::numeric, ?::uuid)');
    expect(params).toContain('12.3400');
    const { sql: desc } = build({ direction: 'desc', after: { amount: '1', productId: 'p' } });
    expect(desc).toContain('(b."amount", b."product_id") < (?::numeric, ?::uuid)');
  });

  it('passes a restriction as one array parameter rather than a placeholder per id', () => {
    const { sql, params } = build({
      streams: [{ priceListId: 'l1', isSale: false, productIds: ['p1', 'p2'] }],
    });
    expect(sql).toContain('b."product_id" = any(?::uuid[])');
    expect(params).toContain('{p1,p2}');
  });

  it('emits no branch for a stream the caller already read, but still excludes against it', () => {
    const { sql } = build({ skipStreams: 1, watermark: '5.0000' });
    expect(sql.split('union all')).toHaveLength(2);
    // Stream 1 excludes stream 0, stream 2 excludes streams 0 and 1: three in all.
    expect(sql.match(/limit 1\) is null/g)).toHaveLength(3);
  });

  it('orders the two halves of the merge by decimal value, never by a float', () => {
    // `numeric(14,4)` carries eighteen significant digits and a double carries
    // fifteen, so two amounts a shop can charge compare equal after `Number()`.
    const a = '99999999999999.9998';
    const b = '99999999999999.9999';
    expect(Number(a) === Number(b)).toBe(true);
    expect(compareDecimalStrings(a, b)).toBe(-1);
    expect(compareDecimalStrings('9.0000', '10.0000')).toBe(-1);
    expect(compareDecimalStrings('10.0000', '10.00')).toBe(0);
    expect(
      compareOrderRows({ amount: '9.0000', productId: 'b' }, { amount: '9.0000', productId: 'a' }, 'asc'),
    ).toBe(1);
    expect(
      compareOrderRows({ amount: '9.0000', productId: 'b' }, { amount: '9.0000', productId: 'a' }, 'desc'),
    ).toBe(-1);
  });
});

/**
 * Feature 148, owner decision Q1 — a candidate list carrying price matrix
 * entries the viewer meets at quantity 1 is a *matrix stream*: its rows are a
 * derived relation (the list's own quantity-1 brackets and one branch per
 * entry, reduced per product by the resolver's precedence key), and "this list
 * prices the product" — what later streams exclude against — is a predicate
 * over the same facts. A stream without entries keeps today's shape.
 */
describe('unit-price ordering query — matrix streams', () => {
  const DEFAULT_LIST = 'dddddddd-0000-4000-8000-00000000000d';
  const matrixStream: UnitPriceStream = {
    priceListId: 'aaaaaaaa-0000-4000-8000-000000000001',
    isSale: false,
    productIds: null,
    matrix: {
      defaultListId: DEFAULT_LIST,
      entries: [
        {
          id: 'e1',
          orgRank: 0,
          specificity: 1,
          productIds: ['p1', 'p2'],
          priceType: 'discount_percent',
          amount: null,
          discountPercent: '12.00',
        },
        {
          id: 'e2',
          orgRank: 0,
          specificity: 4,
          productIds: ['p3'],
          priceType: 'fixed',
          amount: '9.5000',
          discountPercent: null,
        },
        {
          id: 'e3',
          orgRank: 1,
          specificity: 0,
          productIds: null,
          priceType: 'discount_percent',
          amount: null,
          discountPercent: '5.00',
        },
      ],
    },
  };
  const plain: UnitPriceStream = {
    priceListId: 'bbbbbbbb-0000-4000-8000-000000000002',
    isSale: false,
    productIds: null,
  };

  function buildWith(list: UnitPriceStream[], overrides: Partial<Parameters<typeof buildUnitPriceMergeQuery>[0]> = {}) {
    return buildUnitPriceMergeQuery({
      streams: list,
      currencyCode: 'PLN',
      direction: 'asc',
      after: null,
      perStreamLimit: 50,
      watermark: null,
      ...overrides,
    });
  }

  it('leaves a stream without entries byte-identical', () => {
    const today = buildWith([plain, { ...plain, priceListId: 'cccccccc-0000-4000-8000-000000000003' }]);
    const withEmpty = buildWith([
      { ...plain, matrix: undefined },
      { ...plain, priceListId: 'cccccccc-0000-4000-8000-000000000003' },
    ]);
    expect(withEmpty).toEqual(today);
  });

  it('reads a matrix stream from a derived relation reduced per product by the precedence key', () => {
    const { sql, params } = buildWith([matrixStream]);
    const branch = sql.split('union all\n    (select')[0]!;
    expect(branch).toContain('select distinct on (c."product_id")');
    expect(branch).toContain('order by c."product_id", c."org_rank" asc, c."specificity" desc, c."amount" asc, c."entry_id" collate "C" asc');
    expect(branch).toContain('c."amount" is not null');
    // The own quantity-1 brackets are one of the candidates.
    expect(sql).toContain('o."min_quantity" = 1');
    // Each entry covers its selection's ids, or every referenced product for "all products".
    expect(params).toContain('{p1,p2}');
    expect(params).toContain('{p3}');
    expect(params).toContain(DEFAULT_LIST);
    // A percentage is priced off the own bracket, else the Default one,
    // rounded half-up in integer ten-thousandths — never a float, never a
    // numeric division.
    expect(sql).toContain('coalesce((select own."amount" from "price_list_price_brackets" own');
    expect(sql).not.toMatch(/left join/i);
    expect(sql).toMatch(/div\(.*\+ 5000, 10000\) \* 0\.0001/);
    expect(sql).not.toMatch(/\/\s*100\b/);
  });

  it('excludes a later stream against what the matrix stream prices', () => {
    const { sql, params } = buildWith([matrixStream, plain]);
    const later = sql.split('union all').pop()!;
    expect(later).toContain('not (');
    expect(later).toContain('b."product_id" = any(?::uuid[])');
    expect(params).toContain('{p3}');
  });

  it('applies the keyset, the amount range and the watermark to the derived amount', () => {
    const { sql } = buildWith([plain, matrixStream], {
      after: { amount: '1.0000', productId: 'p0' },
      amountRange: { min: '2', max: '90' },
      watermark: '50.0000',
    });
    const matrixBranch = sql.split('union all').slice(-1)[0]!;
    expect(sql).toContain('(b."amount", b."product_id") > (?::numeric, ?::uuid)');
    expect(sql).toContain('b."amount" >= ?::numeric');
    expect(sql).toContain('b."amount" <= ?::numeric');
    expect(matrixBranch.length).toBeGreaterThan(0);
  });

  it('answers pricedProductIds through the same predicate, one statement', () => {
    const { sql, params } = buildPricedProductIdsQuery({
      streams: [matrixStream, plain],
      currencyCode: 'PLN',
      productIds: ['p1', 'p9'],
    });
    expect(sql.match(/\bselect\b/gi)!.length).toBeGreaterThan(1);
    expect(sql).toContain('unnest(?::uuid[])');
    expect(params).toContain('{p1,p9}');
  });
});

