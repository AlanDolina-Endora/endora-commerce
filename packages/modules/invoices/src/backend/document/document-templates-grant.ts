import type { AdminRolePort } from '@endora-commerce/contracts';

/**
 * Owner answer N3 (revised by P2): administrators who could view or edit
 * invoice templates keep that access when invoice templates move into
 * *Document templates* (`specs/152-compare-pdf-template/` FR-089).
 *
 * A **one-time, idempotent upgrade step**. Every role holding `invoices:read`
 * gains `document_templates:read`; every role holding `invoices:write` gains
 * `document_templates:write` and `:read`. A role that already holds a code is
 * not written; a wildcard role holds everything already. Each role written is
 * `admin_roles`' own audited upsert, and the step records that it ran in this
 * module's hidden setting — through `settings`' audited write — so it runs at
 * most once per installation: a permission an administrator later removes is
 * never given back.
 */

export const GRANT_DONE_SETTING = 'invoices.document_templates_grant_done';

const READ = 'document_templates:read';
const WRITE = 'document_templates:write';

export interface DocumentTemplatesGrantDeps {
  readonly roles: Pick<AdminRolePort, 'list' | 'upsertByCode'>;
  readonly isDone: () => Promise<boolean>;
  readonly markDone: () => Promise<void>;
}

export type DocumentTemplatesGrantOutcome =
  | { readonly status: 'already-done' }
  | { readonly status: 'granted'; readonly roleCodes: readonly string[] };

export async function grantDocumentTemplatesAccess(
  deps: DocumentTemplatesGrantDeps,
): Promise<DocumentTemplatesGrantOutcome> {
  if (await deps.isDone()) return { status: 'already-done' };
  const changed: string[] = [];
  for (const role of await deps.roles.list()) {
    const held = new Set(role.permissions);
    if (held.has('*')) continue;
    const add: string[] = [];
    const readsInvoices = held.has('invoices:read') || held.has('invoices:write');
    if (readsInvoices && !held.has(READ)) add.push(READ);
    if (held.has('invoices:write') && !held.has(WRITE)) add.push(WRITE);
    if (add.length === 0) continue;
    await deps.roles.upsertByCode({
      code: role.code,
      name: role.name,
      permissions: [...role.permissions, ...add],
      requiresTwoFactor: role.requiresTwoFactor,
    });
    changed.push(role.code);
  }
  await deps.markDone();
  return { status: 'granted', roleCodes: changed };
}
