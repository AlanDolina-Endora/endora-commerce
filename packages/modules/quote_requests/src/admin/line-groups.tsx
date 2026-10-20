import { useMemo, type ReactNode } from 'react';
import type { LineGroupsEditorLabels } from '@endora-commerce/admin-kit/components';
import { useTranslation, useTranslationContext } from '@endora-commerce/admin-kit/i18n';
import { useRfqNumberFormat } from './number-format.js';

/**
 * Feature 159 — what the quote request screens share about line groups: the
 * editor's labels from this module's bundle (the kit carries no strings), and
 * a section's summary by the screens' own totals rule (research R-15).
 */

/** The `LineGroupsEditor` labels, in the admin language. */
export function useQuoteLineGroupLabels(): LineGroupsEditorLabels {
  const t = useTranslation('quote_requests');
  return useMemo(() => {
    const g = (key: string, params?: Record<string, string | number>): string => t(`lineGroups.${key}`, params);
    return {
      addGroup: g('addGroup'),
      groupName: g('groupName'),
      groupNamePlaceholder: g('groupNamePlaceholder'),
      nameRequired: g('nameRequired'),
      deleteGroup: ({ name }) => g('deleteGroup', { name }),
      deletedAnnouncement: ({ name }) => g('deletedAnnouncement', { name }),
      ungrouped: g('ungrouped'),
      emptyGroup: g('emptyGroup'),
      moveToGroup: ({ name }) => g('moveToGroup', { name }),
      moveGroupUp: ({ name }) => g('moveUp', { name }),
      moveGroupDown: ({ name }) => g('moveDown', { name }),
      limitReached: ({ max }) => g('limitReached', { max }),
      instructions: g('instructions'),
      reorder: {
        itemGrabbed: (c) => g('announce.grabbed', { ...c }),
        itemMoved: (c) => g('announce.moved', { ...c }),
        itemDropped: (c) => g('announce.dropped', { ...c }),
        itemCancelled: (c) => g('announce.cancelled', { ...c }),
        groupGrabbed: (c) => g('announce.groupGrabbed', { ...c }),
        groupMoved: (c) => g('announce.groupMoved', { ...c }),
        groupDropped: (c) => g('announce.groupDropped', { ...c }),
        groupCancelled: (c) => g('announce.groupCancelled', { ...c }),
        atStart: ({ name }) => g('announce.atStart', { name }),
        atEnd: ({ name }) => g('announce.atEnd', { name }),
        itemHandle: ({ name }) => g('announce.handle', { name }),
        groupHandle: ({ name }) => g('announce.groupHandle', { name }),
      },
    };
  }, [t]);
}

/** One line as a section summary counts it. */
export interface SummaryLine {
  /** Net line total by the screen's rule; `null` = not priced. */
  readonly net: number | null;
  /** The line's reference total (list price × quantity); `null` = none. */
  readonly reference: number | null;
}

export interface SectionTotals {
  readonly count: number;
  /** `null` unless every line is priced — the screen's own "every line or none". */
  readonly net: number | null;
  readonly vat: number | null;
  readonly gross: number | null;
  /** Only when every line is priced and has a reference, and the difference is positive. */
  readonly discount: number | null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function sectionTotals(lines: readonly SummaryLine[], taxRate: number): SectionTotals {
  const count = lines.length;
  if (count === 0 || lines.some((line) => line.net === null)) {
    return { count, net: null, vat: null, gross: null, discount: null };
  }
  const net = round2(lines.reduce((sum, line) => sum + line.net!, 0));
  // The section's VAT from its net, as the PDF computes it; the document total
  // stays authoritative (a section may differ from it by a cent).
  const vat = round2(net * taxRate);
  const everyReference = lines.every((line) => line.reference !== null);
  const reference = everyReference ? round2(lines.reduce((sum, line) => sum + line.reference!, 0)) : null;
  const discount = reference !== null && reference > net ? round2(reference - net) : null;
  return { count, net, vat, gross: round2(net + vat), discount };
}

/** "3 items · Net 300.00 PLN · VAT 69.00 PLN · Gross 369.00 PLN · Discount 12.00 PLN". */
export function useSectionSummaryText(): (totals: SectionTotals, currency: string) => string {
  const t = useTranslation('quote_requests');
  const { language } = useTranslationContext();
  const format = useRfqNumberFormat();
  return useMemo(() => {
    const plural = new Intl.PluralRules(language);
    return (totals, currency) => {
      const form = plural.select(totals.count);
      const itemsKey = `lineGroups.summary.items.${form}`;
      const items = t(itemsKey, { count: totals.count });
      const parts = [items.startsWith('quote_requests.') ? t('lineGroups.summary.items.other', { count: totals.count }) : items];
      if (totals.net !== null) {
        parts.push(t('lineGroups.summary.net', { amount: format.money(totals.net, currency) }));
        parts.push(t('lineGroups.summary.vat', { amount: format.money(totals.vat ?? 0, currency) }));
        parts.push(t('lineGroups.summary.gross', { amount: format.money(totals.gross ?? 0, currency) }));
      }
      if (totals.discount !== null) {
        parts.push(t('lineGroups.summary.discount', { amount: format.money(totals.discount, currency) }));
      }
      return parts.join(' · ');
    };
  }, [t, language, format]);
}

export function SectionSummary(props: { text: string }): ReactNode {
  return <p className="text-xs tabular-nums text-muted-foreground">{props.text}</p>;
}
