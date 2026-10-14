import { useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Loader2, TriangleAlert } from 'lucide-react';
import type { SavedListView } from '@endora-commerce/contracts';
import { Button } from '../../ui/button.js';
import { useTranslation } from '../../i18n/useTranslation.js';
import { ModalDialog } from '../modal-dialog/ModalDialog.js';
import { deleteSavedView, isNotFound, requestErrorMessage } from './saved-views-api.js';

/**
 * The confirmation behind *Delete view* (feature 147, FR-023; contract
 * `admin-kit-saved-views.md` §2 *Delete confirmation*). Internal to the kit.
 *
 * Focus opens on *Cancel*, so Enter on an opened confirmation keeps the view —
 * the destructive action has to be chosen, not defaulted into. The view's name
 * reaches the copy through `t(…, { name })`, which substitutes a string, and
 * is rendered as a text child: a name is never markup.
 */
export interface DeleteViewDialogProps {
  endpoint: string;
  view: SavedListView;
  /**
   * Where focus lands when the dialog closes. Read at close time: the control
   * re-points it at the selector once the view is gone.
   */
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** 2xx — the view is deleted; the control closes the dialog. */
  onDeleted: () => void;
  /** 404 — the view was deleted elsewhere; the dialog stays open and says so. */
  onGone: () => void;
}

export function DeleteViewDialog(props: DeleteViewDialogProps): ReactNode {
  const { endpoint, view, returnFocusRef, onClose, onDeleted, onGone } = props;
  const t = useTranslation('core');
  const errorId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmDelete = async (): Promise<void> => {
    if (inFlight.current || gone) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await deleteSavedView(endpoint, view.id);
      inFlight.current = false;
      onDeleted();
    } catch (err) {
      inFlight.current = false;
      setBusy(false);
      if (isNotFound(err)) {
        setGone(true);
        setError(t('savedViews.error.gone'));
        onGone();
      } else {
        setError(requestErrorMessage(err, t('savedViews.error.delete')));
      }
    }
  };

  return (
    <ModalDialog
      title={t('savedViews.deleteDialog.title')}
      onClose={onClose}
      busy={busy}
      initialFocusRef={cancelRef}
      finalFocusRef={returnFocusRef}
      footer={
        <>
          <Button ref={cancelRef} type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t('common.action.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || gone}
            aria-describedby={errorId}
            onClick={(): void => void confirmDelete()}
          >
            {busy ? <Loader2 aria-hidden="true" className="motion-safe:animate-spin" /> : null}
            {t('common.action.delete')}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p>{t('savedViews.deleteDialog.body', { name: view.name })}</p>
        {view.shared ? (
          <p className="flex items-start gap-2 text-muted-foreground">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{t('savedViews.deleteDialog.sharedWarning')}</span>
          </p>
        ) : null}
        <p id={errorId} role="alert" className="min-h-5 text-destructive">
          {error}
        </p>
      </div>
    </ModalDialog>
  );
}
