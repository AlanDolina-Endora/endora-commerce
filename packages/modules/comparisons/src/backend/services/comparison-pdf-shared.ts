import type { ComparisonAttributeRow, ComparisonDisplayMode } from '@endora-commerce/contracts';

/**
 * Pure helpers both comparison PDF paths use — the fixed renderer
 * (`comparison-pdf-renderer.ts`, today's layout, used while document templates
 * are off) and the template engine's comparison blocks
 * (`specs/152-compare-pdf-template/` R-11).
 */

/** Spec edge case "PDF on very wide comparisons": ≥3 products → landscape. */
export function pickOrientation(productCount: number): 'landscape' | 'portrait' {
  return productCount >= 3 ? 'landscape' : 'portrait';
}

/** The rows the buyer's display mode shows. */
export function filterRowsByMode(
  rows: ComparisonAttributeRow[],
  mode: ComparisonDisplayMode,
): ComparisonAttributeRow[] {
  if (mode === 'all') return rows;
  if (mode === 'common') return rows.filter((r) => r.rowClass === 'common');
  return rows.filter((r) => r.rowClass === 'different');
}

/** Bytes as an inline image: pdfmake recognises PNG and JPEG by header. */
export function imageDataUri(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

/**
 * A multilingual value in a language: exact, then the same primary subtag,
 * then `en-US`, then `en`, then the first (FR-022). The fixed renderer keeps
 * its own English-first pick; this is the template path's.
 */
export function localisedIn(value: Readonly<Record<string, string>>, language: string): string {
  if (value[language] !== undefined) return value[language];
  const primary = language.split('-')[0]?.toLowerCase();
  const sameBase = Object.keys(value).find((key) => key.split('-')[0]?.toLowerCase() === primary);
  if (sameBase) return value[sameBase] ?? '';
  return value['en-US'] ?? value['en'] ?? Object.values(value)[0] ?? '';
}
