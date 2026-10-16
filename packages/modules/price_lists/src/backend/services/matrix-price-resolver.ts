import type {
  AttributeValueType,
  CatalogAttributeView,
  PriceMatrixInactiveReason,
} from '@endora-commerce/contracts';
import { applyDiscountPercent, compareDecimal } from './matrix-decimal.js';
import { resolvePriceBracket, type PriceBracketRow } from './price-bracket-resolver.js';

/**
 * Matrix-aware price resolution inside one price list — feature 148,
 * `specs/148-price-list-matrix-rules/contracts/pricing-resolution-matrix.md`.
 *
 * **Pure.** Both engine walks (`pickAndResolveBracket` and its batched twin)
 * call {@link resolveListCandidate} where they used to call
 * `resolvePriceBracket`, so the list priority walk, the Base/Sale partitions,
 * the fall-through and every consumer stay exactly as they were: a list that
 * the matrix leaves unpriced falls through as a list without a bracket always
 * has. The answer is a `PriceBracketRow` — a matrix price travels as a
 * synthesised row carrying `matrixEntryId` — so `lineFromEngine`, the bracket
 * start quantity and the cache value shape need no change.
 */

/** One `price_list_matrix_entries` row, as the resolver reads it. */
export interface MatrixEntryRow {
  id: string;
  priceListId: string;
  productId: string | null;
  categoryId: string | null;
  attributeKey: string | null;
  attributeValue: string | null;
  organizationId: string | null;
  minQuantity: number;
  maxQuantity: number | null;
  priceType: 'fixed' | 'discount_percent';
  /** `numeric(14,4)` as a string; fixed only. */
  amount: string | null;
  currencyCode: string | null;
  /** `numeric(5,2)` as a string; percentage only. */
  discountPercent: string | null;
}

/** The value types an attribute selection can match (research R6). */
export type EligibleAttributeValueType = 'select' | 'enum' | 'multiselect' | 'boolean';

/** An attribute the matrix may currently select on. */
export interface EligibleAttribute {
  key: string;
  valueType: EligibleAttributeValueType;
}

const ELIGIBLE_VALUE_TYPES: ReadonlySet<AttributeValueType> = new Set<AttributeValueType>([
  'select',
  'enum',
  'multiselect',
  'boolean',
]);

/**
 * Why an attribute cannot select prices right now, or `null` when it can.
 *
 * The same answer serves the write-time refusal (`PRICE_MATRIX_ATTRIBUTE_NOT_ELIGIBLE`),
 * the admin DTO's `inactiveReason`, and — through {@link buildEligibleAttributes}
 * — resolution, where an ineligible attribute silently makes its entries not
 * candidates (FR-010: unflagging an attribute must never break checkout).
 */
export function attributeInactiveReason(
  view: Pick<CatalogAttributeView, 'isPriceRule' | 'languageScoped' | 'channelScoped' | 'valueType'> | null,
): PriceMatrixInactiveReason | null {
  if (!view) return 'attribute_not_found';
  if (!view.isPriceRule) return 'attribute_not_flagged';
  if (view.languageScoped) return 'attribute_language_scoped';
  if (view.channelScoped) return 'attribute_channel_scoped';
  if (!ELIGIBLE_VALUE_TYPES.has(view.valueType)) return 'attribute_value_type';
  return null;
}

/**
 * The attributes the matrix may select on, keyed by attribute key — built from
 * `catalogAttributeReadPort.listByFlag('isPriceRule')` (contract §4).
 */
export function buildEligibleAttributes(
  views: readonly CatalogAttributeView[],
): Map<string, EligibleAttribute> {
  const out = new Map<string, EligibleAttribute>();
  for (const view of views) {
    if (attributeInactiveReason(view) !== null) continue;
    out.set(view.key, { key: view.key, valueType: view.valueType as EligibleAttributeValueType });
  }
  return out;
}

/**
 * Whether a product's stored attribute value matches an entry's value
 * (contract §5). Option codes compare as stored — a label edit or a language
 * cannot break an entry. A missing value never matches, not even `'false'`.
 */
export function matchesAttributeValue(
  valueType: EligibleAttributeValueType,
  productValue: unknown,
  entryValue: string,
): boolean {
  switch (valueType) {
    case 'select':
    case 'enum':
      return typeof productValue === 'string' && productValue === entryValue;
    case 'multiselect':
      return Array.isArray(productValue) && productValue.includes(entryValue);
    case 'boolean':
      return (
        (productValue === true && entryValue === 'true') ||
        (productValue === false && entryValue === 'false')
      );
  }
}

/** Selection specificity — product 4, category ∩ attribute 3, attribute 2, category 1, all 0. */
export function matrixEntrySpecificity(
  entry: Pick<MatrixEntryRow, 'productId' | 'categoryId' | 'attributeKey'>,
): number {
  if (entry.productId !== null) return 4;
  if (entry.categoryId !== null && entry.attributeKey !== null) return 3;
  if (entry.attributeKey !== null) return 2;
  if (entry.categoryId !== null) return 1;
  return 0;
}

/**
 * Where an organization coordinate ranks for a buyer: the index in the
 * nearest-first chain, {@link NO_ORGANIZATION_RANK} for an entry that is not
 * organization-specific, `null` when the entry names an organization outside
 * the chain (it does not apply).
 */
export const NO_ORGANIZATION_RANK = Number.MAX_SAFE_INTEGER;

export function organizationRank(
  organizationId: string | null,
  organizationChain: readonly string[],
): number | null {
  if (organizationId === null) return NO_ORGANIZATION_RANK;
  const rank = organizationChain.indexOf(organizationId);
  return rank >= 0 ? rank : null;
}

export interface ListCandidateInput {
  list: { id: string; isSystem: boolean };
  product: {
    id: string;
    categoryIds: ReadonlySet<string>;
    attributeValues: Record<string, unknown>;
  };
  /** Nearest-first; `[]` for an anonymous visitor. */
  organizationChain: readonly string[];
  /** Upper-case. */
  currencyCode: string;
  quantity: number;
  /** This list × this product, every currency. */
  ownBrackets: readonly PriceBracketRow[];
  /** This list's entries, prefiltered to `product_id` null or this product. */
  entries: readonly MatrixEntryRow[];
  /** The Default list × this product; `null` = not loaded yet. */
  defaultBrackets: readonly PriceBracketRow[] | null;
  /** `null` = nothing was read because no entry names an attribute. */
  eligibleAttributes: ReadonlyMap<string, EligibleAttribute> | null;
}

export type ListCandidateResult =
  | { kind: 'price'; row: PriceBracketRow }
  | { kind: 'none' }
  | { kind: 'needs_reference' };

interface Candidate {
  orgRank: number;
  specificity: number;
  minQuantity: number;
  /** `null` = a percentage whose reference is not known (yet, or at all). */
  amount: string | null;
  /** `null` = the list's own bracket. */
  entry: MatrixEntryRow | null;
  own: PriceBracketRow | null;
}

function selectionMatches(
  entry: MatrixEntryRow,
  product: ListCandidateInput['product'],
  eligible: ReadonlyMap<string, EligibleAttribute> | null,
): boolean {
  if (entry.productId !== null && entry.productId !== product.id) return false;
  if (entry.categoryId !== null && !product.categoryIds.has(entry.categoryId)) return false;
  if (entry.attributeKey !== null) {
    const attribute = eligible?.get(entry.attributeKey);
    if (!attribute || entry.attributeValue === null) return false;
    if (!matchesAttributeValue(attribute.valueType, product.attributeValues[entry.attributeKey], entry.attributeValue)) {
      return false;
    }
  }
  return true;
}

/**
 * The precedence key of research R8, as a comparator: organization rank asc,
 * specificity desc, starting quantity desc, then amount asc (an unknown amount
 * first — it could be the lowest), then entry id asc with the own bracket
 * before any entry. Total by construction.
 */
function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.orgRank !== b.orgRank) return a.orgRank - b.orgRank;
  if (a.specificity !== b.specificity) return b.specificity - a.specificity;
  if (a.minQuantity !== b.minQuantity) return b.minQuantity - a.minQuantity;
  if (a.amount === null || b.amount === null) {
    if (a.amount === null && b.amount !== null) return -1;
    if (b.amount === null && a.amount !== null) return 1;
  } else {
    const byAmount = compareDecimal(a.amount, b.amount);
    if (byAmount !== 0) return byAmount;
  }
  const aId = a.entry?.id ?? '';
  const bId = b.entry?.id ?? '';
  return aId < bId ? -1 : aId > bId ? 1 : 0;
}

/**
 * The price one list charges for one product at one quantity — contract §3.
 *
 * Candidates are the list's own bracket (not organization-specific, product
 * specificity) and every entry whose selection, organization, quantity window
 * and currency apply. The first by {@link compareCandidates} that yields an
 * amount wins. A percentage with no reference is skipped once the Default
 * brackets are known; before that it answers `needs_reference`, so the batched
 * walk can read the Default list once for every product that needs it.
 */
export function resolveListCandidate(input: ListCandidateInput): ListCandidateResult {
  const own = resolvePriceBracket(input.ownBrackets, input.currencyCode, input.quantity);
  if (input.entries.length === 0) return own ? { kind: 'price', row: own } : { kind: 'none' };

  const reference =
    own ??
    (input.defaultBrackets !== null
      ? resolvePriceBracket(input.defaultBrackets, input.currencyCode, input.quantity)
      : null);

  const candidates: Candidate[] = [];
  if (own) {
    candidates.push({
      orgRank: NO_ORGANIZATION_RANK,
      specificity: 4,
      minQuantity: own.minQuantity,
      amount: own.amount,
      entry: null,
      own,
    });
  }
  for (const entry of input.entries) {
    if (entry.minQuantity > input.quantity) continue;
    if (entry.maxQuantity !== null && entry.maxQuantity < input.quantity) continue;
    const orgRank = organizationRank(entry.organizationId, input.organizationChain);
    if (orgRank === null) continue;
    if (entry.priceType === 'fixed' && entry.currencyCode?.toUpperCase() !== input.currencyCode) continue;
    if (!selectionMatches(entry, input.product, input.eligibleAttributes)) continue;

    let amount: string | null;
    if (entry.priceType === 'fixed') {
      amount = entry.amount;
    } else {
      amount = reference && entry.discountPercent !== null
        ? applyDiscountPercent(reference.amount, entry.discountPercent)
        : null;
      // Known to be unpriced: the Default brackets were read and hold nothing
      // for this line, or the list prices nothing itself.
      if (amount === null && input.defaultBrackets !== null) continue;
    }
    if (amount === null && entry.priceType === 'fixed') continue;
    candidates.push({
      orgRank,
      specificity: matrixEntrySpecificity(entry),
      minQuantity: entry.minQuantity,
      amount,
      entry,
      own: null,
    });
  }
  if (candidates.length === 0) return { kind: 'none' };

  candidates.sort(compareCandidates);
  const best = candidates[0]!;
  if (best.amount === null) return { kind: 'needs_reference' };
  if (best.own) return { kind: 'price', row: best.own };
  const entry = best.entry!;
  return {
    kind: 'price',
    row: {
      priceListId: input.list.id,
      productId: input.product.id,
      currencyCode: input.currencyCode,
      minQuantity: entry.minQuantity,
      maxQuantity: entry.maxQuantity,
      amount: best.amount,
      matrixEntryId: entry.id,
    },
  };
}
