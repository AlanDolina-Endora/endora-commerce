import { useCallback, useId, useMemo, useState, type ReactNode } from 'react';
import { ITEMS_TABLE_LIMITS } from '@endora-commerce/contracts';
import { Button, Checkbox, Input, Label, Select } from '@endora-commerce/admin-kit/ui';
import { useTranslation } from '@endora-commerce/admin-kit/i18n';
import { FieldPicker, InternalBadge } from './FieldPicker.js';
import { useCollection } from './collections-context.js';
import { asList, asRecord, FieldName, opOf, text, useListReorder, type Entry } from './shared.js';

/**
 * The **Detail row** field (FR-040): a switch, then up to eight entries, each a
 * field with a label and a rule (*Only if it has a value* by default, *Always*,
 * *Never*), printed under a line as "label: value" joined by the separator.
 */
export interface DetailRowFieldProps {
  readonly value: unknown;
  readonly onChange: (next: Entry) => void;
  readonly readOnly?: boolean;
}

export const ENTRY_VISIBILITY = ['has_value', 'always', 'never'] as const;
export const ENTRY_VISIBILITY_KEY: Record<(typeof ENTRY_VISIBILITY)[number], string> = {
  has_value: 'itemsTable.visibility.hasValue',
  always: 'itemsTable.visibility.always',
  never: 'itemsTable.visibility.never',
};

export function DetailRowField({ value, onChange, readOnly = false }: DetailRowFieldProps): ReactNode {
  const t = useTranslation('document_templates');
  const base = useId();
  const collection = useCollection();
  const fields = collection?.fields ?? [];
  const byPath = useMemo(() => new Map(fields.map((field) => [field.path, field])), [fields]);
  const row = asRecord(value);
  const enabled = row['enabled'] === true || row['enabled'] === 'true';
  const entries = asList(row['entries']);
  const [picking, setPicking] = useState(false);
  const set = (patch: Entry): void => onChange({ ...row, ...patch });
  const setEntries = (next: Entry[]): void => set({ entries: next });
  const nameOf = useCallback(
    (entry: Entry): string => text(entry['label']).trim() || byPath.get(text(entry['field']))?.label || text(entry['field']),
    [byPath],
  );
  const { announcer, buttons } = useListReorder(entries, nameOf, setEntries, readOnly || !enabled);
  const atLimit = entries.length >= ITEMS_TABLE_LIMITS.maxDetailEntries;

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t('itemsTable.detailRow.title')}</legend>
      {announcer}
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={enabled} disabled={readOnly} onChange={(event) => set({ enabled: event.target.checked })} />
        {t('itemsTable.detailRow.enable')}
      </label>
      {enabled ? (
        <>
          <ol className="space-y-2" aria-label={t('itemsTable.detailRow.entries')}>
            {entries.map((entry, index) => {
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
                      aria-label={t('itemsTable.detailRow.remove', { name })}
                      disabled={readOnly}
                      onClick={() => setEntries(entries.filter((_, i) => i !== index))}
                    >
                      ×
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor={`${base}-label-${index}`}>{t('itemsTable.detailRow.label')}</Label>
                      <Input
                        id={`${base}-label-${index}`}
                        value={text(entry['label'])}
                        placeholder={field?.label ?? ''}
                        onChange={(event) => setEntries(entries.map((e, i) => (i === index ? { ...e, label: event.target.value } : e)))}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${base}-rule-${index}`}>{t('itemsTable.visibility')}</Label>
                      <Select
                        id={`${base}-rule-${index}`}
                        value={opOf(entry['visibleWhen'], 'has_value')}
                        onChange={(event) =>
                          setEntries(entries.map((e, i) => (i === index ? { ...e, visibleWhen: { op: event.target.value } } : e)))
                        }
                      >
                        {ENTRY_VISIBILITY.map((op) => (
                          <option key={op} value={op}>
                            {t(ENTRY_VISIBILITY_KEY[op])}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          {picking ? (
            <FieldPicker
              fields={fields.filter((field) => field.path !== 'row.number')}
              onPick={(field) => {
                setEntries([...entries, { field: field.path, label: '', visibleWhen: { op: 'has_value' } }]);
                setPicking(false);
              }}
              onCancel={() => setPicking(false)}
            />
          ) : (
            <div className="space-y-1">
              <Button type="button" variant="outline" size="sm" disabled={readOnly || atLimit} onClick={() => setPicking(true)}>
                {t('itemsTable.detailRow.add')}
              </Button>
              {atLimit ? <p className="text-xs text-muted-foreground">{t('itemsTable.detailRow.limit', { max: ITEMS_TABLE_LIMITS.maxDetailEntries })}</p> : null}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label htmlFor={`${base}-separator`}>{t('itemsTable.detailRow.separator')}</Label>
              <Input
                id={`${base}-separator`}
                value={text(row['separator'], ' · ')}
                maxLength={ITEMS_TABLE_LIMITS.maxSeparatorLength}
                onChange={(event) => set({ separator: event.target.value })}
              />
            </div>
            <div>
              <Label htmlFor={`${base}-size`}>{t('itemsTable.detailRow.fontSize')}</Label>
              <Input
                id={`${base}-size`}
                type="number"
                min={6}
                max={14}
                value={typeof row['fontSize'] === 'number' ? row['fontSize'] : 8}
                onChange={(event) => {
                  const n = Number(event.target.value);
                  if (Number.isFinite(n)) set({ fontSize: Math.min(14, Math.max(6, n)) });
                }}
              />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <Checkbox checked={row['italics'] !== false && row['italics'] !== 'false'} onChange={(event) => set({ italics: event.target.checked })} />
              {t('itemsTable.detailRow.italics')}
            </label>
          </div>
        </>
      ) : null}
    </fieldset>
  );
}
