import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ASSET_ID, detail, en, mockClient, refusal, renderDrawer } from './drawer-fixtures';

/**
 * `specs/156-asset-stable-url/` T072 — **Replace file** in the asset detail
 * drawer (FR-001, FR-006, FR-009, FR-026; contracts/admin-surfaces.md §3).
 */

const client = vi.hoisted(() => ({ current: null as ReturnType<typeof mockClient> | null }));
vi.mock('../../../../packages/modules/assets_library/src/admin/api/assets-library-client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    assetsLibraryClient: new Proxy({}, { get: (_t, prop: string) => (client.current as unknown as Record<string, unknown>)[prop] }),
  };
});

const { AssetDetailDrawer } = await import(
  '../../../../packages/modules/assets_library/src/admin/components/AssetDetailDrawer'
);

const WRITE = ['assets.read', 'assets.write'];

function render(permissions: readonly string[] = WRITE) {
  return renderDrawer(<AssetDetailDrawer assetId={ASSET_ID} onChanged={vi.fn()} onClose={vi.fn()} />, permissions);
}

function fileInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

const NEW_PDF = new File(['%PDF-1.4 new'], 'certificate-2026.pdf', { type: 'application/pdf' });

beforeEach(() => {
  client.current = mockClient();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AssetDetailDrawer — replace file', () => {
  it('is absent without assets.write', async () => {
    client.current!.getAsset.mockResolvedValue(detail());
    render(['assets.read']);
    await screen.findByText(en('detail.title'));
    expect(screen.queryByRole('button', { name: en('detail.replace.trigger') })).toBeNull();
  });

  it('accepts only the asset’s own kind, confirms naming both files and the retention, then replaces once and reloads', async () => {
    client.current!.getAsset.mockResolvedValue(detail());
    client.current!.getRetentionDays.mockResolvedValue(14);
    client.current!.replaceAsset.mockResolvedValue(detail({ filename: 'certificate-2026.pdf', contentVersion: 'ffffffffffff' }));
    const user = userEvent.setup();
    const { container } = render();
    await screen.findByRole('button', { name: en('detail.replace.trigger') });
    expect(fileInput(container).getAttribute('accept')).toBe('application/pdf');

    await user.upload(fileInput(container), NEW_PDF);
    const dialog = await screen.findByRole('dialog', { name: en('detail.replace.confirmTitle') });
    expect(
      within(dialog).getByText(
        en('detail.replace.confirmBody', { currentFilename: 'certificate.pdf', newFilename: 'certificate-2026.pdf', retentionDays: 14 }),
      ),
    ).toBeInTheDocument();
    expect(client.current!.replaceAsset).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: en('detail.replace.confirm') }));
    await waitFor(() => expect(client.current!.replaceAsset).toHaveBeenCalledTimes(1));
    expect(client.current!.replaceAsset).toHaveBeenCalledWith(ASSET_ID, NEW_PDF, 'a1b2c3d4e5f6');
    await waitFor(() => expect(client.current!.getAsset.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('Cancel on the confirmation replaces nothing', async () => {
    client.current!.getAsset.mockResolvedValue(detail());
    const user = userEvent.setup();
    const { container } = render();
    await screen.findByRole('button', { name: en('detail.replace.trigger') });
    await user.upload(fileInput(container), NEW_PDF);
    const dialog = await screen.findByRole('dialog', { name: en('detail.replace.confirmTitle') });
    await user.click(within(dialog).getByRole('button', { name: en('common.cancel') }));
    expect(client.current!.replaceAsset).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says a kind mismatch in its own words, with translated kind names', async () => {
    client.current!.getAsset.mockResolvedValue(detail());
    client.current!.replaceAsset.mockRejectedValue(
      refusal(415, 'ASSET_REPLACE_KIND_MISMATCH', 'raw', { currentKind: 'pdf', newKind: 'image' }),
    );
    const user = userEvent.setup();
    const { container } = render();
    await screen.findByRole('button', { name: en('detail.replace.trigger') });
    await user.upload(fileInput(container), NEW_PDF);
    const dialog = await screen.findByRole('dialog', { name: en('detail.replace.confirmTitle') });
    await user.click(within(dialog).getByRole('button', { name: en('detail.replace.confirm') }));
    expect(
      await screen.findByText(
        en('detail.replace.kindMismatch', { currentKind: en('kind.pdf'), newKind: en('kind.image') }),
      ),
    ).toBeInTheDocument();
  });

  it('shows a conflict with the server sentence and a Reload that fetches the asset again', async () => {
    client.current!.getAsset.mockResolvedValue(detail());
    client.current!.replaceAsset.mockRejectedValue(
      refusal(409, 'ASSET_REPLACE_CONFLICT', "Someone else changed this asset's file while you were uploading."),
    );
    const user = userEvent.setup();
    const { container } = render();
    await screen.findByRole('button', { name: en('detail.replace.trigger') });
    await user.upload(fileInput(container), NEW_PDF);
    const dialog = await screen.findByRole('dialog', { name: en('detail.replace.confirmTitle') });
    await user.click(within(dialog).getByRole('button', { name: en('detail.replace.confirm') }));
    expect(await screen.findByText("Someone else changed this asset's file while you were uploading.")).toBeInTheDocument();
    const before = client.current!.getAsset.mock.calls.length;
    await user.click(screen.getByRole('button', { name: en('detail.replace.reload') }));
    await waitFor(() => expect(client.current!.getAsset.mock.calls.length).toBe(before + 1));
  });
});
