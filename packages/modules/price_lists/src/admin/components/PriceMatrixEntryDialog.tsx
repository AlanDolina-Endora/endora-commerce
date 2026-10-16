import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type {
  PriceMatrixAttributeTarget,
  PriceMatrixEntry,
  PriceMatrixEntryInput,
  PriceMatrixSelectionKind,
} from '@endora-commerce/contracts';
import { ApiError } from '@endora-commerce/admin-kit/lib';
import { ModalDialog, ProductPicker } from '@endora-commerce/admin-kit/components';
import { useTranslation } from '@endora-commerce/admin-kit/i18n';
import {
  createMatrixEntry,
  listRuleTargetCategories,
  listRuleTargetCurrencies,
  searchRuleTargetOrganizations,
  updateMatrixEntry,
  type RuleTargetCategory,
  type RuleTargetOrganization,
} from '../lib/price-matrix-api.js';

/**
 * Create / edit one price matrix entry (feature 148,
 * `contracts/admin-ui-price-matrix.md` §4).
 *
 * Every choice is read from the pricing rule-target endpoints, so the dialog
 * needs `price_lists:read` and nothing from another module's permissions —
 * except the product search, which is the shared `ProductPicker`. The server
 * decides; the dialog places its refusals: an overlap becomes a banner with a
 * way to the conflicting row, everything else shows the envelope's translated
 * sentence.
 */
export interface PriceMatrixEntryDialogProps {
  priceListId: string;
  /** The entry being edited, or `null` to create one. */
  entry: PriceMatrixEntry | null;
  attributes: readonly PriceMatrixAttributeTarget[];
  onClose: () => void;
  onSaved: (entry: PriceMatrixEntry) => void;
  /** Close and point the table at the entry an overlap names. */
  onShowConflict: (entryId: string) => void;
}

type SelectionChoice = PriceMatrixSelectionKind;
type PriceChoice = 'fixed' | 'discount_percent';

const SELECTION_LABEL_KEYS: Record<SelectionChoice, string> = {
  product: 'priceMatrix.selection.product',
  category: 'priceMatrix.selection.category',
  attribute: 'priceMatrix.selection.attribute',
  category_attribute: 'priceMatrix.selection.categoryAttribute',
  all: 'priceMatrix.selection.all',
};

const SELECTION_ORDER: SelectionChoice[] = ['product', 'category', 'attribute', 'category_attribute', 'all'];

function categoryName(category: RuleTargetCategory): string {
  return category.name['en-US'] ?? category.name['en'] ?? Object.values(category.name)[0] ?? category.slug;
}

/** Categories as a flat list in tree order, indented by depth. */
function categoryOptions(categories: readonly RuleTargetCategory[]): Array<{ id: string; label: string }> {
  const byParent = new Map<string | null, RuleTargetCategory[]>();
  for (const c of categories) {
    const siblings = byParent.get(c.parentCategoryId) ?? [];
    siblings.push(c);
    byParent.set(c.parentCategoryId, siblings);
  }
  const out: Array<{ id: string; label: string }> = [];
  const walk = (parent: string | null, depth: number): void => {
    const siblings = [...(byParent.get(parent) ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    for (const c of siblings) {
      out.push({ id: c.id, label: `${'  '.repeat(depth)}${categoryName(c)}` });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  // Orphans whose parent is not in the list still appear.
  for (const c of categories) if (!out.some((o) => o.id === c.id)) out.push({ id: c.id, label: categoryName(c) });
  return out;
}

export function PriceMatrixEntryDialog(props: PriceMatrixEntryDialogProps): ReactNode {
  const { priceListId, entry, attributes, onClose, onSaved, onShowConflict } = props;
  const t = useTranslation('price_lists');
  const ids = {
    category: useId(),
    attribute: useId(),
    value: useId(),
    organization: useId(),
    organizationSearch: useId(),
    from: useId(),
    to: useId(),
    amount: useId(),
    currency: useId(),
    percent: useId(),
    product: useId(),
  };

  const [selection, setSelection] = useState<SelectionChoice>(entry?.selectionKind ?? 'all');
  const [productId, setProductId] = useState<string | null>(entry?.productId ?? null);
  const [categoryId, setCategoryId] = useState<string>(entry?.categoryId ?? '');
  const [attributeKey, setAttributeKey] = useState<string>(entry?.attribute?.key ?? '');
  const [attributeValue, setAttributeValue] = useState<string>(entry?.attribute?.value ?? '');
  const [organizationId, setOrganizationId] = useState<string>(entry?.organizationId ?? '');
  const [organizationSearch, setOrganizationSearch] = useState('');
  const [minQuantity, setMinQuantity] = useState<string>(String(entry?.minQuantity ?? 1));
  const [maxQuantity, setMaxQuantity] = useState<string>(
    entry?.maxQuantity !== null && entry?.maxQuantity !== undefined ? String(entry.maxQuantity) : '',
  );
  const [priceType, setPriceType] = useState<PriceChoice>(entry?.price.type ?? 'discount_percent');
  const [amount, setAmount] = useState<string>(entry?.price.type === 'fixed' ? entry.price.amount : '');
  const [currencyCode, setCurrencyCode] = useState<string>(
    entry?.price.type === 'fixed' ? entry.price.currencyCode : '',
  );
  const [percent, setPercent] = useState<string>(
    entry?.price.type === 'discount_percent' ? entry.price.percent : '',
  );

  const [categories, setCategories] = useState<RuleTargetCategory[]>([]);
  const [organizations, setOrganizations] = useState<RuleTargetOrganization[]>([]);
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; conflictingEntryId: string | null } | null>(null);

  const needsCategory = selection === 'category' || selection === 'category_attribute';
  const needsAttribute = selection === 'attribute' || selection === 'category_attribute';

  useEffect(() => {
    let live = true;
    void listRuleTargetCategories()
      .then((rows) => {
        if (live) setCategories(rows);
      })
      .catch(() => undefined);
    void listRuleTargetCurrencies()
      .then((codes) => {
        if (!live) return;
        setCurrencies(codes);
        setCurrencyCode((current) => current || codes[0] || '');
      })
      .catch(() => undefined);
    return (): void => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    const handle = setTimeout(() => {
      void searchRuleTargetOrganizations(organizationSearch)
        .then((rows) => {
          if (live) setOrganizations(rows);
        })
        .catch(() => undefined);
    }, organizationSearch ? 250 : 0);
    return (): void => {
      live = false;
      clearTimeout(handle);
    };
  }, [organizationSearch]);

  // A fixed price on every product is not a meaningful contract term.
  useEffect(() => {
    if (selection === 'all' && priceType === 'fixed') setPriceType('discount_percent');
  }, [selection, priceType]);

  const selectedAttribute = useMemo(
    () => attributes.find((a) => a.key === attributeKey) ?? null,
    [attributes, attributeKey],
  );
  const organizationChoices = useMemo(() => {
    // Keep the entry's own organization selectable even when a search hides it.
    if (!organizationId || organizations.some((o) => o.id === organizationId)) return organizations;
    return [{ id: organizationId, name: entry?.labels.organization ?? organizationId, taxId: '' }, ...organizations];
  }, [organizations, organizationId, entry]);

  function body(): PriceMatrixEntryInput {
    const max = maxQuantity.trim() === '' ? null : Number(maxQuantity);
    return {
      productId: selection === 'product' ? productId : null,
      categoryId: needsCategory ? categoryId || null : null,
      attribute: needsAttribute && attributeKey && attributeValue ? { key: attributeKey, value: attributeValue } : null,
      organizationId: organizationId || null,
      minQuantity: Number(minQuantity),
      maxQuantity: max,
      price:
        priceType === 'fixed'
          ? { type: 'fixed', amount: amount.trim(), currencyCode }
          : { type: 'discount_percent', percent: percent.trim() },
    };
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = body();
      const saved = entry
        ? await updateMatrixEntry(priceListId, entry.id, payload)
        : await createMatrixEntry(priceListId, payload);
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError) {
        const details = err.envelope.error.details as Record<string, unknown> | undefined;
        const conflict =
          err.envelope.error.code === 'PRICE_MATRIX_ENTRY_OVERLAP' && typeof details?.['conflictingEntryId'] === 'string'
            ? details['conflictingEntryId']
            : null;
        setError({ message: err.envelope.error.message, conflictingEntryId: conflict });
      } else {
        setError({ message: t('priceMatrix.error.save'), conflictingEntryId: null });
      }
    } finally {
      setSaving(false);
    }
  }

  const formId = useId();
  return (
    <ModalDialog
      title={entry ? t('priceMatrix.form.titleEdit') : t('priceMatrix.form.titleCreate')}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <button type="button" className="b2b-btn b2b-btn--ghost" onClick={onClose} disabled={saving}>
            {t('priceMatrix.form.cancel')}
          </button>
          <button type="submit" form={formId} className="b2b-btn b2b-btn--primary" disabled={saving}>
            {t('priceMatrix.form.save')}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={(e): void => void submit(e)} className="b2b-col" style={{ gap: 16 }}>
        {error ? (
          <div role="alert" className="b2b-card" style={{ padding: 12, background: 'var(--danger-soft)', color: 'var(--danger-soft-fg)' }}>
            <div>{error.message}</div>
            {error.conflictingEntryId ? (
              <button
                type="button"
                className="b2b-btn b2b-btn--ghost b2b-btn--sm"
                style={{ marginTop: 8 }}
                onClick={(): void => onShowConflict(error.conflictingEntryId!)}
              >
                {t('priceMatrix.error.overlap.show')}
              </button>
            ) : null}
          </div>
        ) : null}

        <fieldset className="b2b-col" style={{ gap: 6, border: 0, padding: 0, margin: 0 }}>
          <legend className="b2b-label">{t('priceMatrix.form.appliesTo')}</legend>
          {SELECTION_ORDER.map((choice) => (
            <label key={choice} className="b2b-row" style={{ gap: 6, alignItems: 'center' }}>
              <input
                type="radio"
                name="price-matrix-selection"
                value={choice}
                checked={selection === choice}
                onChange={(): void => setSelection(choice)}
              />
              {t(SELECTION_LABEL_KEYS[choice])}
            </label>
          ))}
        </fieldset>

        {selection === 'product' ? (
          <div className="b2b-col" style={{ gap: 4 }}>
            <label className="b2b-label" htmlFor={ids.product}>
              {t('priceMatrix.form.product')}
            </label>
            <ProductPicker
              id={ids.product}
              mode="select"
              value={productId}
              onChange={setProductId}
              ariaLabel={t('priceMatrix.form.product')}
            />
            <p className="b2b-muted" style={{ fontSize: 12 }}>
              {t('priceMatrix.form.organizationRequiredForProduct')}
            </p>
          </div>
        ) : null}

        {needsCategory ? (
          <div className="b2b-col" style={{ gap: 4 }}>
            <label className="b2b-label" htmlFor={ids.category}>
              {t('priceMatrix.form.category')}
            </label>
            <select
              id={ids.category}
              className="b2b-field"
              value={categoryId}
              required
              onChange={(e): void => setCategoryId(e.target.value)}
            >
              <option value="">{t('priceMatrix.form.choose')}</option>
              {categoryOptions(categories).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {needsAttribute ? (
          attributes.length === 0 ? (
            <p className="b2b-muted" role="note" style={{ fontSize: 13 }}>
              {t('priceMatrix.form.noEligibleAttributes')}
            </p>
          ) : (
            <div className="b2b-row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <div className="b2b-col" style={{ gap: 4, flex: 1, minWidth: 160 }}>
                <label className="b2b-label" htmlFor={ids.attribute}>
                  {t('priceMatrix.form.attribute')}
                </label>
                <select
                  id={ids.attribute}
                  className="b2b-field"
                  value={attributeKey}
                  required
                  onChange={(e): void => {
                    setAttributeKey(e.target.value);
                    setAttributeValue('');
                  }}
                >
                  <option value="">{t('priceMatrix.form.choose')}</option>
                  {attributes.map((a) => (
                    <option key={a.key} value={a.key}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="b2b-col" style={{ gap: 4, flex: 1, minWidth: 160 }}>
                <label className="b2b-label" htmlFor={ids.value}>
                  {t('priceMatrix.form.attributeValue')}
                </label>
                <select
                  id={ids.value}
                  className="b2b-field"
                  value={attributeValue}
                  required
                  disabled={!selectedAttribute}
                  onChange={(e): void => setAttributeValue(e.target.value)}
                >
                  <option value="">{t('priceMatrix.form.choose')}</option>
                  {(selectedAttribute?.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {selectedAttribute?.valueType === 'boolean'
                        ? t(`priceMatrix.attribute.boolean.${o.value === 'true' ? 'true' : 'false'}`)
                        : o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )
        ) : null}

        <div className="b2b-col" style={{ gap: 4 }}>
          <label className="b2b-label" htmlFor={ids.organizationSearch}>
            {t('priceMatrix.form.organizationSearch')}
          </label>
          <input
            id={ids.organizationSearch}
            className="b2b-field"
            type="search"
            value={organizationSearch}
            onChange={(e): void => setOrganizationSearch(e.target.value)}
          />
          <label className="b2b-label" htmlFor={ids.organization}>
            {t('priceMatrix.form.organization')}
          </label>
          <select
            id={ids.organization}
            className="b2b-field"
            value={organizationId}
            required={selection === 'product'}
            onChange={(e): void => setOrganizationId(e.target.value)}
          >
            <option value="">{t('priceMatrix.organization.all')}</option>
            {organizationChoices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="b2b-row" style={{ gap: 12, border: 0, padding: 0, margin: 0, flexWrap: 'wrap' }}>
          <legend className="b2b-label">{t('priceMatrix.form.quantity')}</legend>
          <div className="b2b-col" style={{ gap: 4, flex: 1, minWidth: 120 }}>
            <label className="b2b-label" htmlFor={ids.from}>
              {t('priceMatrix.quantity.from')}
            </label>
            <input
              id={ids.from}
              className="b2b-field"
              type="number"
              min={1}
              step={1}
              required
              value={minQuantity}
              onChange={(e): void => setMinQuantity(e.target.value)}
            />
          </div>
          <div className="b2b-col" style={{ gap: 4, flex: 1, minWidth: 120 }}>
            <label className="b2b-label" htmlFor={ids.to}>
              {t('priceMatrix.quantity.to')}
            </label>
            <input
              id={ids.to}
              className="b2b-field"
              type="number"
              min={Number(minQuantity) || 1}
              step={1}
              value={maxQuantity}
              onChange={(e): void => setMaxQuantity(e.target.value)}
            />
          </div>
        </fieldset>

        <fieldset className="b2b-col" style={{ gap: 6, border: 0, padding: 0, margin: 0 }}>
          <legend className="b2b-label">{t('priceMatrix.form.price')}</legend>
          <label className="b2b-row" style={{ gap: 6, alignItems: 'center' }}>
            <input
              type="radio"
              name="price-matrix-price"
              value="fixed"
              checked={priceType === 'fixed'}
              disabled={selection === 'all'}
              onChange={(): void => setPriceType('fixed')}
            />
            {t('priceMatrix.price.fixed')}
          </label>
          {selection === 'all' ? (
            <p className="b2b-muted" style={{ fontSize: 12, marginLeft: 22 }}>
              {t('priceMatrix.form.fixedNotForAll')}
            </p>
          ) : null}
          <label className="b2b-row" style={{ gap: 6, alignItems: 'center' }}>
            <input
              type="radio"
              name="price-matrix-price"
              value="discount_percent"
              checked={priceType === 'discount_percent'}
              onChange={(): void => setPriceType('discount_percent')}
            />
            {t('priceMatrix.price.discountPercent')}
          </label>
          {priceType === 'fixed' ? (
            <div className="b2b-row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <div className="b2b-col" style={{ gap: 4, flex: 1, minWidth: 120 }}>
                <label className="b2b-label" htmlFor={ids.amount}>
                  {t('priceMatrix.price.amount')}
                </label>
                <input
                  id={ids.amount}
                  className="b2b-field"
                  inputMode="decimal"
                  required
                  value={amount}
                  onChange={(e): void => setAmount(e.target.value)}
                />
              </div>
              <div className="b2b-col" style={{ gap: 4, width: 120 }}>
                <label className="b2b-label" htmlFor={ids.currency}>
                  {t('priceMatrix.price.currency')}
                </label>
                <select
                  id={ids.currency}
                  className="b2b-field"
                  required
                  value={currencyCode}
                  onChange={(e): void => setCurrencyCode(e.target.value)}
                >
                  {currencies.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="b2b-col" style={{ gap: 4, maxWidth: 200 }}>
              <label className="b2b-label" htmlFor={ids.percent}>
                {t('priceMatrix.price.percent')}
              </label>
              <input
                id={ids.percent}
                className="b2b-field"
                inputMode="decimal"
                required
                value={percent}
                onChange={(e): void => setPercent(e.target.value)}
              />
              <span className="b2b-muted" style={{ fontSize: 12 }}>
                {t('priceMatrix.price.allCurrencies')}
              </span>
            </div>
          )}
        </fieldset>
      </form>
    </ModalDialog>
  );
}
