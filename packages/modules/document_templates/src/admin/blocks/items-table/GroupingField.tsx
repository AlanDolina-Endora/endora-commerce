import { useId, type ReactNode } from 'react';
import { ITEMS_TABLE_LIMITS } from '@endora-commerce/contracts';
import { Input, Label, Select } from '@endora-commerce/admin-kit/ui';
import { useTranslation } from '@endora-commerce/admin-kit/i18n';
import { useCollection } from './collections-context.js';
import { asRecord, text, type Entry } from './shared.js';

/**
 * The **Grouping** field (FR-042): *No grouping*, or a field to group the lines
 * by, the group name for lines without a value, and an optional subtotal of one
 * numeric or money field.
 */
export interface GroupingFieldProps {
  readonly value: unknown;
  readonly onChange: (next: Entry | null) => void;
  readonly readOnly?: boolean;
}

export function GroupingField({ value, onChange, readOnly = false }: GroupingFieldProps): ReactNode {
  const t = useTranslation('document_templates');
  const base = useId();
  const fields = (useCollection()?.fields ?? []).filter((field) => field.path !== 'row.number');
  const grouping = value === null || value === undefined ? null : asRecord(value);
  const numeric = fields.filter((field) => field.valueKind === 'number' || field.valueKind === 'money');
  const set = (patch: Entry): void => onChange({ ...(grouping ?? {}), ...patch });
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t('itemsTable.grouping.title')}</legend>
      <div>
        <Label htmlFor={`${base}-field`}>{t('itemsTable.grouping.field')}</Label>
        <Select
          id={`${base}-field`}
          disabled={readOnly}
          value={grouping ? text(grouping['field']) : ''}
          onChange={(event) =>
            event.target.value === ''
              ? onChange(null)
              : set({
                  field: event.target.value,
                  emptyLabel: text(grouping?.['emptyLabel']),
                  subtotalField: grouping?.['subtotalField'] ?? null,
                  subtotalLabel: text(grouping?.['subtotalLabel']),
                })
          }
        >
          <option value="">{t('itemsTable.grouping.none')}</option>
          {fields.map((field) => (
            <option key={field.path} value={field.path}>
              {field.label}
            </option>
          ))}
        </Select>
      </div>
      {grouping ? (
        <>
          <div>
            <Label htmlFor={`${base}-empty`}>{t('itemsTable.grouping.emptyLabel')}</Label>
            <Input
              id={`${base}-empty`}
              value={text(grouping['emptyLabel'])}
              maxLength={ITEMS_TABLE_LIMITS.maxGroupEmptyLabelLength}
              onChange={(event) => set({ emptyLabel: event.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={`${base}-subtotal`}>{t('itemsTable.grouping.subtotalField')}</Label>
              <Select
                id={`${base}-subtotal`}
                value={text(grouping['subtotalField'])}
                onChange={(event) => set({ subtotalField: event.target.value === '' ? null : event.target.value })}
              >
                <option value="">{t('itemsTable.grouping.noSubtotal')}</option>
                {numeric.map((field) => (
                  <option key={field.path} value={field.path}>
                    {field.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor={`${base}-subtotal-label`}>{t('itemsTable.grouping.subtotalLabel')}</Label>
              <Input
                id={`${base}-subtotal-label`}
                value={text(grouping['subtotalLabel'])}
                onChange={(event) => set({ subtotalLabel: event.target.value })}
              />
            </div>
          </div>
        </>
      ) : null}
    </fieldset>
  );
}
