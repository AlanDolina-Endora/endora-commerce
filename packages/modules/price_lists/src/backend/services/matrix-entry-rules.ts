import {
  PRICE_MATRIX_MAX_ENTRIES_PER_LIST,
  priceMatrixEntryShapeIssues,
  type PriceMatrixEntryPatch,
  type PriceMatrixEntryShape,
  type PriceMatrixPrice,
} from '@endora-commerce/contracts';
import type { MatrixEntryRow } from './matrix-price-resolver.js';

/**
 * The write-side rules of a price matrix entry that need no database
 * (feature 148, data-model §1 *Validation rules*). The service runs them inside
 * the Command Bus transaction, after locking the parent price list, against
 * the rows it reads there.
 */

/** The cross-field shape rules — the same function the create schema refines with. */
export function validateEntryShape(
  entry: PriceMatrixEntryShape,
): Array<{ path: Array<string>; message: string }> {
  return priceMatrixEntryShapeIssues(entry);
}

/** Inclusive windows; `max === null` is open-ended. */
export function quantityWindowsOverlap(
  a: { min: number; max: number | null },
  b: { min: number; max: number | null },
): boolean {
  const aEnd = a.max ?? Number.POSITIVE_INFINITY;
  const bEnd = b.max ?? Number.POSITIVE_INFINITY;
  return a.min <= bEnd && b.min <= aEnd;
}

/** `null` is a percentage, which applies in every currency and so intersects all. */
export function currenciesOverlap(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return true;
  return a.toUpperCase() === b.toUpperCase();
}

function currencyOf(price: PriceMatrixPrice): string | null {
  return price.type === 'fixed' ? price.currencyCode : null;
}

/**
 * The first stored entry the candidate would overlap (FR-005): the same
 * selection and organization, an intersecting currency and an intersecting
 * quantity window. `exceptId` is the entry being edited.
 */
export function findOverlappingEntry(
  candidate: PriceMatrixEntryShape,
  existing: readonly MatrixEntryRow[],
  exceptId?: string,
): MatrixEntryRow | null {
  const attributeKey = candidate.attribute?.key ?? null;
  const attributeValue = candidate.attribute?.value ?? null;
  for (const row of existing) {
    if (row.id === exceptId) continue;
    if (row.productId !== candidate.productId) continue;
    if (row.categoryId !== candidate.categoryId) continue;
    if (row.attributeKey !== attributeKey || row.attributeValue !== attributeValue) continue;
    if (row.organizationId !== candidate.organizationId) continue;
    if (!currenciesOverlap(row.currencyCode, currencyOf(candidate.price))) continue;
    if (
      !quantityWindowsOverlap(
        { min: row.minQuantity, max: row.maxQuantity },
        { min: candidate.minQuantity, max: candidate.maxQuantity },
      )
    ) {
      continue;
    }
    return row;
  }
  return null;
}

/** Whether a list holding `count` entries may take no more (FR-007). */
export function isAtMatrixLimit(count: number): boolean {
  return count >= PRICE_MATRIX_MAX_ENTRIES_PER_LIST;
}

/** A PATCH overlaid on the stored entry; every create rule then runs on the result. */
export function mergeEntryPatch(
  current: PriceMatrixEntryShape,
  patch: PriceMatrixEntryPatch,
): PriceMatrixEntryShape {
  return {
    productId: patch.productId !== undefined ? patch.productId : current.productId,
    categoryId: patch.categoryId !== undefined ? patch.categoryId : current.categoryId,
    attribute: patch.attribute !== undefined ? patch.attribute : current.attribute,
    organizationId: patch.organizationId !== undefined ? patch.organizationId : current.organizationId,
    minQuantity: patch.minQuantity ?? current.minQuantity,
    maxQuantity: patch.maxQuantity !== undefined ? patch.maxQuantity : current.maxQuantity,
    price: patch.price ?? current.price,
  };
}

/** `'9.5000'` → `'9.5'`, `'10.00'` → `'10'`: the shape an operator typed, not the column scale. */
export function trimDecimal(value: string): string {
  if (!value.includes('.')) return value;
  const trimmed = value.replace(/0+$/, '');
  return trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;
}

/** The API shape of a stored row. */
export function entryShapeFromRow(row: MatrixEntryRow): PriceMatrixEntryShape {
  return {
    productId: row.productId,
    categoryId: row.categoryId,
    attribute:
      row.attributeKey !== null && row.attributeValue !== null
        ? { key: row.attributeKey, value: row.attributeValue }
        : null,
    organizationId: row.organizationId,
    minQuantity: row.minQuantity,
    maxQuantity: row.maxQuantity,
    price:
      row.priceType === 'fixed'
        ? {
            type: 'fixed',
            amount: trimDecimal(row.amount ?? '0'),
            currencyCode: (row.currencyCode ?? '').toUpperCase(),
          }
        : { type: 'discount_percent', percent: trimDecimal(row.discountPercent ?? '0') },
  };
}

/** The columns of an entry, from its API shape. */
export function rowFieldsFromShape(
  shape: PriceMatrixEntryShape,
): Omit<MatrixEntryRow, 'id' | 'priceListId'> {
  return {
    productId: shape.productId,
    categoryId: shape.categoryId,
    attributeKey: shape.attribute?.key ?? null,
    attributeValue: shape.attribute?.value ?? null,
    organizationId: shape.organizationId,
    minQuantity: shape.minQuantity,
    maxQuantity: shape.maxQuantity,
    priceType: shape.price.type,
    amount: shape.price.type === 'fixed' ? shape.price.amount : null,
    currencyCode: shape.price.type === 'fixed' ? shape.price.currencyCode.toUpperCase() : null,
    discountPercent: shape.price.type === 'discount_percent' ? shape.price.percent : null,
  };
}
