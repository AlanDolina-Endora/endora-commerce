---
'@endora-commerce/mod-quote-requests': minor
'@endora-commerce/mod-i18n': minor
---

Quote request lines can be arranged in named, ordered groups.

- **Admin API.** `PATCH /api/v1/admin/quote-requests/:id` and `POST /api/v1/admin/quote-requests` accept `groups` (`{ key, id?, name }`, in display order) and a per-line `groupKey`. A body with `groups` replaces the grouping (an `id` keeps a group across a rename; a stored group not named is deleted; its lines become ungrouped); a body with `items` and no `groups` keeps every paired line in its group; `groups` without `items` answers 400; a group id of another quote answers `422 VALIDATION_FAILED` at `groups.<i>.id`. The grouping is written under the existing row lock and recorded on the `quote_request.modify` / `quote_request.create_on_behalf` audit entry (`stateBefore.groups`, `stateAfter.groups` as `{ name, lineCount }`). A save that only regroups is an ordinary revision.
- **Replies.** Every quote reply answers `itemGroups` (admin: every group, empty ones included; customer: groups holding a line only) and each item's `groupId` and `position`, with `items` **in display order** — the reply read had no order before. The customer comparison may carry `{ kind: 'grouping' }`; the admin history lists the five new change kinds. Customer bodies accept no grouping (`PATCH` refuses `groups`; a create body's keys are stripped as before); a customer draft edit keeps every paired line's group; resubmission copies none.
- **Read port.** `quoteRequestReadPort.listItems` answers lines in display order with `position` and `group`.
- **PDF data.** The document data carries `groups` and each line's `groupId` / `position`, lines in display order (the table does not print sections yet).
- **Admin screens.** The detail *Modify* tab and the create screen group lines with the line groups editor, with a summary per group; *Overview* shows the groups read-only.
- **Migration** `20261020T171341_quote_requests_quote_request_item_groups.ts` creates `quote_request_item_groups` and adds `quote_request_items.group_id` (on delete set null) and `position` (default 0, no backfill).
- `mod-i18n`'s `core` bundle gains `rfq.detail.history.change.{group_added,group_removed,group_renamed,line_group,line_order}` and `rfq.detail.history.ungrouped` in English and Polish.
