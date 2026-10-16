/**
 * The SQL behind {@link ListingPriceOrderPort} (feature 086, research §R4): the
 * resolved unit price as a **merge of index-ordered streams**, one per
 * candidate price list, each stream after the leading one carrying an exclusion
 * and an amount watermark.
 *
 * Everything here is a pure builder, so the three shapes the measurements
 * forced can be asserted by a unit test on the text and demonstrated by an
 * `explain` in the perf bench, instead of being re-derived by the next reader.
 *
 * ## The three shapes, and what each costs when it is written the other way
 *
 * **1. The exclusion is a scalar subquery carrying its own `LIMIT 1` — never
 * `not exists`.** `not exists` is a sublink the planner may pull up into a hash
 * anti-join, which materialises the whole branch before one row can leave it:
 * measured at 208 ms and 150 385 buffers, against **0.69 ms** for the scalar
 * form at the same scale. A scalar subquery with a `LIMIT` cannot be pulled up,
 * so the branch stays a filtered index-only scan in amount order and the merge
 * streams. Same semantics; the difference is structural, not a planner hint.
 *
 * **2. Every stream after the leading one is bounded by the leading stream's
 * amount watermark.** A branch whose every product is priced by a
 * higher-priority branch yields nothing and discovers that by scanning its whole
 * list — 50 000 exclusion probes, 179 ms. That is not an exotic configuration:
 * the ordinary anonymous `[channel list, default list]` vector hits it whenever
 * the channel list prices the assortment, and the "one negotiated list per
 * customer, covering everything" shape hits it hardest. With the bound the same
 * case is **213 probes and 2.88 ms**.
 *
 * The bound is exact rather than approximate, and the argument is one line: the
 * leading stream has no exclusion, so if it returned a full window of `limit`
 * rows all at or below the watermark, then any row above the watermark sorts
 * after all of them and cannot be among the first `limit` rows of the merge.
 * When the leading stream came back short there is no watermark and no bound.
 *
 * **3. Nothing here asks the planner for a plan.** The identical query planned
 * as a streaming merge at 202 000 bracket rows and as bitmap scans plus a sort
 * at 1 687 000, costing 390 ms and 961 ms. The watermark is what makes the
 * streaming plan the planner's own choice again, because `amount <= ?` on the
 * ordering column of a partial covering index is something it can cost. A design
 * that needs `enable_hashjoin = off` to be fast is not a design.
 */

/** One candidate price list, as a stream of the merge. */
export interface UnitPriceStream {
  priceListId: string;
  isSale: boolean;
  /**
   * Product ids this stream is restricted to, or `null` for no restriction.
   *
   * Two things narrow it: the caller's opaque `restrictToProductIds`, and the
   * category memberships a candidate's rule requires. Both are already resolved
   * to ids by the time they reach here — this file knows nothing about
   * categories.
   */
  productIds: readonly string[] | null;
  /**
   * Feature 148, owner decision Q1 — the price matrix entries of this stream's
   * list that the viewer meets at quantity 1. Present only when there is at
   * least one; a stream without it keeps the index-ordered bracket shape above
   * byte for byte.
   */
  matrix?: UnitPriceMatrix | undefined;
}

/**
 * One viewer-applicable quantity-1 matrix entry, with its selection already
 * resolved to product ids by the caller (this file knows nothing about
 * categories or attributes).
 */
export interface UnitPriceMatrixEntry {
  id: string;
  /** Nearest-first index in the viewer's organization chain; large for "all buyers". */
  orgRank: number;
  /** product 4, category ∩ attribute 3, attribute 2, category 1, all 0. */
  specificity: number;
  /** The products the selection covers, or `null` for every product. */
  productIds: readonly string[] | null;
  priceType: 'fixed' | 'discount_percent';
  amount: string | null;
  discountPercent: string | null;
}

export interface UnitPriceMatrix {
  /** The system Default list — the percentage reference of last resort. */
  defaultListId: string;
  entries: readonly UnitPriceMatrixEntry[];
}

/** The rank of the list's own bracket: not organization-specific (research R8). */
export const OWN_BRACKET_RANK = 2147483647;

export interface UnitPriceQueryInput {
  streams: readonly UnitPriceStream[];
  currencyCode: string;
  direction: 'asc' | 'desc';
  /** Keyset resume point over `(amount, productId)`, or `null` to start. */
  after: { amount: string; productId: string } | null;
  amountRange?: { min?: string; max?: string } | undefined;
  /** How many rows each individual stream may return. */
  perStreamLimit: number;
  /**
   * The leading stream's watermark. Applied to every stream **except** index 0,
   * which is the stream that produced it. `null` means the leading stream came
   * back short, so there is nothing to bound against.
   */
  watermark: string | null;
  /**
   * Emit no branch for the first `skipStreams` streams, while still excluding
   * against them.
   *
   * The caller already has the leading stream's rows — the probe that fixed the
   * watermark returned them — so re-reading them would be a second scan of the
   * one stream the design most wants read once.
   */
  skipStreams?: number | undefined;
}

export interface BuiltQuery {
  sql: string;
  params: unknown[];
}

/** A Postgres array literal — `= any('{a,b}'::uuid[])` rather than an `in (?,…)`. */
export function uuidArrayLiteral(ids: readonly string[]): string {
  return `{${ids.join(',')}}`;
}

/**
 * The merge over `input.streams`, as one statement.
 *
 * Stream `i` excludes every product priced by streams `0..i-1`, which is FR-031's
 * fall-through: the first candidate in priority order that prices a product is
 * the one that answers for it.
 */
export function buildUnitPriceMergeQuery(input: UnitPriceQueryInput): BuiltQuery {
  const params: unknown[] = [];
  const skip = input.skipStreams ?? 0;
  const branches = input.streams
    .map((stream, index) => ({ stream, index }))
    .filter(({ index }) => index >= skip)
    .map(({ stream, index }) => buildStreamSelect(input, stream, index, params));
  const dir = input.direction === 'asc' ? 'asc' : 'desc';
  const sql =
    `select t."product_id"::text as product_id, t."amount"::text as amount, t."stream_index"\n` +
    `  from (\n${branches.join('\n    union all\n')}\n  ) t\n` +
    ` order by t."amount" ${dir}, t."product_id" ${dir}`;
  return { sql, params };
}

function buildStreamSelect(
  input: UnitPriceQueryInput,
  stream: UnitPriceStream,
  index: number,
  params: unknown[],
): string {
  const dir = input.direction === 'asc' ? 'asc' : 'desc';
  const clauses: string[] = [];
  let source = `"price_list_price_brackets" b`;
  if (stream.matrix && stream.matrix.entries.length > 0) {
    // Feature 148 — the derived relation replaces the bracket scan. Its
    // parameters come first because it comes first in the statement.
    source = `${matrixRelationSql(stream, stream.matrix, input.currencyCode, params)} b`;
  } else {
    clauses.push(
      `b."price_list_id" = ?`,
      `b."currency_code" = ?`,
      // The quantity-1 equality, not a `distinct on` and not a window function:
      // `check (min_quantity >= 1)` makes `min_quantity <= 1` mean exactly this,
      // which is what a partial index can be built on.
      `b."min_quantity" = 1`,
    );
    params.push(stream.priceListId, input.currencyCode);
  }

  if (stream.productIds !== null) {
    clauses.push(`b."product_id" = any(?::uuid[])`);
    params.push(uuidArrayLiteral(stream.productIds));
  }

  if (input.after) {
    clauses.push(
      `(b."amount", b."product_id") ${input.direction === 'asc' ? '>' : '<'} (?::numeric, ?::uuid)`,
    );
    params.push(input.after.amount, input.after.productId);
  }

  if (input.amountRange?.min !== undefined) {
    clauses.push(`b."amount" >= ?::numeric`);
    params.push(input.amountRange.min);
  }
  if (input.amountRange?.max !== undefined) {
    clauses.push(`b."amount" <= ?::numeric`);
    params.push(input.amountRange.max);
  }

  // Shape 2 — the watermark. Never on the stream that produced it.
  if (index > 0 && input.watermark !== null) {
    clauses.push(`b."amount" ${input.direction === 'asc' ? '<=' : '>='} ?::numeric`);
    params.push(input.watermark);
  }

  // Shape 1 — one scalar subquery per higher-priority stream, each with its own
  // `limit 1`. Written as `not exists` this is the 208 ms row of the table in
  // the header.
  for (let j = 0; j < index; j += 1) {
    const earlier = input.streams[j]!;
    if (earlier.matrix && earlier.matrix.entries.length > 0) {
      // Feature 148 — what a matrix stream prices is a predicate, probed with
      // the same indexed scalar subqueries as the plain exclusion.
      clauses.push(`not (${streamPricesSql(earlier, input.currencyCode, `b."product_id"`, `x${j}`, params)})`);
      continue;
    }
    const alias = `x${j}`;
    const earlierClauses = [
      `${alias}."price_list_id" = ?`,
      `${alias}."currency_code" = ?`,
      `${alias}."min_quantity" = 1`,
      `${alias}."product_id" = b."product_id"`,
    ];
    params.push(earlier.priceListId, input.currencyCode);
    if (earlier.productIds !== null) {
      earlierClauses.push(`${alias}."product_id" = any(?::uuid[])`);
      params.push(uuidArrayLiteral(earlier.productIds));
    }
    clauses.push(
      `(select 1 from "price_list_price_brackets" ${alias}\n` +
        `        where ${earlierClauses.join('\n          and ')}\n` +
        `        limit 1) is null`,
    );
  }

  params.push(input.perStreamLimit);
  return (
    `    (select b."product_id", b."amount", ${index} as stream_index\n` +
    `       from ${source}\n` +
    `      where ${clauses.length > 0 ? clauses.join('\n        and ') : 'true'}\n` +
    `      order by b."amount" ${dir}, b."product_id" ${dir}\n` +
    `      limit ?)`
  );
}

/**
 * A percentage price in SQL, exactly as `applyDiscountPercent` computes it in
 * TypeScript: the reference in ten-thousandths times the kept hundredths of a
 * percent, plus half the divisor, integer-divided by 10 000, back to four
 * digits by a multiplication. No numeric division and no float, so the sort
 * and the card can never disagree by a rounding.
 */
function percentAmountSql(referenceSql: string, percentPlaceholder: string): string {
  return (
    `(div((${referenceSql}) * 10000 * (10000 - ${percentPlaceholder} * 100) + 5000, 10000) * 0.0001)`
  );
}

/**
 * Feature 148 — the derived relation of a matrix stream: one row per product
 * the list prices at quantity 1, at the amount `resolveListCandidate` answers.
 * Candidates are the own quantity-1 bracket and one branch per entry; `distinct
 * on` keeps the first by the resolver's precedence key (organization rank,
 * specificity, amount, entry id with the own bracket first); a percentage with
 * no reference has no amount and drops out, as the resolver skips it.
 */
function matrixRelationSql(
  stream: UnitPriceStream,
  matrix: UnitPriceMatrix,
  currencyCode: string,
  params: unknown[],
): string {
  const branches: string[] = [];
  branches.push(
    `select o."product_id", o."amount", ${OWN_BRACKET_RANK}::int as "org_rank", 4::int as "specificity", ''::text as "entry_id"\n` +
      `           from "price_list_price_brackets" o\n` +
      `          where o."price_list_id" = ? and o."currency_code" = ? and o."min_quantity" = 1`,
  );
  params.push(stream.priceListId, currencyCode);

  // The reference is read with two correlated scalar subqueries, never a join:
  // a join over a freshly written, unanalysed bracket table was measured
  // planning as a nested loop with a join *filter* — 2 000 × 2 000 rows, 800 ms
  // — where the scalar form is an index probe per product whatever the
  // statistics say. The same reasoning as shape 1 in this file's header.
  const reference = (alias: string): string =>
    `(select ${alias}."amount" from "price_list_price_brackets" ${alias}` +
    ` where ${alias}."price_list_id" = ? and ${alias}."product_id" = s."id"` +
    ` and ${alias}."currency_code" = ? and ${alias}."min_quantity" = 1 limit 1)`;

  for (const entry of matrix.entries) {
    if (entry.priceType === 'fixed') {
      if (entry.productIds === null || entry.amount === null) continue; // refused by the schema
      branches.push(
        `select s."id" as "product_id", ?::numeric as "amount", ?::int as "org_rank", ?::int as "specificity", ?::text as "entry_id"\n` +
          `           from unnest(?::uuid[]) as s("id")`,
      );
      params.push(entry.amount, entry.orgRank, entry.specificity, entry.id, uuidArrayLiteral(entry.productIds));
      continue;
    }
    // A percentage: every covered product with a reference.
    const covered =
      entry.productIds === null
        ? `(select distinct r."product_id" as "id" from "price_list_price_brackets" r` +
          ` where r."price_list_id" in (?, ?) and r."currency_code" = ? and r."min_quantity" = 1)`
        : `unnest(?::uuid[])`;
    branches.push(
      `select s."id" as "product_id",` +
        ` ${percentAmountSql(`coalesce(${reference('own')}, ${reference('def')})`, '?::numeric')} as "amount",` +
        ` ?::int as "org_rank", ?::int as "specificity", ?::text as "entry_id"\n` +
        `           from ${covered} as s("id")`,
    );
    // Parameter order follows the text: the two references inside the amount
    // expression, the percentage, the three ranking literals, the covered set.
    params.push(stream.priceListId, currencyCode, matrix.defaultListId, currencyCode);
    params.push(entry.discountPercent, entry.orgRank, entry.specificity, entry.id);
    if (entry.productIds === null) params.push(stream.priceListId, matrix.defaultListId, currencyCode);
    else params.push(uuidArrayLiteral(entry.productIds));
  }

  return (
    `(select distinct on (c."product_id") c."product_id", c."amount"\n` +
    `         from (\n          ${branches.join('\n          union all\n          ')}\n         ) c\n` +
    `        where c."amount" is not null\n` +
    `        order by c."product_id", c."org_rank" asc, c."specificity" desc, c."amount" asc, c."entry_id" collate "C" asc)`
  );
}

/**
 * Feature 148 — "this matrix stream prices `productSql`" as a boolean: an own
 * quantity-1 bracket, a fixed entry covering it, or a percentage covering it
 * that has a reference (the own bracket, already tested, or the Default
 * list's). Restricted to the stream's own product set, as its rows are.
 */
function streamPricesSql(
  stream: UnitPriceStream,
  currencyCode: string,
  productSql: string,
  alias: string,
  params: unknown[],
): string {
  const matrix = stream.matrix!;
  const fixedIds = new Set<string>();
  const percentIds = new Set<string>();
  let percentOnAll = false;
  for (const entry of matrix.entries) {
    if (entry.priceType === 'fixed') {
      for (const id of entry.productIds ?? []) fixedIds.add(id);
    } else if (entry.productIds === null) {
      percentOnAll = true;
    } else {
      for (const id of entry.productIds) percentIds.add(id);
    }
  }
  const probe = (a: string, listId: string): string => {
    params.push(listId, currencyCode);
    return (
      `(select 1 from "price_list_price_brackets" ${a}` +
      ` where ${a}."price_list_id" = ? and ${a}."currency_code" = ? and ${a}."min_quantity" = 1` +
      ` and ${a}."product_id" = ${productSql} limit 1) is not null`
    );
  };
  const parts: string[] = [probe(`${alias}o`, stream.priceListId)];
  if (fixedIds.size > 0) {
    parts.push(`${productSql} = any(?::uuid[])`);
    params.push(uuidArrayLiteral([...fixedIds]));
  }
  if (percentOnAll || percentIds.size > 0) {
    let covered = 'true';
    if (!percentOnAll) {
      covered = `${productSql} = any(?::uuid[])`;
      params.push(uuidArrayLiteral([...percentIds]));
    }
    parts.push(`(${covered} and ${probe(`${alias}d`, matrix.defaultListId)})`);
  }
  let restriction = '';
  if (stream.productIds !== null) {
    restriction = `${productSql} = any(?::uuid[]) and `;
    // The restriction is written first in the text, so its parameter must lead.
    params.splice(params.length - countPlaceholders(parts.join(' ')), 0, uuidArrayLiteral(stream.productIds));
  }
  return `${restriction}(${parts.join(' or ')})`;
}

function countPlaceholders(sql: string): number {
  return (sql.match(/\?/g) ?? []).length;
}

/**
 * Feature 148 — `pricedProductIds` as one statement over the same predicates:
 * which of `productIds` any candidate stream prices at quantity 1, the matrix
 * included. A set-membership answer, not a price.
 */
export function buildPricedProductIdsQuery(input: {
  streams: readonly UnitPriceStream[];
  currencyCode: string;
  productIds: readonly string[];
}): BuiltQuery {
  const params: unknown[] = [uuidArrayLiteral([...new Set(input.productIds)])];
  const perStream = input.streams.map((stream, index) => {
    if (stream.matrix && stream.matrix.entries.length > 0) {
      return `(${streamPricesSql(stream, input.currencyCode, 's."id"', `m${index}`, params)})`;
    }
    const alias = `q${index}`;
    const clauses = [
      `${alias}."price_list_id" = ?`,
      `${alias}."currency_code" = ?`,
      `${alias}."min_quantity" = 1`,
      `${alias}."product_id" = s."id"`,
    ];
    params.push(stream.priceListId, input.currencyCode);
    if (stream.productIds !== null) {
      clauses.push(`${alias}."product_id" = any(?::uuid[])`);
      params.push(uuidArrayLiteral(stream.productIds));
    }
    return `(select 1 from "price_list_price_brackets" ${alias} where ${clauses.join(' and ')} limit 1) is not null`;
  });
  return {
    sql:
      `select s."id"::text as product_id from unnest(?::uuid[]) as s("id")` +
      ` where ${perStream.length > 0 ? perStream.join('\n    or ') : 'false'}`,
    params,
  };
}

/**
 * Compares two `numeric(14,4)` amounts **as decimals**, without going through a
 * float.
 *
 * The merge is finished in memory — the leading stream's window is already in
 * hand from the watermark probe — so the two halves have to be ordered by the
 * same relation Postgres used. `Number()` is not it: `numeric(14,4)` carries
 * eighteen significant digits and a double carries fifteen, so two amounts a
 * shop can actually charge can compare equal after the conversion.
 */
export function compareDecimalStrings(a: string, b: string): number {
  const [aInt = '0', aFrac = ''] = a.split('.');
  const [bInt = '0', bFrac = ''] = b.split('.');
  const aNeg = aInt.startsWith('-');
  const bNeg = bInt.startsWith('-');
  if (aNeg !== bNeg) return aNeg ? -1 : 1;
  const sign = aNeg ? -1 : 1;
  const ai = aInt.replace('-', '').replace(/^0+(?=\d)/, '');
  const bi = bInt.replace('-', '').replace(/^0+(?=\d)/, '');
  if (ai.length !== bi.length) return sign * (ai.length < bi.length ? -1 : 1);
  if (ai !== bi) return sign * (ai < bi ? -1 : 1);
  const width = Math.max(aFrac.length, bFrac.length);
  const af = aFrac.padEnd(width, '0');
  const bf = bFrac.padEnd(width, '0');
  if (af === bf) return 0;
  return sign * (af < bf ? -1 : 1);
}

/** The merge's total order: amount, then product id, in the requested direction. */
export function compareOrderRows(
  a: { amount: string; productId: string },
  b: { amount: string; productId: string },
  direction: 'asc' | 'desc',
): number {
  const byAmount = compareDecimalStrings(a.amount, b.amount);
  const raw = byAmount !== 0 ? byAmount : a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0;
  return direction === 'asc' ? raw : -raw;
}
