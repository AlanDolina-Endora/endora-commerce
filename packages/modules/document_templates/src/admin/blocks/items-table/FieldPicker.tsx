import { useId, useMemo, useState, type ReactNode } from 'react';
import { foldDiacritics, type DocumentFieldDefinition } from '@endora-commerce/contracts';
import { Badge, Button, Input } from '@endora-commerce/admin-kit/ui';
import { useTranslation } from '@endora-commerce/admin-kit/i18n';
import { groupOf } from './collections-context.js';

/**
 * Choose one field of a collection's catalogue: a search box over the names and
 * the fields grouped (*Line*, *Pricing*, *Product attributes*, *Other*), each
 * with an **Internal** badge where customers do not otherwise see the value
 * (owner answer Q7).
 */
export interface FieldPickerProps {
  readonly fields: readonly DocumentFieldDefinition[];
  readonly onPick: (field: DocumentFieldDefinition) => void;
  readonly onCancel: () => void;
  /** Restricts the list (e.g. numeric fields for a subtotal). */
  readonly filter?: (field: DocumentFieldDefinition) => boolean;
}

const GROUPS = ['line', 'pricing', 'product', 'other'] as const;

export function InternalBadge(): ReactNode {
  const t = useTranslation('document_templates');
  return (
    <Badge variant="warning" title={t('itemsTable.columns.internalHint')}>
      {t('itemsTable.columns.internal')}
      <span className="sr-only">: {t('itemsTable.columns.internalHint')}</span>
    </Badge>
  );
}

export function FieldPicker({ fields, onPick, onCancel, filter }: FieldPickerProps): ReactNode {
  const t = useTranslation('document_templates');
  const searchId = useId();
  const [query, setQuery] = useState('');
  const needle = foldDiacritics(query.trim().toLowerCase());
  const shown = useMemo(
    () =>
      fields.filter(
        (field) =>
          (filter ? filter(field) : true) &&
          (needle === '' || foldDiacritics(`${field.label} ${field.path}`.toLowerCase()).includes(needle)),
      ),
    [fields, filter, needle],
  );
  return (
    <div
      className="space-y-2 rounded-md border bg-background p-2"
      role="group"
      aria-label={t('itemsTable.picker.title')}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <label htmlFor={searchId} className="sr-only">
        {t('itemsTable.picker.search')}
      </label>
      <Input
        id={searchId}
        type="search"
        autoFocus
        value={query}
        placeholder={t('itemsTable.picker.search')}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {shown.length === 0 ? <p className="text-sm text-muted-foreground">{t('itemsTable.picker.none')}</p> : null}
        {GROUPS.map((group) => {
          const members = shown.filter((field) => groupOf(field) === group);
          if (members.length === 0) return null;
          return (
            <section key={group} aria-label={t(`itemsTable.picker.group.${group}`)}>
              <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{t(`itemsTable.picker.group.${group}`)}</h4>
              <ul className="space-y-1">
                {members.map((field) => (
                  <li key={field.path}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      onClick={() => onPick(field)}
                    >
                      <span>{field.label}</span>
                      {field.audience === 'internal' ? <InternalBadge /> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onCancel}>
        {t('itemsTable.picker.cancel')}
      </Button>
    </div>
  );
}
