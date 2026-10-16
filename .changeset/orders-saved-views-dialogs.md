---
'@endora-commerce/mod-orders': minor
'@endora-commerce/mod-i18n': patch
---

The order list's saved views now run on the admin kit's `SavedViewsControl` (#288).

- Saving a view opens one in-app dialog that asks for the name and whether to share the view, instead of two browser prompts. The name is checked as it is submitted — empty, too long, containing characters that cannot be used, or already used by one of your own views — and a server refusal is shown inside the dialog with what you typed kept.
- Deleting a view asks for confirmation in an in-app dialog that names the view and, for a shared view, warns that it disappears for every admin who can open the list. *Delete view* is offered only for a view you may delete.
- Both dialogs are keyboard-operable (focus moves into the dialog, stays there and returns to the control afterwards; Escape cancels) and translated in English and Polish. A shared view is announced as shared in the selector, in words rather than a star.
- Loading a view saved without a sort applies the list's default sort (newest first) instead of failing.
- Loading a view returns the list to its first page and clears the row selection, without first requesting the old page under the view's filters.

`@endora-commerce/mod-i18n` drops the four `orders.views.*` keys the replaced component read; the control reads the `savedViews.*` keys added earlier in this feature.
