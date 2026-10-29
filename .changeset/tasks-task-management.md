---
'@endora-commerce/mod-tasks': minor
---

Tasks grows into a work-management module (`specs/165-task-management/`): several assignees, a configurable status workflow with permitted transitions, priorities, tags, a rich-text description with references, comments with mentions, attachments, custom fields, sub-tasks and related Tasks, links to Opportunities, Orders and Quote Requests with a Tasks panel on each, a board beside the list (the choice remembered per user), saved filters, reminders and an opt-in daily digest, drafts and private Tasks.

**Upgrading.** One migration, `tasks_task_management`, keeps every existing Task: its status stays as a seeded code (`todo`, `in_progress`, `done`, `cancelled`, every transition permitted) and its single assignee becomes the first of its assignees. Its `down` restores the previous shape with the first assignee.

- New permissions `tasks:configure` (the workflow, tags, priorities, board card and time zone) and `tasks:see_private` (reading and deleting other people's private Tasks); grant them to the roles that need them.
- New settings `tasks.board_card_fields` and `tasks.time_zone` (default `Europe/Warsaw`), and two transactional e-mails, `tasks_task_reminder` and `tasks_daily_digest`.
- New dependencies, all non-deactivatable: `custom_fields`, `assets_library`, `transactional_emails`, `orders`, `catalog`. The module stays operator-toggleable and degrades without `crm`, `quote_requests` and `projects`.
- A worker on the queue `tasks-reminders` runs where workers run: a Job Scheduler every 60 s delivers due reminders (the bell exactly once, the e-mail at most once; a reminder more than 24 h late — after downtime or while Tasks was off — is recorded as expired and not sent) and, at most every 15 minutes, the daily digests. The package gains the peers `bullmq`, `ioredis` and `@endora-commerce/email-components`.
- `taskReadPort` now also hides drafts and other people's private Tasks; `taskWritePort.createMany` honours `sourceKey`, so a retried batch creates only what is missing (#450).
- A draft is published with `POST /api/v1/admin/tasks/:id/publish`, by its Creator, once: only then is `tasks.task.created.v1` emitted and are its assignees and mentioned people told. While it is a draft no `tasks.task.*` event is emitted for it at all — for other modules it does not exist yet.
- `DELETE /api/v1/admin/tasks/:id` answers **200** with `{data: {subtasksDetached}}` instead of 204, and its gate is `tasks:read` (the service asks for `tasks:write`, or `tasks:see_private` on a private Task, and answers the same 403 otherwise): deleting a parent makes its sub-tasks top-level, and the answer says how many of them the caller may see. A client that checked for 204 checks for a 2xx.
