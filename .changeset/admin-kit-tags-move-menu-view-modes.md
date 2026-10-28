---
'@endora-commerce/admin-kit': minor
---

Additive (`specs/165-task-management/`):

- `TagChips`, `TagMultiSelect` and `useTagOptions` (`components/tags/`), promoted from CRM with the options source injected, so any module can offer tags.
- `MoveToMenu` (`components/kanban/MoveToMenu.tsx`), the keyboard *Move to…* menu for a `KanbanBoard` card, promoted from CRM; it takes generic `targets {code, name, color}`.
- The reference editor and `ReferenceText` know the reference kinds `opportunity` and `project`: two more document groups in the `@@` list and link targets for both.
- Admin preferences: `listViewModes` in the preference store, and `useListViewModePreference(listId)`, which remembers a list's list-or-board choice across devices.
- `CommentThread` takes `keepDeleted`: a deleted entry keeps its place, marked as deleted, with nothing left to change (`RecordComment.deletedAt`, optional). Without it a deleted entry leaves the list, as before.
