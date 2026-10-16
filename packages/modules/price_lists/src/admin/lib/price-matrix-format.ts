import type { PriceMatrixEntry, PriceMatrixPrice } from '@endora-commerce/contracts';

/**
 * Pure formatting for the *Price matrix* tab (feature 148,
 * `contracts/admin-ui-price-matrix.md` §3). Kept out of the components so the
 * table and the dialog only lay strings out, and so the formats have a test.
 */

export type MatrixTranslate = (key: string, params?: Record<string, string | number>) => string;

/** `500+` for an open window, `1–99` for a closed one, `5` for a single quantity. */
export function formatQuantityWindow(min: number, max: number | null): string {
  if (max === null) return `${min}+`;
  if (max === min) return String(min);
  return `${min}–${max}`;
}

/** At least two fractional digits, never fewer than the amount carries. */
function formatAmount(amount: string): string {
  const [whole = '0', fraction = ''] = amount.split('.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}

/** `9.50 PLN` for a fixed price, `−12%` (a true minus sign) for a discount. */
export function formatMatrixPrice(price: PriceMatrixPrice): string {
  if (price.type === 'fixed') return `${formatAmount(price.amount)} ${price.currencyCode}`;
  return `−${price.percent}%`;
}

/**
 * What an entry applies to, from the labels the server resolved. A target
 * that no longer resolves reads as the *deleted item* marker rather than an
 * empty cell. `booleanAttributes` names the attributes whose values are
 * yes/no, rendered in the admin's language.
 */
export function matrixSelectionSummary(
  entry: PriceMatrixEntry,
  t: MatrixTranslate,
  booleanAttributes: ReadonlySet<string> = new Set(),
): string {
  const deleted = t('priceMatrix.targetDeleted');
  const attribute = (): string => {
    if (!entry.attribute) return '';
    const label = entry.labels.attribute?.label ?? entry.attribute.key;
    const value = booleanAttributes.has(entry.attribute.key)
      ? t(`priceMatrix.attribute.boolean.${entry.attribute.value === 'true' ? 'true' : 'false'}`)
      : (entry.labels.attribute?.valueLabel ?? entry.attribute.value);
    return `${label}: ${value}`;
  };
  switch (entry.selectionKind) {
    case 'product':
      return entry.labels.product ? `${entry.labels.product.sku} — ${entry.labels.product.name}` : deleted;
    case 'category':
      return entry.labels.category ?? deleted;
    case 'attribute':
      return attribute();
    case 'category_attribute':
      return `${entry.labels.category ?? deleted} ∩ ${attribute()}`;
    case 'all':
      return t('priceMatrix.selection.allProducts');
  }
}
