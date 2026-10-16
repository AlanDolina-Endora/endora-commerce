import { describe, expect, it } from 'vitest';
import type { CatalogAttributeView } from '@endora-commerce/contracts';
import {
  attributeInactiveReason,
  buildEligibleAttributes,
  matchesAttributeValue,
  resolveListCandidate,
  type EligibleAttribute,
  type ListCandidateInput,
  type MatrixEntryRow,
} from './matrix-price-resolver.js';
import type { PriceBracketRow } from './price-bracket-resolver.js';

/**
 * Feature 148 — the pure core of matrix-aware resolution
 * (`contracts/pricing-resolution-matrix.md` §2–§5). One price list, one
 * product, one quantity: which candidate — the list's own bracket or one of its
 * matrix entries — prices the line, and at what amount.
 */
const LIST = 'list-1';
const DEFAULT_LIST = 'list-default';
const PRODUCT = 'product-1';
const CAT_FASTENERS = 'cat-fasteners';
const CAT_HINGES = 'cat-hinges';
const ACME = 'org-acme';
const HOLDING = 'org-holding';
const OTHER = 'org-other';

let seq = 0;
function entry(over: Partial<MatrixEntryRow>): MatrixEntryRow {
  seq += 1;
  return {
    id: `entry-${String(seq).padStart(3, '0')}`,
    priceListId: LIST,
    productId: null,
    categoryId: null,
    attributeKey: null,
    attributeValue: null,
    organizationId: null,
    minQuantity: 1,
    maxQuantity: null,
    priceType: 'discount_percent',
    amount: null,
    currencyCode: null,
    discountPercent: '10.00',
    ...over,
  };
}

function bracket(over: Partial<PriceBracketRow>): PriceBracketRow {
  return {
    priceListId: LIST,
    productId: PRODUCT,
    currencyCode: 'PLN',
    minQuantity: 1,
    maxQuantity: null,
    amount: '100.0000',
    ...over,
  };
}

const MATERIAL: EligibleAttribute = { key: 'material', valueType: 'select' };
const CERTS: EligibleAttribute = { key: 'certifications', valueType: 'multiselect' };
const ATEX: EligibleAttribute = { key: 'atex', valueType: 'boolean' };

function input(over: Partial<ListCandidateInput>): ListCandidateInput {
  return {
    list: { id: LIST, isSystem: false },
    product: {
      id: PRODUCT,
      categoryIds: new Set([CAT_FASTENERS]),
      attributeValues: { material: 'stainless', certifications: ['atex', 'ce'], atex: true },
    },
    organizationChain: [ACME, HOLDING],
    currencyCode: 'PLN',
    quantity: 1,
    ownBrackets: [],
    entries: [],
    defaultBrackets: [],
    eligibleAttributes: new Map([
      [MATERIAL.key, MATERIAL],
      [CERTS.key, CERTS],
      [ATEX.key, ATEX],
    ]),
    ...over,
  };
}

function priced(result: ReturnType<typeof resolveListCandidate>): { amount: string; entry: string | null } {
  if (result.kind !== 'price') throw new Error(`expected a price, got ${result.kind}`);
  return { amount: result.row.amount, entry: result.row.matrixEntryId ?? null };
}

describe('resolveListCandidate — the list without a matrix', () => {
  it('answers the own bracket exactly as resolvePriceBracket does', () => {
    const own = bracket({});
    const out = resolveListCandidate(input({ ownBrackets: [own] }));
    expect(out).toEqual({ kind: 'price', row: own });
  });

  it('answers none when nothing prices the line', () => {
    expect(resolveListCandidate(input({}))).toEqual({ kind: 'none' });
  });
});

describe('resolveListCandidate — selections (US1)', () => {
  it('prices a category entry off the Default reference', () => {
    const e = entry({ categoryId: CAT_FASTENERS, organizationId: ACME, minQuantity: 500, discountPercent: '12.00' });
    const defaults = [bracket({ priceListId: DEFAULT_LIST })];
    expect(priced(resolveListCandidate(input({ entries: [e], defaultBrackets: defaults, quantity: 600 })))).toEqual({
      amount: '88.0000',
      entry: e.id,
    });
  });

  it('carries the entry window on the synthesised row', () => {
    const e = entry({ categoryId: CAT_FASTENERS, organizationId: ACME, minQuantity: 500, maxQuantity: 999 });
    const out = resolveListCandidate(
      input({ entries: [e], defaultBrackets: [bracket({ priceListId: DEFAULT_LIST })], quantity: 600 }),
    );
    expect(out).toEqual({
      kind: 'price',
      row: {
        priceListId: LIST,
        productId: PRODUCT,
        currencyCode: 'PLN',
        minQuantity: 500,
        maxQuantity: 999,
        amount: '90.0000',
        matrixEntryId: e.id,
      },
    });
  });

  it('ignores a category entry for a product outside the category', () => {
    const e = entry({ categoryId: CAT_HINGES, organizationId: ACME });
    expect(resolveListCandidate(input({ entries: [e], defaultBrackets: [bracket({})] }))).toEqual({ kind: 'none' });
  });

  it('prices an all-products entry', () => {
    const e = entry({ organizationId: ACME, minQuantity: 1000, discountPercent: '5.00' });
    expect(
      priced(resolveListCandidate(input({ entries: [e], defaultBrackets: [bracket({})], quantity: 1000 }))).amount,
    ).toBe('95.0000');
  });

  it('prices a product entry only for its own product', () => {
    const mine = entry({ productId: PRODUCT, organizationId: ACME, priceType: 'fixed', amount: '95.0000', currencyCode: 'PLN', discountPercent: null });
    const other = entry({ productId: 'product-2', organizationId: ACME, priceType: 'fixed', amount: '1.0000', currencyCode: 'PLN', discountPercent: null });
    expect(priced(resolveListCandidate(input({ entries: [mine, other] })))).toEqual({ amount: '95.0000', entry: mine.id });
  });

  it('picks the product entry whose quantity window contains the quantity', () => {
    const fixed = { priceType: 'fixed' as const, currencyCode: 'PLN', discountPercent: null };
    const low = entry({ productId: PRODUCT, organizationId: ACME, minQuantity: 1, maxQuantity: 99, amount: '95.0000', ...fixed });
    const high = entry({ productId: PRODUCT, organizationId: ACME, minQuantity: 100, amount: '90.0000', ...fixed });
    expect(priced(resolveListCandidate(input({ entries: [low, high], quantity: 150 }))).amount).toBe('90.0000');
    expect(priced(resolveListCandidate(input({ entries: [low, high], quantity: 99 }))).amount).toBe('95.0000');
  });

  it('does not apply an entry below its window, and falls back to the own bracket', () => {
    const e = entry({ categoryId: CAT_FASTENERS, organizationId: ACME, minQuantity: 500 });
    const own = bracket({ amount: '100.0000' });
    expect(resolveListCandidate(input({ entries: [e], ownBrackets: [own], quantity: 400 }))).toEqual({
      kind: 'price',
      row: own,
    });
  });
});

describe('resolveListCandidate — organization coordinate (US1)', () => {
  it("applies an entry for the buyer's own organization and for a parent", () => {
    const parent = entry({ categoryId: CAT_FASTENERS, organizationId: HOLDING, discountPercent: '20.00' });
    expect(priced(resolveListCandidate(input({ entries: [parent], defaultBrackets: [bracket({})] }))).entry).toBe(parent.id);
  });

  it('prefers the own organization over the parent', () => {
    const parent = entry({ categoryId: CAT_FASTENERS, organizationId: HOLDING, discountPercent: '20.00' });
    const own = entry({ categoryId: CAT_FASTENERS, organizationId: ACME, discountPercent: '10.00' });
    expect(priced(resolveListCandidate(input({ entries: [parent, own], defaultBrackets: [bracket({})] }))).entry).toBe(own.id);
  });

  it('never applies another organization’s entry', () => {
    const e = entry({ categoryId: CAT_FASTENERS, organizationId: OTHER });
    expect(resolveListCandidate(input({ entries: [e], defaultBrackets: [bracket({})] }))).toEqual({ kind: 'none' });
  });

  it('gives an anonymous visitor only entries that are not organization-specific', () => {
    const orgEntry = entry({ categoryId: CAT_FASTENERS, organizationId: ACME, discountPercent: '50.00' });
    const allBuyers = entry({ categoryId: CAT_FASTENERS, discountPercent: '10.00' });
    const out = resolveListCandidate(
      input({ entries: [orgEntry, allBuyers], organizationChain: [], defaultBrackets: [bracket({})] }),
    );
    expect(priced(out)).toEqual({ amount: '90.0000', entry: allBuyers.id });
  });
});

describe('resolveListCandidate — currency (US1)', () => {
  it('applies a fixed entry only in its own currency', () => {
    const e = entry({ categoryId: CAT_FASTENERS, priceType: 'fixed', amount: '9.5000', currencyCode: 'PLN', discountPercent: null });
    expect(priced(resolveListCandidate(input({ entries: [e] }))).amount).toBe('9.5000');
    expect(resolveListCandidate(input({ entries: [e], currencyCode: 'EUR' }))).toEqual({ kind: 'none' });
  });

  it('applies a percentage in whatever currency the line is priced in', () => {
    const e = entry({ categoryId: CAT_FASTENERS, discountPercent: '10.00' });
    const defaults = [bracket({ currencyCode: 'EUR', amount: '20.0000' })];
    expect(priced(resolveListCandidate(input({ entries: [e], currencyCode: 'EUR', defaultBrackets: defaults }))).amount).toBe(
      '18.0000',
    );
  });
});

describe('resolveListCandidate — percentage reference (US1, FR-015/FR-016)', () => {
  it("takes the percentage off the list's own bracket first", () => {
    const e = entry({ categoryId: CAT_FASTENERS, organizationId: ACME, discountPercent: '10.00' });
    const own = bracket({ amount: '80.0000' });
    const defaults = [bracket({ priceListId: DEFAULT_LIST, amount: '100.0000' })];
    expect(priced(resolveListCandidate(input({ entries: [e], ownBrackets: [own], defaultBrackets: defaults }))).amount).toBe(
      '72.0000',
    );
  });

  it('answers needs_reference when the best candidate is a percentage without an own bracket and the Default brackets are not loaded', () => {
    const e = entry({ categoryId: CAT_FASTENERS, organizationId: ACME });
    expect(resolveListCandidate(input({ entries: [e], defaultBrackets: null }))).toEqual({ kind: 'needs_reference' });
  });

  it('does not need the reference when an own bracket exists', () => {
    const e = entry({ categoryId: CAT_FASTENERS, organizationId: ACME });
    expect(resolveListCandidate(input({ entries: [e], ownBrackets: [bracket({})], defaultBrackets: null })).kind).toBe(
      'price',
    );
  });

  it('skips a percentage with no reference once the Default brackets are known to be empty', () => {
    const pct = entry({ categoryId: CAT_FASTENERS, organizationId: ACME });
    const fixed = entry({ categoryId: CAT_FASTENERS, priceType: 'fixed', amount: '7.0000', currencyCode: 'PLN', discountPercent: null });
    expect(priced(resolveListCandidate(input({ entries: [pct, fixed], defaultBrackets: [] })))).toEqual({
      amount: '7.0000',
      entry: fixed.id,
    });
    expect(resolveListCandidate(input({ entries: [pct], defaultBrackets: [] }))).toEqual({ kind: 'none' });
  });

  it('uses the Default list’s own bracket as the reference for an entry on the Default list', () => {
    const e = entry({ priceListId: DEFAULT_LIST, categoryId: CAT_FASTENERS, organizationId: ACME, discountPercent: '25.00' });
    const own = bracket({ priceListId: DEFAULT_LIST, amount: '40.0000' });
    const out = resolveListCandidate(
      input({ list: { id: DEFAULT_LIST, isSystem: true }, entries: [e], ownBrackets: [own], defaultBrackets: null }),
    );
    expect(priced(out).amount).toBe('30.0000');
  });

  it('applies a 100% discount as a free line', () => {
    const e = entry({ categoryId: CAT_FASTENERS, organizationId: ACME, discountPercent: '100.00' });
    expect(priced(resolveListCandidate(input({ entries: [e], defaultBrackets: [bracket({})] }))).amount).toBe('0.0000');
  });
});

describe('resolveListCandidate — attribute selections (US2, FR-010/FR-011)', () => {
  const defaults = [bracket({})];

  it('matches a select attribute by equality', () => {
    const e = entry({ attributeKey: 'material', attributeValue: 'stainless', organizationId: ACME });
    expect(priced(resolveListCandidate(input({ entries: [e], defaultBrackets: defaults }))).entry).toBe(e.id);
    const brass = entry({ attributeKey: 'material', attributeValue: 'brass', organizationId: ACME });
    expect(resolveListCandidate(input({ entries: [brass], defaultBrackets: defaults }))).toEqual({ kind: 'none' });
  });

  it('matches a multiselect attribute when the value is among the product’s values', () => {
    const e = entry({ attributeKey: 'certifications', attributeValue: 'atex' });
    expect(priced(resolveListCandidate(input({ entries: [e], defaultBrackets: defaults }))).entry).toBe(e.id);
    const missing = entry({ attributeKey: 'certifications', attributeValue: 'iso' });
    expect(resolveListCandidate(input({ entries: [missing], defaultBrackets: defaults }))).toEqual({ kind: 'none' });
  });

  it('matches a boolean attribute on true and false, never on a missing value', () => {
    const yes = entry({ attributeKey: 'atex', attributeValue: 'true' });
    const no = entry({ attributeKey: 'atex', attributeValue: 'false' });
    expect(priced(resolveListCandidate(input({ entries: [yes], defaultBrackets: defaults }))).entry).toBe(yes.id);
    expect(resolveListCandidate(input({ entries: [no], defaultBrackets: defaults }))).toEqual({ kind: 'none' });
    const product = { id: PRODUCT, categoryIds: new Set<string>(), attributeValues: {} };
    expect(resolveListCandidate(input({ entries: [no], product, defaultBrackets: defaults }))).toEqual({ kind: 'none' });
    const falseProduct = { id: PRODUCT, categoryIds: new Set<string>(), attributeValues: { atex: false } };
    expect(priced(resolveListCandidate(input({ entries: [no], product: falseProduct, defaultBrackets: defaults }))).entry).toBe(no.id);
  });

  it('never applies an entry whose attribute is not eligible — no error', () => {
    const e = entry({ attributeKey: 'colour', attributeValue: 'red' });
    const product = { id: PRODUCT, categoryIds: new Set<string>(), attributeValues: { colour: 'red' } };
    expect(resolveListCandidate(input({ entries: [e], product, defaultBrackets: defaults }))).toEqual({ kind: 'none' });
    expect(
      resolveListCandidate(input({ entries: [e], product, defaultBrackets: defaults, eligibleAttributes: null })),
    ).toEqual({ kind: 'none' });
  });

  it('requires both halves of a category ∩ attribute selection', () => {
    const e = entry({ categoryId: CAT_FASTENERS, attributeKey: 'material', attributeValue: 'stainless' });
    expect(priced(resolveListCandidate(input({ entries: [e], defaultBrackets: defaults }))).entry).toBe(e.id);
    const hinge = { id: PRODUCT, categoryIds: new Set([CAT_HINGES]), attributeValues: { material: 'stainless' } };
    expect(resolveListCandidate(input({ entries: [e], product: hinge, defaultBrackets: defaults }))).toEqual({ kind: 'none' });
    const brass = { id: PRODUCT, categoryIds: new Set([CAT_FASTENERS]), attributeValues: { material: 'brass' } };
    expect(resolveListCandidate(input({ entries: [e], product: brass, defaultBrackets: defaults }))).toEqual({ kind: 'none' });
  });
});

describe('resolveListCandidate — precedence (US3, FR-014)', () => {
  const defaults = [bracket({ amount: '100.0000' })];

  it('puts an organization-specific candidate before a more specific not-organization-specific one', () => {
    const orgAll = entry({ organizationId: ACME, discountPercent: '1.00' });
    const ownBracket = bracket({ amount: '50.0000' });
    expect(
      priced(resolveListCandidate(input({ entries: [orgAll], ownBrackets: [ownBracket], defaultBrackets: defaults }))).entry,
    ).toBe(orgAll.id);
  });

  it('puts a nearer organization before a farther one regardless of specificity', () => {
    const holdingProduct = entry({ productId: PRODUCT, organizationId: HOLDING, priceType: 'fixed', amount: '1.0000', currencyCode: 'PLN', discountPercent: null });
    const acmeAll = entry({ organizationId: ACME, discountPercent: '1.00' });
    expect(priced(resolveListCandidate(input({ entries: [holdingProduct, acmeAll], defaultBrackets: defaults }))).entry).toBe(
      acmeAll.id,
    );
  });

  it('orders product > category ∩ attribute > attribute > category > all at equal organization', () => {
    const fixed = (amount: string) => ({ priceType: 'fixed' as const, amount, currencyCode: 'PLN', discountPercent: null });
    const product = entry({ productId: PRODUCT, organizationId: ACME, ...fixed('50.0000') });
    const catAttr = entry({ categoryId: CAT_FASTENERS, attributeKey: 'material', attributeValue: 'stainless', organizationId: ACME, ...fixed('40.0000') });
    const attr = entry({ attributeKey: 'material', attributeValue: 'stainless', organizationId: ACME, ...fixed('30.0000') });
    const cat = entry({ categoryId: CAT_FASTENERS, organizationId: ACME, ...fixed('20.0000') });
    const all = entry({ organizationId: ACME, discountPercent: '99.00' });
    const ladder = [product, catAttr, attr, cat, all];
    for (let i = 0; i < ladder.length; i += 1) {
      const remaining = ladder.slice(i);
      expect(priced(resolveListCandidate(input({ entries: [...remaining].reverse(), defaultBrackets: defaults }))).entry).toBe(
        ladder[i]!.id,
      );
    }
  });

  it('prefers the higher starting quantity at equal level', () => {
    const fromOne = entry({ categoryId: CAT_FASTENERS, organizationId: ACME, minQuantity: 1, discountPercent: '50.00' });
    const fromTen = entry({ categoryId: 'cat-other', organizationId: ACME, minQuantity: 10, discountPercent: '5.00' });
    const product = { id: PRODUCT, categoryIds: new Set([CAT_FASTENERS, 'cat-other']), attributeValues: {} };
    expect(
      priced(resolveListCandidate(input({ entries: [fromOne, fromTen], product, quantity: 20, defaultBrackets: defaults }))).entry,
    ).toBe(fromTen.id);
  });

  it('prefers the lower resulting price next, then the entry id', () => {
    const product = { id: PRODUCT, categoryIds: new Set([CAT_FASTENERS, CAT_HINGES]), attributeValues: {} };
    const a = entry({ id: 'entry-b', categoryId: CAT_FASTENERS, organizationId: ACME, discountPercent: '10.00' });
    const b = entry({ id: 'entry-a', categoryId: CAT_HINGES, organizationId: ACME, discountPercent: '20.00' });
    expect(priced(resolveListCandidate(input({ entries: [a, b], product, defaultBrackets: defaults }))).entry).toBe('entry-a');
    const c = entry({ id: 'entry-c', categoryId: CAT_FASTENERS, organizationId: ACME, discountPercent: '15.00' });
    const d = entry({ id: 'entry-d', categoryId: CAT_HINGES, organizationId: ACME, discountPercent: '15.00' });
    expect(priced(resolveListCandidate(input({ entries: [d, c], product, defaultBrackets: defaults }))).entry).toBe('entry-c');
  });

  it("lets the list's own product bracket beat a not-organization-specific category entry", () => {
    const cat = entry({ categoryId: CAT_FASTENERS, discountPercent: '50.00' });
    const own = bracket({ amount: '100.0000' });
    expect(resolveListCandidate(input({ entries: [cat], ownBrackets: [own], defaultBrackets: defaults }))).toEqual({
      kind: 'price',
      row: own,
    });
  });

  it('yields to the next candidate when the best one is unpriced', () => {
    const orgPct = entry({ organizationId: ACME, discountPercent: '10.00' });
    const allBuyersFixed = entry({ categoryId: CAT_FASTENERS, priceType: 'fixed', amount: '7.0000', currencyCode: 'PLN', discountPercent: null });
    expect(priced(resolveListCandidate(input({ entries: [orgPct, allBuyersFixed], defaultBrackets: [] }))).entry).toBe(
      allBuyersFixed.id,
    );
  });
});

describe('attribute eligibility (US2, FR-008/FR-009)', () => {
  function view(over: Partial<CatalogAttributeView>): CatalogAttributeView {
    return {
      id: 'a',
      customFieldDefinitionId: 'd',
      key: 'material',
      label: { en: 'Material' },
      labelDefault: 'Material',
      valueType: 'select',
      isRequired: false,
      options: [],
      isSearchable: false,
      isFilterable: false,
      isVariantAxis: false,
      displayAsSlider: false,
      isComparable: false,
      quickSearchable: false,
      isPromoRule: false,
      isPriceRule: true,
      filterPosition: 0,
      isVisibleOnProductPage: false,
      channelScoped: false,
      languageScoped: false,
      massEditable: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      ...over,
    } as CatalogAttributeView;
  }

  it('keeps flagged choice and yes/no attributes that are neither per-language nor per-channel', () => {
    const map = buildEligibleAttributes([
      view({ key: 'material', valueType: 'select' }),
      view({ key: 'finish', valueType: 'enum' }),
      view({ key: 'certs', valueType: 'multiselect' }),
      view({ key: 'atex', valueType: 'boolean' }),
      view({ key: 'note', valueType: 'string' }),
      view({ key: 'weight', valueType: 'number' }),
      view({ key: 'colour', isPriceRule: false }),
      view({ key: 'name', languageScoped: true }),
      view({ key: 'promo', channelScoped: true }),
    ]);
    expect([...map.keys()].sort()).toEqual(['atex', 'certs', 'finish', 'material']);
  });

  it('names why an attribute is not eligible', () => {
    expect(attributeInactiveReason(null)).toBe('attribute_not_found');
    expect(attributeInactiveReason(view({ isPriceRule: false }))).toBe('attribute_not_flagged');
    expect(attributeInactiveReason(view({ languageScoped: true }))).toBe('attribute_language_scoped');
    expect(attributeInactiveReason(view({ channelScoped: true }))).toBe('attribute_channel_scoped');
    expect(attributeInactiveReason(view({ valueType: 'date' }))).toBe('attribute_value_type');
    expect(attributeInactiveReason(view({}))).toBeNull();
  });

  it('matches values by the attribute value type', () => {
    expect(matchesAttributeValue('select', 'steel', 'steel')).toBe(true);
    expect(matchesAttributeValue('select', ['steel'], 'steel')).toBe(false);
    expect(matchesAttributeValue('multiselect', ['a', 'steel'], 'steel')).toBe(true);
    expect(matchesAttributeValue('multiselect', 'steel', 'steel')).toBe(false);
    expect(matchesAttributeValue('boolean', true, 'true')).toBe(true);
    expect(matchesAttributeValue('boolean', 'true', 'true')).toBe(false);
    expect(matchesAttributeValue('boolean', undefined, 'false')).toBe(false);
  });
});
