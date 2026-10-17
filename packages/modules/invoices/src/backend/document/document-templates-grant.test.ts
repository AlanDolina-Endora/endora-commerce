import { describe, expect, it, vi } from 'vitest';
import type { AdminRoleRecord, UpsertAdminRoleInput } from '@endora-commerce/contracts';
import { grantDocumentTemplatesAccess } from './document-templates-grant.js';

/** T057 (revised, owner answer P2) — the one-time grant of FR-089. */
function role(code: string, permissions: string[]): AdminRoleRecord {
  return { id: code, code, name: `Role ${code}`, permissions, requiresTwoFactor: code === 'mfa', createdAt: new Date(), updatedAt: new Date() };
}

function setup(roles: AdminRoleRecord[], done = false) {
  const upserts: UpsertAdminRoleInput[] = [];
  let marked = done;
  const deps = {
    roles: {
      list: vi.fn(async () => roles),
      upsertByCode: vi.fn(async (input: UpsertAdminRoleInput) => {
        upserts.push(input);
        return role(input.code, input.permissions);
      }),
    },
    isDone: vi.fn(async () => marked),
    markDone: vi.fn(async () => {
      marked = true;
    }),
  };
  return { deps, upserts };
}

describe('grantDocumentTemplatesAccess', () => {
  it('adds read to invoice readers, read and write to invoice editors, keeping everything else', async () => {
    const { deps, upserts } = setup([
      role('reader', ['invoices:read', 'orders:read']),
      role('mfa', ['invoices:read', 'invoices:write']),
      role('unrelated', ['orders:read']),
    ]);
    const outcome = await grantDocumentTemplatesAccess(deps);
    expect(outcome).toEqual({ status: 'granted', roleCodes: ['reader', 'mfa'] });
    expect(upserts).toEqual([
      { code: 'reader', name: 'Role reader', permissions: ['invoices:read', 'orders:read', 'document_templates:read'], requiresTwoFactor: false },
      {
        code: 'mfa',
        name: 'Role mfa',
        permissions: ['invoices:read', 'invoices:write', 'document_templates:read', 'document_templates:write'],
        requiresTwoFactor: true,
      },
    ]);
    expect(deps.markDone).toHaveBeenCalledTimes(1);
  });

  it('writes no role that already holds the codes, and no wildcard role', async () => {
    const { deps, upserts } = setup([
      role('platform_admin', ['*']),
      role('done', ['invoices:write', 'document_templates:read', 'document_templates:write']),
    ]);
    expect(await grantDocumentTemplatesAccess(deps)).toEqual({ status: 'granted', roleCodes: [] });
    expect(upserts).toEqual([]);
  });

  it('runs once: after it recorded itself it reads no role and writes nothing', async () => {
    const { deps, upserts } = setup([role('reader', ['invoices:read'])], true);
    expect(await grantDocumentTemplatesAccess(deps)).toEqual({ status: 'already-done' });
    expect(deps.roles.list).not.toHaveBeenCalled();
    expect(upserts).toEqual([]);
    expect(deps.markDone).not.toHaveBeenCalled();
  });

  it('does not record itself when a role write fails, so the next boot retries', async () => {
    const { deps } = setup([role('reader', ['invoices:read'])]);
    deps.roles.upsertByCode.mockRejectedValueOnce(new Error('db down'));
    await expect(grantDocumentTemplatesAccess(deps)).rejects.toThrow('db down');
    expect(deps.markDone).not.toHaveBeenCalled();
  });
});
