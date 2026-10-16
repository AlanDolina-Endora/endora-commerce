import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import type {
  PriceMatrixAttributeTarget,
  PriceMatrixEntry,
  PriceMatrixSelectionKind,
} from '@endora-commerce/contracts';
import { ApiError, useAuth } from '@endora-commerce/admin-kit/lib';
import { ModalDialog, PaginationFooter } from '@endora-commerce/admin-kit/components';
import { AppLanguageContext, useTranslation } from '@endora-commerce/admin-kit/i18n';
import {
  deleteMatrixEntry,
  listMatrixAttributes,
  listMatrixEntries,
  searchRuleTargetOrganizations,
  type RuleTargetOrganization,
} from '../lib/price-matrix-api.js';
import {
  formatMatrixPrice,
  formatQuantityWindow,
  matrixSelectionSummary,
} from '../lib/price-matrix-format.js';
import { PriceMatrixEntryDialog } from './PriceMatrixEntryDialog.js';

/**
 * The *Price matrix* tab of a price list (feature 148,
 * `specs/148-price-list-matrix-rules/contracts/admin-ui-price-matrix.md`).
 *
 * Visible to `price_lists:read`; every write control renders only for
 * `price_lists:write`, so a read-only operator never fills a form in to meet a
 * 403. Strings come from this module's own bundle.
 */
export interface PriceMatrixTabProps {
  priceListId: string;
}

const PAGE_SIZE_DEFAULT = 50;

const KIND_FILTERS: Array<{ value: PriceMatrixSelectionKind | ''; key: string }> = [
  { value: '', key: 'priceMatrix.filter.any' },
  { value: 'product', key: 'priceMatrix.selection.product' },
  { value: 'category', key: 'priceMatrix.selection.category' },
  { value: 'attribute', key: 'priceMatrix.selection.attribute' },
  { value: 'category_attribute', key: 'priceMatrix.selection.categoryAttribute' },
  { value: 'all', key: 'priceMatrix.selection.all' },
];

export function PriceMatrixTab({ priceListId }: PriceMatrixTabProps): ReactNode {
  const t = useTranslation('price_lists');
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('price_lists:write');
  const language = useContext(AppLanguageContext)?.language ?? null;

  const [kind, setKind] = useState<PriceMatrixSelectionKind | ''>('');
  const [organizationFilter, setOrganizationFilter] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_DEFAULT);
  const [items, setItems] = useState<PriceMatrixEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(5000);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attributes, setAttributes] = useState<PriceMatrixAttributeTarget[]>([]);
  const [organizations, setOrganizations] = useState<RuleTargetOrganization[]>([]);
  const [dialog, setDialog] = useState<{ entry: PriceMatrixEntry | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PriceMatrixEntry | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await listMatrixEntries(
        priceListId,
        {
          page,
          pageSize,
          ...(kind ? { selectionKind: kind } : {}),
          ...(organizationFilter ? { organizationId: organizationFilter } : {}),
        },
        language,
      );
      setItems(data.items);
      setTotal(data.total);
      setLimit(data.limit);
    } catch (err) {
      setError(err instanceof ApiError ? err.envelope.error.message : t('priceMatrix.error.load'));
    } finally {
      setLoading(false);
    }
  }, [priceListId, page, pageSize, kind, organizationFilter, language, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let live = true;
    void listMatrixAttributes(language)
      .then((rows) => {
        if (live) setAttributes(rows);
      })
      .catch(() => undefined);
    void searchRuleTargetOrganizations('')
      .then((rows) => {
        if (live) setOrganizations(rows);
      })
      .catch(() => undefined);
    return (): void => {
      live = false;
    };
  }, [language]);

  const booleanAttributes = useMemo(
    () => new Set(attributes.filter((a) => a.valueType === 'boolean').map((a) => a.key)),
    [attributes],
  );

  async function remove(entry: PriceMatrixEntry): Promise<void> {
    try {
      await deleteMatrixEntry(priceListId, entry.id);
      setConfirmDelete(null);
      await load();
    } catch (err) {
      setConfirmDelete(null);
      setError(err instanceof ApiError ? err.envelope.error.message : t('priceMatrix.error.save'));
    }
  }

  return (
    <div className="b2b-col" style={{ gap: 16 }}>
      <p className="b2b-muted" style={{ fontSize: 13, margin: 0 }}>
        {t('priceMatrix.intro')}
      </p>
      {!canWrite ? (
        <p role="note" className="b2b-muted" style={{ fontSize: 13, margin: 0 }}>
          {t('priceMatrix.readOnly')}
        </p>
      ) : null}

      <div className="b2b-row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label className="b2b-col" style={{ gap: 4 }}>
          <span className="b2b-label">{t('priceMatrix.filter.kind')}</span>
          <select
            className="b2b-field"
            value={kind}
            onChange={(e): void => {
              setKind(e.target.value as PriceMatrixSelectionKind | '');
              setPage(0);
            }}
          >
            {KIND_FILTERS.map((f) => (
              <option key={f.value || 'any'} value={f.value}>
                {t(f.key)}
              </option>
            ))}
          </select>
        </label>
        <label className="b2b-col" style={{ gap: 4 }}>
          <span className="b2b-label">{t('priceMatrix.filter.organization')}</span>
          <select
            className="b2b-field"
            value={organizationFilter}
            onChange={(e): void => {
              setOrganizationFilter(e.target.value);
              setPage(0);
            }}
          >
            <option value="">{t('priceMatrix.filter.any')}</option>
            <option value="none">{t('priceMatrix.filter.noOrganization')}</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <div style={{ flex: 1 }} />
        <span className="b2b-muted" style={{ fontSize: 12 }}>
          {t('priceMatrix.counter', { count: total, limit })}
        </span>
        {canWrite ? (
          <button
            type="button"
            className="b2b-btn b2b-btn--primary"
            disabled={total >= limit}
            onClick={(): void => setDialog({ entry: null })}
          >
            <Plus size={14} /> {t('priceMatrix.add')}
          </button>
        ) : null}
      </div>

      {error ? (
        <div role="alert" className="b2b-card" style={{ padding: 12, background: 'var(--danger-soft)', color: 'var(--danger-soft-fg)' }}>
          {error}{' '}
          <button type="button" className="b2b-btn b2b-btn--ghost b2b-btn--sm" onClick={(): void => void load()}>
            {t('priceMatrix.error.retry')}
          </button>
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <div className="b2b-muted" aria-busy="true" style={{ fontSize: 13 }}>
          {t('priceMatrix.loading')}
        </div>
      ) : !error && items.length === 0 ? (
        <div className="b2b-col" style={{ gap: 4, padding: 24, textAlign: 'center' }}>
          <strong>{t('priceMatrix.empty.title')}</strong>
          <span className="b2b-muted" style={{ fontSize: 13 }}>
            {t('priceMatrix.empty.body')}
          </span>
        </div>
      ) : items.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="b2b-tbl">
            <thead>
              <tr>
                <th scope="col">{t('priceMatrix.column.appliesTo')}</th>
                <th scope="col">{t('priceMatrix.column.organization')}</th>
                <th scope="col">{t('priceMatrix.column.quantity')}</th>
                <th scope="col">{t('priceMatrix.column.price')}</th>
                <th scope="col">{t('priceMatrix.column.status')}</th>
                {canWrite ? <th scope="col">{t('priceMatrix.column.actions')}</th> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr
                  key={entry.id}
                  data-testid={`price-matrix-row-${entry.id}`}
                  data-highlighted={highlighted === entry.id ? 'true' : undefined}
                  style={highlighted === entry.id ? { background: 'var(--warning-soft, #fff7e0)' } : undefined}
                >
                  <td>
                    {matrixSelectionSummary(entry, t, booleanAttributes)}
                  </td>
                  <td>
                    {entry.organizationId === null
                      ? t('priceMatrix.organization.all')
                      : (entry.labels.organization ?? t('priceMatrix.targetDeleted'))}
                  </td>
                  <td>{formatQuantityWindow(entry.minQuantity, entry.maxQuantity)}</td>
                  <td>
                    {formatMatrixPrice(entry.price)}
                    {entry.price.type === 'discount_percent' ? (
                      <span className="b2b-muted" style={{ fontSize: 11, marginLeft: 6 }}>
                        {t('priceMatrix.price.allCurrencies')}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    {entry.active ? (
                      <span className="b2b-badge b2b-badge--success">{t('priceMatrix.status.active')}</span>
                    ) : (
                      <span className="b2b-col" style={{ gap: 2 }}>
                        <span className="b2b-badge b2b-badge--outline">{t('priceMatrix.status.inactive')}</span>
                        {entry.inactiveReason ? (
                          <span className="b2b-muted" style={{ fontSize: 11 }}>
                            {t(`priceMatrix.inactive.${entry.inactiveReason}`)}
                          </span>
                        ) : null}
                      </span>
                    )}
                  </td>
                  {canWrite ? (
                    <td>
                      <div className="b2b-row" style={{ gap: 4 }}>
                        <button
                          type="button"
                          className="b2b-btn b2b-btn--ghost b2b-btn--sm"
                          onClick={(): void => setDialog({ entry })}
                        >
                          {t('priceMatrix.edit')}
                        </button>
                        <button
                          type="button"
                          className="b2b-btn b2b-btn--ghost b2b-btn--sm"
                          onClick={(): void => setConfirmDelete(entry)}
                        >
                          {t('priceMatrix.delete')}
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          <PaginationFooter
            page={page}
            pageSize={pageSize as 50}
            total={total}
            onPageSizeChange={(next): void => {
              setPageSize(next);
              setPage(0);
            }}
            onPrev={(): void => setPage((p) => Math.max(0, p - 1))}
            onNext={(): void => setPage((p) => p + 1)}
          />
        </div>
      ) : null}

      {dialog ? (
        <PriceMatrixEntryDialog
          priceListId={priceListId}
          entry={dialog.entry}
          attributes={attributes}
          onClose={(): void => setDialog(null)}
          onSaved={(saved): void => {
            setDialog(null);
            setHighlighted(saved.id);
            void load();
          }}
          onShowConflict={(entryId): void => {
            setDialog(null);
            setKind('');
            setOrganizationFilter('');
            setHighlighted(entryId);
          }}
        />
      ) : null}

      {confirmDelete ? (
        <ModalDialog
          title={t('priceMatrix.delete')}
          onClose={(): void => setConfirmDelete(null)}
          footer={
            <>
              <button type="button" className="b2b-btn b2b-btn--ghost" onClick={(): void => setConfirmDelete(null)}>
                {t('priceMatrix.form.cancel')}
              </button>
              <button
                type="button"
                className="b2b-btn b2b-btn--danger"
                onClick={(): void => void remove(confirmDelete)}
              >
                {t('priceMatrix.delete')}
              </button>
            </>
          }
        >
          <p>{t('priceMatrix.delete.confirm')}</p>
        </ModalDialog>
      ) : null}
    </div>
  );
}
