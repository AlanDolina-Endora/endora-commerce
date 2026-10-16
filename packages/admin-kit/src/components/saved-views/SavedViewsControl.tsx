import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { savedListViewNameKey, type SavedListView } from '@endora-commerce/contracts';
import { Button } from '../../ui/button.js';
import { Select } from '../../ui/select.js';
import { useTranslation } from '../../i18n/useTranslation.js';
import { DeleteViewDialog } from './DeleteViewDialog.js';
import { SaveViewDialog } from './SaveViewDialog.js';
import { listSavedViews, requestErrorMessage } from './saved-views-api.js';

/** A list's state as a saved view stores it; what each key means is the list's business. */
export interface SavedViewState {
  filters: Record<string, unknown>;
  sort?: { field: string; dir: 'asc' | 'desc' } | null;
  visibleColumns?: string[] | null;
}

export interface SavedViewsControlProps {
  /** The list's saved-view collection, e.g. `/api/v1/admin/catalog/products/list-views`. */
  endpoint: string;
  /** The list's state now — what *Save view* stores. */
  current: SavedViewState;
  /** Apply a chosen view's state to the list. */
  onApply: (state: SavedViewState) => void;
  /** Page-level sink for a failure to load the views; dialog failures stay in the dialog. */
  onError: (message: string) => void;
}

type OpenDialog = { kind: 'save' } | { kind: 'delete'; view: SavedListView } | null;

/**
 * Saved views for an admin list (feature 147; contract
 * `specs/147-saved-views/contracts/admin-kit-saved-views.md` §2): a selector of
 * the caller's own views and every shared one, *Save view* and *Delete view*.
 *
 * The control knows no module: the page supplies the endpoint and maps its
 * state to and from `SavedViewState` (research R-3). It reads only the `core`
 * bundle. It never renames or re-shares a view, so it sends no update request
 * (FR-008), and whether *Delete view* is offered is the server's `canModify`,
 * not a rule re-derived here (R-8).
 */
export function SavedViewsControl(props: SavedViewsControlProps): ReactNode {
  const { endpoint, current, onApply, onError } = props;
  const t = useTranslation('core');
  const [views, setViews] = useState<SavedListView[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const deleteReturnFocusRef = useRef<HTMLElement | null>(null);

  // The page's callback and `t` are read through refs so neither an inline
  // `onError` nor a bundle arriving re-creates `load` and re-requests the list.
  const onErrorRef = useRef(onError);
  const tRef = useRef(t);
  useEffect(() => {
    onErrorRef.current = onError;
    tRef.current = t;
  });

  // Only the latest request may write: StrictMode's double mount and a reload
  // racing the first load would otherwise settle in either order.
  const latestRequest = useRef(0);
  const load = useCallback(async (): Promise<void> => {
    const request = ++latestRequest.current;
    try {
      const list = await listSavedViews(endpoint);
      if (request !== latestRequest.current) return;
      setViews(list);
      setSelectedId((id) => (id && !list.some((view) => view.id === id) ? '' : id));
    } catch (err) {
      if (request !== latestRequest.current) return;
      onErrorRef.current(requestErrorMessage(err, tRef.current('savedViews.error.load')));
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const ownedNameKeys = useMemo(
    () => new Set(views.filter((view) => view.ownedByCaller).map((view) => savedListViewNameKey(view.name))),
    [views],
  );
  const selected = views.find((view) => view.id === selectedId) ?? null;
  const canDelete = selected?.canModify === true;

  const choose = (id: string): void => {
    setSelectedId(id);
    const view = views.find((candidate) => candidate.id === id);
    if (!view) return;
    onApply({ filters: view.filters, sort: view.sort ?? null, visibleColumns: view.visibleColumns ?? null });
  };

  const closeDialog = useCallback((): void => setDialog(null), []);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Select
        ref={selectRef}
        aria-label={t('savedViews.label')}
        className="w-56 min-w-0 max-w-full truncate"
        value={selectedId}
        onChange={(event): void => choose(event.target.value)}
      >
        <option value="">{t('savedViews.none')}</option>
        {views.map((view) => (
          <option key={view.id} value={view.id}>
            {view.shared ? `${view.name} ${t('savedViews.sharedSuffix')}` : view.name}
          </option>
        ))}
      </Select>
      <Button
        ref={saveButtonRef}
        type="button"
        variant="outline"
        size="icon"
        aria-label={t('savedViews.save')}
        title={t('savedViews.save')}
        onClick={(): void => setDialog({ kind: 'save' })}
      >
        <Save aria-hidden="true" />
      </Button>
      <Button
        ref={deleteButtonRef}
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t('savedViews.delete')}
        title={t('savedViews.delete')}
        disabled={!canDelete}
        onClick={(): void => {
          if (!selected) return;
          deleteReturnFocusRef.current = deleteButtonRef.current;
          setDialog({ kind: 'delete', view: selected });
        }}
      >
        <Trash2 aria-hidden="true" />
      </Button>
      {dialog?.kind === 'save' ? (
        <SaveViewDialog
          endpoint={endpoint}
          current={current}
          ownedNameKeys={ownedNameKeys}
          returnFocusRef={saveButtonRef}
          onClose={closeDialog}
          onSaved={(): void => {
            setDialog(null);
            void load();
          }}
        />
      ) : null}
      {dialog?.kind === 'delete' ? (
        <DeleteViewDialog
          endpoint={endpoint}
          view={dialog.view}
          returnFocusRef={deleteReturnFocusRef}
          onClose={closeDialog}
          onDeleted={(): void => {
            deleteReturnFocusRef.current = selectRef.current;
            setSelectedId('');
            setDialog(null);
            void load();
          }}
          onGone={(): void => {
            // *Delete view* is about to be disabled, so it cannot take focus back.
            deleteReturnFocusRef.current = selectRef.current;
            setSelectedId('');
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
