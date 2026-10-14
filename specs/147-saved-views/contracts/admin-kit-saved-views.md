# Contract: admin-kit `ModalDialog` and `SavedViewsControl` (`specs/147-saved-views/`)

Normative for the two components this feature publishes from
`@endora-commerce/admin-kit/components`, the two internal dialogs built from them, and the
`core` translation keys they read. Research: R-2, R-3, R-4, R-8, R-15.

## §1 `ModalDialog` — promoted from `crm`

Location: `packages/admin-kit/src/components/modal-dialog/ModalDialog.tsx` (moved from
`packages/modules/crm/src/admin/components/ModalDialog.tsx`, which is deleted; `crm`'s eight
importers switch to `@endora-commerce/admin-kit/components`).

```ts
export interface ModalDialogProps {
  title: ReactNode;                 // rendered as <h2>, the dialog's accessible name
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;               // right-aligned action row
  busy?: boolean;                   // true ⇒ Escape and backdrop do nothing; aria-busy
  /** NEW — focused on open instead of the first focusable element. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** NEW — focused after the dialog unmounts instead of the opener. */
  finalFocusRef?: RefObject<HTMLElement | null>;
}
```

Behaviour (existing, kept): `role="dialog"`, `aria-modal="true"`, `aria-labelledby` → title;
`useFocusTrap` traps Tab and returns focus to the opener on unmount; Escape closes unless `busy`;
a `mousedown` on the scrim itself closes unless `busy`. New props default to the existing
behaviour, so `crm`'s rendering is unchanged.

**StrictMode.** Effects run mount → cleanup → mount in development. Focus restoration must
therefore be idempotent across that cycle (the opener is re-captured on the second mount), and
no "alive" flag may be set only in a cleanup — a `useRef` flag flipped in cleanup and never
reset on re-mount leaves the dialog believing it is unmounted and every async completion is
dropped (the saving state never clears). Set any such flag in the effect body and clear it in
the cleanup.

## §2 `SavedViewsControl`

Location: `packages/admin-kit/src/components/saved-views/` — `SavedViewsControl.tsx` (published),
`SaveViewDialog.tsx`, `DeleteViewDialog.tsx`, `saved-views-api.ts` (internal, not exported).

```ts
export interface SavedViewState {
  filters: Record<string, unknown>;
  sort?: { field: string; dir: 'asc' | 'desc' } | null;
  visibleColumns?: string[] | null;
}
export interface SavedViewsControlProps {
  endpoint: string;                         // e.g. '/api/v1/admin/catalog/products/list-views'
  current: SavedViewState;
  onApply: (state: SavedViewState) => void;
  onError: (message: string) => void;       // list-load failures only
}
export function SavedViewsControl(props: SavedViewsControlProps): ReactNode;
```

Exports added to `packages/admin-kit/src/components/index.ts`: `ModalDialog`,
`ModalDialogProps`, `SavedViewsControl`, `SavedViewsControlProps`, `SavedViewState`.

### Rendering

```text
[ Saved views ▾ ]  [💾 Save view]  [🗑 Delete view]
```

- **Selector** — the kit's `Select`, `aria-label = t('savedViews.label')`, first option
  `t('savedViews.none')`, then one option per view: `name`, and for a shared view
  `name + ' ' + t('savedViews.sharedSuffix')` (FR-007; no `★`). Bounded width, visual
  truncation; the option text stays whole. Choosing a view calls `onApply` with its
  `{ filters, sort ?? null, visibleColumns ?? null }`; choosing *none* applies nothing.
- **Save view** — icon button, `aria-label = t('savedViews.save')`, always enabled; opens the
  save dialog.
- **Delete view** — icon button, `aria-label = t('savedViews.delete')`, enabled only when a view
  is selected **and** its `canModify` is true (FR-014); opens the delete confirmation.

### Save dialog (FR-001 – FR-006, FR-022)

- Title `t('savedViews.saveDialog.title')`; a labelled text input
  (`t('common.field.name')`), focused on open (`initialFocusRef`); a checkbox
  `t('savedViews.saveDialog.shared')`, unchecked on open; footer *Cancel*
  (`t('common.action.cancel')`) and *Save* (`t('common.action.save')`, `type="submit"`). The
  body is a `<form>`, so Enter submits.
- On submit, in order, each failing case sets the field's `aria-invalid="true"` and an error
  text linked by `aria-describedby`, rendered in a `role="alert"` region, and sends nothing:
  1. trimmed name empty → `t('savedViews.error.nameRequired')`;
  2. trimmed name longer than `SAVED_LIST_VIEW_NAME_MAX` → `t('savedViews.error.nameTooLong',
     { max: 160 })`;
  3. `hasForbiddenNameCharacters(name)` → `t('savedViews.error.nameInvalidCharacters')` (S-06);
  4. `savedListViewNameKey(name)` equals the key of a listed view with `ownedByCaller` →
     `t('savedViews.error.nameTaken')`.
- Otherwise `POST endpoint` with `{ name: trimmed, shared, filters, sort, visibleColumns }` from
  `current` (keys the list does not use are sent as given; the server strips what it does not
  store). While in flight: `busy` (Escape and backdrop inert), the submit button disabled and
  labelled `t('common.state.saving')`, a second submit impossible.
- 2xx → close, focus returns to *Save view*, the selector reloads (selection unchanged).
- Non-2xx → stay open, input and checkbox kept, `error.message` from the envelope shown in the
  dialog's alert region (409 included); a network failure shows `t('savedViews.error.save')`.
- Escape, *Cancel*, backdrop → close without a request; focus returns to *Save view*.

### Delete confirmation (FR-023, FR-004 exception)

- Title `t('savedViews.deleteDialog.title')`; body `t('savedViews.deleteDialog.body', { name })`;
  for a shared view also `t('savedViews.deleteDialog.sharedWarning')`. Footer *Cancel* and
  *Delete* (`t('common.action.delete')`, destructive variant). Initial focus on *Cancel*.
- *Delete* → `DELETE endpoint/:id`; busy as above.
- 2xx → close, selection cleared, current filters untouched, selector reloads, focus moves to
  the selector (`finalFocusRef`).
- 404 → `t('savedViews.error.gone')` in the dialog, selector reloads, selection cleared; the
  admin closes the dialog.
- Other non-2xx → envelope message in the dialog; nothing else changes.
- Escape, *Cancel*, backdrop → close, view kept, focus returns to *Delete view*.

### Names are text (S-10)

Every place a view name appears — selector option, duplicate feedback, delete confirmation
(interpolated through `t(…, { name })`) — renders it as a React text child; never
`dangerouslySetInnerHTML`, never HTML-interpreting interpolation.

### No native dialogs (FR-001, SC-001)

Nothing under `packages/admin-kit/src/components/saved-views/` or `…/modal-dialog/` calls
`window.prompt`, `window.confirm` or `window.alert`; a source-scan test asserts it, and the
component tests spy on all three and expect zero calls.

## §3 Page responsibilities (per module)

Each list page owns the mapping between its state and `SavedViewState`, and nothing else:

| Page | `current` | `onApply` |
| --- | --- | --- |
| `orders/src/admin/pages/OrdersList.tsx` | unchanged `currentView` (`:327-344`) | unchanged `applyView` (`:303-325`) |
| `catalog/src/admin/pages/ProductsList.tsx` | `{ filters: { status, type, q } }` — only the non-default ones | set status, type and search from the view (unknown → `all` / empty); Stock chip → `all`; page and selection reset by the page's existing effects |
| `quote_requests/src/admin/pages/RfqList.tsx` | `{ filters: { scope, organizationId?, status?, q? }, sort, visibleColumns }` | set all six; unknown status entries and column ids dropped; absent/unknown scope → the viewer's default; empty columns → `DEFAULT_VISIBLE`; page reset by the existing effect |

`orders/src/admin/components/OrderSavedViews.tsx` is deleted.

## §4 `core` keys (in `packages/modules/_i18n/i18n/{en,pl}.json`)

New keys:

| Key | `en` | `pl` |
| --- | --- | --- |
| `savedViews.label` | Saved views | Zapisane widoki |
| `savedViews.none` | — Select a view — | — Wybierz widok — |
| `savedViews.sharedSuffix` | (shared) | (udostępniony) |
| `savedViews.save` | Save view | Zapisz widok |
| `savedViews.delete` | Delete view | Usuń widok |
| `savedViews.saveDialog.title` | Save view | Zapisz widok |
| `savedViews.saveDialog.shared` | Share with every admin who can open this list | Udostępnij wszystkim administratorom, którzy mają dostęp do tej listy |
| `savedViews.deleteDialog.title` | Delete view | Usuń widok |
| `savedViews.deleteDialog.body` | Delete the view “{name}”? | Usunąć widok „{name}”? |
| `savedViews.deleteDialog.sharedWarning` | This view is shared. It will disappear for every admin who can open this list. | Ten widok jest udostępniony. Zniknie dla wszystkich administratorów, którzy mają dostęp do tej listy. |
| `savedViews.error.nameRequired` | Enter a name for the view. | Podaj nazwę widoku. |
| `savedViews.error.nameTooLong` | The name can be at most {max} characters long. | Nazwa może mieć najwyżej {max} znaków. |
| `savedViews.error.nameTaken` | You already have a view with this name. | Masz już widok o tej nazwie. |
| `savedViews.error.nameInvalidCharacters` | The name contains characters that cannot be used. | Nazwa zawiera niedozwolone znaki. |
| `savedViews.error.gone` | This view no longer exists. | Ten widok już nie istnieje. |
| `savedViews.error.load` | Saved views could not be loaded. | Nie udało się wczytać zapisanych widoków. |
| `savedViews.error.save` | The view could not be saved. | Nie udało się zapisać widoku. |
| `savedViews.error.delete` | The view could not be deleted. | Nie udało się usunąć widoku. |

Reused, unchanged: `common.action.cancel`, `common.action.save`, `common.action.delete`,
`common.field.name`, `common.state.saving`.

Deleted (their only reader, `OrderSavedViews.tsx`, is deleted): `orders.views.label`,
`orders.views.namePrompt`, `orders.views.none`, `orders.views.sharedPrompt`.

Copy is a proposal for the implementer and the designer; the keys and the set of messages are
normative, the wording may be refined in review as long as both languages change together.
