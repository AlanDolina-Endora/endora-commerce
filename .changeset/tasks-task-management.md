---
'@endora-commerce/mod-tasks': minor
---

Tasks grows into a work-management module (`specs/165-task-management/`): several assignees, a configurable status workflow with permitted transitions, priorities, tags, a rich-text description with references, comments with mentions, attachments, custom fields, sub-tasks and related Tasks, links to Opportunities, Orders and Quote Requests with a Tasks panel on each, a board beside the list (the choice remembered per user), saved filters, reminders and an opt-in daily digest, drafts and private Tasks.

**Upgrading.** One migration, `tasks_task_management`, keeps every existing Task: its status stays as a seeded code (`todo`, `in_progress`, `done`, `cancelled`, every transition permitted) and its single assignee becomes the first of its assignees. Its `down` restores the previous shape with the first assignee.

- New permissions `tasks:configure` (the workflow, tags, priorities, board card and time zone) and `tasks:see_private` (reading and deleting other people's private Tasks); grant them to the roles that need them.
- New settings `tasks.board_card_fields` and `tasks.time_zone` (default `Europe/Warsaw`), and two transactional e-mails, `tasks_task_reminder` and `tasks_daily_digest`.
- New dependencies, all non-deactivatable: `custom_fields`, `assets_library`, `transactional_emails`, `orders`, `catalog`. The module stays operator-toggleable and degrades without `crm`, `quote_requests` and `projects`.
- A worker on the queue `tasks-reminders` runs where workers run.
- `taskReadPort` now also hides drafts and other people's private Tasks; `taskWritePort.createMany` honours `sourceKey`, so a retried batch creates only what is missing (#450).
