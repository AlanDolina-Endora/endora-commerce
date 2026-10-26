import type { AdminUserReadPort, TaskContext } from '@endora-commerce/contracts';
import type { TaskContextRegistry } from './task-context-registry.js';
import { taskAssigneeInvalid, taskContextInvalid } from './task-errors.js';

/**
 * The checks a Task write makes before its first Command runs, shared by the
 * HTTP service and the write port so both refuse alike.
 */

/** Every named assignee is an active administrator, or the whole write is refused. */
export async function assertAssignable(
  adminUsers: AdminUserReadPort,
  adminUserIds: ReadonlyArray<string | null | undefined>,
): Promise<void> {
  const named = [...new Set(adminUserIds.filter((id): id is string => typeof id === 'string'))];
  if (named.length === 0) return;
  const found = await adminUsers.findByIds(named, { activeOnly: true });
  const active = new Set(found.filter((a) => a.status === 'active' && a.deletedAt === null).map((a) => a.id));
  if (named.some((id) => !active.has(id))) throw taskAssigneeInvalid();
}

/**
 * A context an administrator puts a Task into on the Tasks screens (FR-031):
 * its type registered by a **present** module, the record one the caller may
 * see, and — when the record has groups (a Project's Stages) — one of those
 * groups named. A Task belongs to a group of such a record, never to the
 * record alone. Asked under the caller's own context.
 */
export async function assertContextForCaller(contexts: TaskContextRegistry, context: TaskContext): Promise<void> {
  const descriptor = contexts.presentFor(context.contextType);
  if (!descriptor) {
    throw taskContextInvalid(`No module that is switched on owns the Task context "${context.contextType}".`);
  }
  const visible = await descriptor.visibleContextIds([context.contextId]);
  if (!visible.has(context.contextId)) {
    throw taskContextInvalid('The record does not exist or is not available to you.');
  }
  const description = (await descriptor.describe([context.contextId])).get(context.contextId);
  if (!description) throw taskContextInvalid('The record does not exist or is not available to you.');
  const groupId = context.contextGroupId ?? null;
  if (groupId === null) {
    if (description.groups.size > 0) throw taskContextInvalid('Choose where in the record the Task belongs.');
    return;
  }
  if (!description.groups.has(groupId)) throw taskContextInvalid('The record has no such part.');
}
