import { useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { Loader2 } from 'lucide-react';
import {
  SAVED_LIST_VIEW_NAME_MAX,
  hasForbiddenNameCharacters,
  savedListViewNameKey,
} from '@endora-commerce/contracts';
import { Button } from '../../ui/button.js';
import { Checkbox } from '../../ui/checkbox.js';
import { Input } from '../../ui/input.js';
import { Label } from '../../ui/label.js';
import { useTranslation } from '../../i18n/useTranslation.js';
import { ModalDialog } from '../modal-dialog/ModalDialog.js';
import { createSavedView, isConflict, requestErrorMessage } from './saved-views-api.js';
import type { SavedViewState } from './SavedViewsControl.js';

/**
 * The save dialog behind *Save view* (feature 147, FR-001 – FR-006, FR-022;
 * contract `admin-kit-saved-views.md` §2). Internal to the kit.
 *
 * The client checks run in the contract's order and send nothing when one
 * fails. The duplicate-name check is a best-effort pre-check; the server stays
 * the judge (a 409 it could not foresee — a race, a view not listed, a key the
 * two sides compute differently — lands in the same alert region and marks the
 * name field invalid, as an inline refusal does). The alert region is mounted
 * empty from the first render so the
 * message that later fills it is announced, and so the input's
 * `aria-describedby` never points at a missing element.
 */
export interface SaveViewDialogProps {
  endpoint: string;
  current: SavedViewState;
  /**
   * `savedListViewNameKey` of every listed view the caller owns — the input to
   * a best-effort duplicate-name pre-check. The server's `lower(btrim(name))`
   * is authoritative; its 409 is shown on the name field too.
   */
  ownedNameKeys: ReadonlySet<string>;
  /** Where focus lands when the dialog closes, whichever way it closes. */
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSaved: () => void;
}

export function SaveViewDialog(props: SaveViewDialogProps): ReactNode {
  const { endpoint, current, ownedNameKeys, returnFocusRef, onClose, onSaved } = props;
  const t = useTranslation('core');
  const nameId = useId();
  const sharedId = useId();
  const errorId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameInvalid, setNameInvalid] = useState(false);
  const [busy, setBusy] = useState(false);

  const validate = (trimmed: string): string | null => {
    if (trimmed.length === 0) return t('savedViews.error.nameRequired');
    if (trimmed.length > SAVED_LIST_VIEW_NAME_MAX) {
      return t('savedViews.error.nameTooLong', { max: SAVED_LIST_VIEW_NAME_MAX });
    }
    if (hasForbiddenNameCharacters(trimmed)) return t('savedViews.error.nameInvalidCharacters');
    if (ownedNameKeys.has(savedListViewNameKey(trimmed))) return t('savedViews.error.nameTaken');
    return null;
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (inFlight.current) return;
    const trimmed = name.trim();
    const invalid = validate(trimmed);
    if (invalid) {
      setError(invalid);
      setNameInvalid(true);
      nameRef.current?.focus();
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setNameInvalid(false);
    try {
      await createSavedView(endpoint, { ...current, name: trimmed, shared });
      inFlight.current = false;
      onSaved();
    } catch (err) {
      inFlight.current = false;
      setBusy(false);
      setError(requestErrorMessage(err, t('savedViews.error.save')));
      // A name taken in a race is a fault in the field, marked like the inline
      // check's and cleared by the next keystroke the same way.
      if (isConflict(err)) {
        setNameInvalid(true);
        nameRef.current?.focus();
      }
    }
  };

  return (
    <ModalDialog
      title={t('savedViews.saveDialog.title')}
      onClose={onClose}
      busy={busy}
      initialFocusRef={nameRef}
      finalFocusRef={returnFocusRef}
    >
      <form noValidate onSubmit={(event): void => void submit(event)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={nameId}>{t('common.field.name')}</Label>
          <Input
            ref={nameRef}
            id={nameId}
            value={name}
            autoComplete="off"
            aria-invalid={nameInvalid || undefined}
            aria-describedby={errorId}
            readOnly={busy}
            onChange={(event): void => {
              setName(event.target.value);
              if (nameInvalid) {
                setNameInvalid(false);
                setError(null);
              }
            }}
          />
        </div>
        <div className="flex min-h-11 items-center gap-2">
          <Checkbox
            id={sharedId}
            checked={shared}
            disabled={busy}
            onChange={(event): void => setShared(event.target.checked)}
          />
          <Label htmlFor={sharedId} className="cursor-pointer py-2 font-normal leading-snug">
            {t('savedViews.saveDialog.shared')}
          </Label>
        </div>
        <p id={errorId} role="alert" className="min-h-5 text-sm text-destructive">
          {error}
        </p>
        {/* The action row sits inside the form, not in ModalDialog's `footer`, so
            Enter in the name field submits through the form's own default button. */}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t('common.action.cancel')}
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 aria-hidden="true" className="motion-safe:animate-spin" /> : null}
            {busy ? t('common.state.saving') : t('common.action.save')}
          </Button>
        </div>
      </form>
    </ModalDialog>
  );
}
