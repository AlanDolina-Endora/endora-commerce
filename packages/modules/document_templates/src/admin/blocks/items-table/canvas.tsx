import type { CSSProperties, ReactNode } from 'react';
import {
  DOCUMENT_POSITION_FIELD,
  documentValueHasValue,
  evaluateDocumentCondition,
  formatDocumentValue,
  resolveDocumentAlign,
  sumDocumentValues,
  type DocumentFieldDefinition,
  type DocumentItem,
  type DocumentValueFormat,
} from '@endora-commerce/contracts';
import { useTranslation } from '@endora-commerce/admin-kit/i18n';
import { useCollection, useDocumentLanguage } from './collections-context.js';
import { asList, asRecord, opOf, text, type Entry } from './shared.js';

/**
 * The Line items table on the editor's canvas
 * (`specs/153-quote-request-pdf-template/contracts/admin-ui.md` §2): an HTML
 * table drawn over the served sample with the **same** shared functions the
 * PDF uses — `formatDocumentValue`, `evaluateDocumentCondition`,
 * `sumDocumentValues` — so what the operator sees is what prints (FR-036).
 * Pagination is not imitated. A column its rule hides on this sample is drawn
 * faded with a caption, so it can still be found and selected.
 *
 * Inline styles, as every document canvas renderer: the canvas is an iframe.
 */

type Props = Record<string, unknown>;

const colorOf = (value: unknown, fallback: string): string =>
  typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value) ? value : fallback;
const numOf = (value: unknown, fallback: number): number => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const flagOf = (value: unknown, fallback: boolean): boolean =>
  value === true || value === 'true' ? true : value === false || value === 'false' ? false : fallback;

function formatOf(column: Entry, field: DocumentFieldDefinition | undefined): DocumentValueFormat {
  return { ...((field?.defaultFormat ?? {}) as DocumentValueFormat), ...(asRecord(column['format']) as DocumentValueFormat) };
}

export function ItemsTableCanvas(props: Props): ReactNode {
  const t = useTranslation('document_templates');
  const language = useDocumentLanguage();
  const collection = useCollection(props['collection']);
  const fontSize = numOf(props['fontSize'], 9) + 2;
  const border = colorOf(props['borderColor'], '#cbd5e1');
  const headerBackground = colorOf(props['headerBackground'], '#f1f5f9');
  const stripe = flagOf(props['stripedRows'], false) ? colorOf(props['stripeColor'], '#f8fafc') : null;
  const wrapper: CSSProperties = { margin: `0 0 ${numOf(props['marginBottom'], 12)}px`, fontFamily: 'system-ui, sans-serif', fontSize };
  if (!collection) {
    return <p style={{ ...wrapper, color: '#64748b' }}>{t('itemsTable.canvas.noCollection')}</p>;
  }
  const byPath = new Map(collection.fields.map((field) => [field.path, field]));
  const summaryByPath = new Map(collection.summaryFields.map((field) => [field.path, field]));
  const items: readonly DocumentItem[] = collection.sampleItems;
  const columns = asList(props['columns']).map((column) => {
    const path = text(column['field']);
    const op = opOf(column['visibleWhen'], 'always');
    const hidden = op === 'never' || (op === 'any_has_value' && !evaluateDocumentCondition(column['visibleWhen'], { items }, path));
    return { column, path, field: byPath.get(path), hidden };
  });
  const cellStyle = (hidden: boolean, align: CSSProperties['textAlign']): CSSProperties => ({
    border: `1px solid ${border}`,
    padding: '2px 4px',
    textAlign: align,
    opacity: hidden ? 0.35 : 1,
  });
  if (columns.length === 0 || items.length === 0) {
    return <p style={wrapper}>{text(props['emptyText'])}</p>;
  }
  const cell = (entry: (typeof columns)[number], item: DocumentItem): string => {
    if (!entry.field) return text(entry.column['emptyText']);
    const value = item.values[entry.path];
    return documentValueHasValue(value) ? formatDocumentValue(value, formatOf(entry.column, entry.field), language) : text(entry.column['emptyText']);
  };
  const alignOf = (entry: (typeof columns)[number]) =>
    resolveDocumentAlign(
      (['auto', 'left', 'center', 'right'] as const).find((a) => a === entry.column['align']) ?? 'auto',
      entry.field?.defaultAlign,
      entry.field?.valueKind,
    );

  const detail = asRecord(props['detailRow']);
  const detailOn = flagOf(detail['enabled'], false);
  const detailText = (item: DocumentItem): string =>
    asList(detail['entries'])
      .flatMap((entry) => {
        const path = text(entry['field']);
        const field = byPath.get(path);
        const value = item.values[path];
        if (!field || !documentValueHasValue(value)) return [];
        const op = opOf(entry['visibleWhen'], 'has_value');
        if (op === 'never') return [];
        const formatted = formatDocumentValue(value, (field.defaultFormat ?? {}) as DocumentValueFormat, language);
        const label = text(entry['label']).trim();
        return [label ? `${label}: ${formatted}` : formatted];
      })
      .join(text(detail['separator'], ' · '));

  const grouping = props['grouping'] ? asRecord(props['grouping']) : null;
  const groupField = grouping ? text(grouping['field']) : '';
  const groups = new Map<string, DocumentItem[]>();
  for (const item of items) {
    const value = groupField ? item.values[groupField] : null;
    const key = groupField ? (documentValueHasValue(value) ? formatDocumentValue(value, {}, language) : text(grouping?.['emptyLabel'])) : '';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const span = columns.length;
  let rowIndex = 0;
  const rows: ReactNode[] = [];
  for (const [key, members] of groups) {
    if (groupField) {
      rows.push(
        <tr key={`g:${key}`}>
          <td colSpan={span} style={{ ...cellStyle(false, 'left'), fontWeight: 700, background: headerBackground }}>
            {key}
          </td>
        </tr>,
      );
    }
    for (const item of members) {
      const n = rowIndex;
      rowIndex += 1;
      const position = String(item.values[DOCUMENT_POSITION_FIELD] && (item.values[DOCUMENT_POSITION_FIELD] as { value: number }).value);
      rows.push(
        <tr key={`r:${position}:${n}`} style={stripe && n % 2 === 1 ? { background: stripe } : undefined}>
          {columns.map((entry, c) => (
            <td key={c} style={cellStyle(entry.hidden, alignOf(entry))}>
              {cell(entry, item)}
            </td>
          ))}
        </tr>,
      );
      const extra = detailOn ? detailText(item) : '';
      if (extra) {
        rows.push(
          <tr key={`d:${position}:${n}`}>
            <td colSpan={span} style={{ ...cellStyle(false, 'left'), fontStyle: 'italic', color: '#475569', fontSize: fontSize - 1 }}>
              {extra}
            </td>
          </tr>,
        );
      }
    }
    const subtotalField = grouping ? text(grouping['subtotalField']) : '';
    if (groupField && subtotalField) {
      const sum = sumDocumentValues(members.map((item) => item.values[subtotalField]));
      rows.push(
        <tr key={`s:${key}`}>
          <td colSpan={span} style={{ ...cellStyle(false, 'right'), fontWeight: 700 }}>
            {[text(grouping?.['subtotalLabel']), formatDocumentValue(sum, (byPath.get(subtotalField)?.defaultFormat ?? {}) as DocumentValueFormat, language)]
              .filter(Boolean)
              .join(' ')}
          </td>
        </tr>,
      );
    }
  }

  const totals = asList(props['totals']).flatMap((entry) => {
    const path = text(entry['field']);
    const field = summaryByPath.get(path);
    const value = field ? collection.sampleSummary[path] : null;
    const op = opOf(entry['visibleWhen'], 'has_value');
    const shown = op === 'always' || (op !== 'never' && field !== undefined && documentValueHasValue(value));
    if (!shown) return [];
    return [
      {
        label: text(entry['label']).trim() || field?.label || '',
        value: formatDocumentValue(value, (field?.defaultFormat ?? {}) as DocumentValueFormat, language),
        emphasis: flagOf(entry['emphasis'], false),
      },
    ];
  });

  return (
    <div style={wrapper}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            {columns.map((entry, c) => (
              <th key={c} scope="col" style={{ ...cellStyle(entry.hidden, alignOf(entry)), background: headerBackground }}>
                {text(entry.column['label']).trim() || entry.field?.label || ''}
                {entry.hidden ? (
                  <span style={{ display: 'block', fontWeight: 400, fontSize: fontSize - 3 }}>({t('itemsTable.canvas.hiddenInSample')})</span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
      {totals.length > 0 ? (
        <table style={{ borderCollapse: 'collapse', marginLeft: 'auto', marginTop: 6 }}>
          <tbody>
            {totals.map((row, i) => (
              <tr key={i} style={row.emphasis ? { fontWeight: 700, borderTop: `1px solid ${border}` } : undefined}>
                <td style={{ padding: '2px 8px', textAlign: 'right' }}>{row.label}</td>
                <td style={{ padding: '2px 4px', textAlign: 'right' }}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
