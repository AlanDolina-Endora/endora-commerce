import type { RfqDiffEntry } from '../api/rfq';
import { tForLocale } from '../i18n/messages';

/**
 * One entry of the customer's comparison with the last revision they saw, as
 * a sentence. Moved out of the quote request page so it can be asserted; the
 * line and note sentences read as they did. Feature 159 adds the grouping
 * notice, which names nothing: the arrangement of the lines changed.
 */
export function describeRfqDiff(d: RfqDiffEntry, locale: string): string {
  switch (d.kind) {
    case 'header_note':
      return `Uwagi: „${d.before ?? '—'}” → „${d.after ?? '—'}”`;
    case 'line_added':
      return `Dodano: ${d.productName} × ${d.quantity}${d.agreedUnitPrice !== null ? ` po ${d.agreedUnitPrice.toFixed(2)}` : ''}`;
    case 'line_removed':
      return `Usunięto: ${d.productName}`;
    case 'line_quantity':
      return `${d.productName}: ilość ${d.before} → ${d.after}`;
    case 'line_agreed_unit_price':
      return `${d.productName}: cena ${d.before !== null ? d.before.toFixed(2) : '—'} → ${d.after !== null ? d.after.toFixed(2) : '—'}`;
    case 'grouping':
      return tForLocale(locale)('quoteRequest.diff.grouping');
  }
}
