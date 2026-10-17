import { useCallback, useId, useMemo, type ReactNode } from 'react';
import { ITEMS_TABLE_LIMITS } from '@endora-commerce/contracts';
import { Button, Checkbox, Input, Label, Select } from '@endora-commerce/admin-kit/ui';
import { useTranslation } from '@endora-commerce/admin-kit/i18n';
import { InternalBadge } from './FieldPicker.js';
import { ENTRY_VISIBILITY, ENTRY_VISIBILITY_KEY } from './DetailRowField.js';
import { NO_FIELDS, useCollection } from './collections-context.js';
import { asList, FieldName, opOf, text, useListReorder, type Entry } from './shared.js';

/**
 * The **Totals** field (FR-041): the collection's totals the table prints under
 * it — each with a label, a rule (*Only if it has a value* by default) and
 * *Emphasise* — in an order the operator sets. At most ten.
 */
export interface TotalsFieldProps {
  readonly value: unknown;
  readonly onChange: (next: Entry[]) => void;
  readonly readOnly?: boolean;
}

export function TotalsField({ value, onChange, readOnly = false }: TotalsFieldProps): ReactNode {
  const t = useTranslation('document_templates');
  const base = useId();
  const collection = useCollection();
  const summaryFields = collection?.summaryFields ?? NO_FIELDS;
  const byPath = useMemo(() => new Map(summaryFields.map((field) => [field.path, field])), [summaryFields]);
  const totals = asList(value);
  const nameOf = useCallback(
    (entry: Entry): string => text(entry['label']).trim() || byPath.get(text(entry['field']))?.label || text(entry['field']),
    [byPath],
  );
  const { announcer, buttons } = useListReorder(totals, nameOf, onChange, readOnly);
  const atLimit = totals.length >= ITEMS_TABLE_LIMITS.maxTotals;
  const update = (index: number, patch: Entry): void => onChange(totals.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t('itemsTable.totals.title')}</legend>
      {announcer}
      {totals.length === 0 ? <p className="text-sm text-muted-foreground">{t('itemsTable.totals.empty')}</p> : null}
      <ol className="space-y-2">
        {totals.map((entry, index) => {
          const path = text(entry['field']);
          const field = byPath.get(path);
          const name = nameOf(entry);
          return (
            <li key={`${index}:${path}`} className="space-y-1 rounded-md border p-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 flex-1">
                  <FieldName field={field} path={path} />
                </span>
                {field?.audience === 'internal' ? <InternalBadge /> : null}
                {buttons(index)}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={t('itemsTable.totals.remove', { name })}
                  disabled={readOnly}
                  onClick={() => onChange(totals.filter((_, i) => i !== index))}
                >
                  ×
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label htmlFor={`${base}-label-${index}`}>{t('itemsTable.totals.label')}</Label>
                  <Input
                    id={`${base}-label-${index}`}
                    value={text(entry['label'])}
                    placeholder={field?.label ?? ''}
                    onChange={(event) => update(index, { label: event.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor={`${base}-rule-${index}`}>{t('itemsTable.visibility')}</Label>
                  <Select
                    id={`${base}-rule-${index}`}
                    value={opOf(entry['visibleWhen'], 'has_value')}
                    onChange={(event) => update(index, { visibleWhen: { op: event.target.value } })}
                  >
                    {ENTRY_VISIBILITY.map((op) => (
                      <option key={op} value={op}>
                        {t(ENTRY_VISIBILITY_KEY[op])}
                      </option>
                    ))}
                  </Select>
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <Checkbox
                    checked={entry['emphasis'] === true || entry['emphasis'] === 'true'}
                    onChange={(event) => update(index, { emphasis: event.target.checked })}
                  />
                  {t('itemsTable.totals.emphasis')}
                </label>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="space-y-1">
        <Label htmlFor={`${base}-add`}>{t('itemsTable.totals.add')}</Label>
        <Select
          id={`${base}-add`}
          value=""
          disabled={readOnly || atLimit || summaryFields.length === 0}
          onChange={(event) => {
            const path = event.target.value;
            if (path === '') return;
            onChange([...totals, { field: path, label: '', visibleWhen: { op: 'has_value' }, emphasis: false }]);
          }}
        >
          <option value="">—</option>
          {summaryFields.map((field) => (
            <option key={field.path} value={field.path}>
              {field.label}
              {field.audience === 'internal' ? ` (${t('itemsTable.columns.internal')})` : ''}
            </option>
          ))}
        </Select>
        {atLimit ? <p className="text-xs text-muted-foreground">{t('itemsTable.totals.limit', { max: ITEMS_TABLE_LIMITS.maxTotals })}</p> : null}
      </div>
    </fieldset>
  );
}
