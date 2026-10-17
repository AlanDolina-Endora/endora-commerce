import type { ComponentConfig } from '@puckeditor/core';
import { createColorField } from '@endora-commerce/page-builder-core';
import { ItemsTableCanvas } from './canvas.js';
import { ColumnsField } from './ColumnsField.js';
import { DetailRowField } from './DetailRowField.js';
import { GroupingField } from './GroupingField.js';
import { TotalsField } from './TotalsField.js';
import { useDocumentCollections } from './collections-context.js';
import { Label, Select } from '@endora-commerce/admin-kit/ui';
import { useTranslation } from '@endora-commerce/admin-kit/i18n';
import { useId, type ReactNode } from 'react';

export { DocumentCollectionsProvider } from './collections-context.js';

/** What Puck hands a custom field's `render`. */
interface CustomFieldRenderProps {
  readonly value: unknown;
  readonly onChange: (next: unknown) => void;
  readonly readOnly?: boolean;
}

/** The *Lines* select — shown only when the type declares more than one collection. */
function CollectionField({ value, onChange }: { value: unknown; onChange: (next: string) => void }): ReactNode {
  const t = useTranslation('document_templates');
  const id = useId();
  const collections = useDocumentCollections();
  if (collections.length <= 1) return null;
  return (
    <div>
      <Label htmlFor={id}>{t('itemsTable.collection')}</Label>
      <Select id={id} value={typeof value === 'string' && value !== '' ? value : (collections[0]?.key ?? '')} onChange={(event) => onChange(event.target.value)}>
        {collections.map((collection) => (
          <option key={collection.key} value={collection.key}>
            {collection.key}
          </option>
        ))}
      </Select>
    </div>
  );
}

/**
 * The editor of `document_templates.ItemsTable`: the canvas renderer and the
 * custom fields that override the descriptor's JSON editors for the structured
 * settings, plus colour pickers for the style.
 */
export const itemsTableEditor = {
  render: ItemsTableCanvas,
  fields: {
    collection: {
      type: 'custom',
      label: 'Lines',
      render: ({ value, onChange }: CustomFieldRenderProps) => <CollectionField value={value} onChange={onChange} />,
    },
    columns: {
      type: 'custom',
      label: 'Columns',
      render: ({ value, onChange, readOnly }: CustomFieldRenderProps) => <ColumnsField value={value} onChange={onChange} readOnly={readOnly === true} />,
    },
    detailRow: {
      type: 'custom',
      label: 'Detail row',
      render: ({ value, onChange, readOnly }: CustomFieldRenderProps) => <DetailRowField value={value} onChange={onChange} readOnly={readOnly === true} />,
    },
    totals: {
      type: 'custom',
      label: 'Totals',
      render: ({ value, onChange, readOnly }: CustomFieldRenderProps) => <TotalsField value={value} onChange={onChange} readOnly={readOnly === true} />,
    },
    grouping: {
      type: 'custom',
      label: 'Grouping',
      render: ({ value, onChange, readOnly }: CustomFieldRenderProps) => <GroupingField value={value} onChange={onChange} readOnly={readOnly === true} />,
    },
    headerBackground: createColorField({ label: 'Header background' }),
    borderColor: createColorField({ label: 'Border colour' }),
    stripeColor: createColorField({ label: 'Stripe colour' }),
  },
} as unknown as ComponentConfig;
