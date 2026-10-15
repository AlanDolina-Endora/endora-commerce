---
'@endora-commerce/admin-kit': minor
'@endora-commerce/mod-crm': patch
'@endora-commerce/mod-i18n': minor
---

`@endora-commerce/admin-kit/components` publishes two new components. `ModalDialog` (with `ModalDialogProps`) is the dialog primitive `crm` used to keep to itself: a titled panel over a scrim with an accessible name, a focus trap, Escape and scrim to close, and a `busy` flag that makes both inert. It gains two optional props, `initialFocusRef` (focused on open instead of the first focusable element) and `finalFocusRef` (focused after close instead of the opener, read at close time); without them it behaves as before. `useFocusTrap` accepts the same two refs through a new optional third argument (`FocusTrapOptions`). `SavedViewsControl` (with `SavedViewsControlProps` and `SavedViewState`) is the saved-views selector with *Save view* and *Delete view*, both through dialogs rather than the browser's native prompts: the caller passes the list's saved-view endpoint, its current state and an `onApply` callback, and the control lists, creates and deletes views through the kit's `apiClient`. A name the server refuses as taken (`409`) is shown in the save dialog with the name field marked invalid until the next keystroke. It never sends an update.

`crm` imports `ModalDialog` from the kit instead of its own copy, which is deleted. No behaviour changes.

The `core` bundle gains eighteen `savedViews.*` keys in English and Polish — the copy `SavedViewsControl` and its dialogs render.
