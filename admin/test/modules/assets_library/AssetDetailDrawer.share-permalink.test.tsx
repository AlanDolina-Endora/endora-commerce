import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ASSET_ID, detail, en, mockClient, refusal, renderDrawer } from './drawer-fixtures';

/**
 * `specs/156-asset-stable-url/` T071 — the shareable link and the permalink
 * controls of the asset detail drawer (FR-018 – FR-021, FR-026, owner ruling P5;
 * contracts/admin-surfaces.md §3).
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
const READ = ['assets.read'];
const PERMALINK_URL = 'https://api.example.test/assets/file/docs/certificate.pdf';

function render(permissions: readonly string[] = WRITE) {
  return renderDrawer(<AssetDetailDrawer assetId={ASSET_ID} onChanged={vi.fn()} onClose={vi.fn()} />, permissions);
}

beforeEach(() => {
  client.current = mockClient();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AssetDetailDrawer — shareable link', () => {
  it('shows the file URL when no permalink is set, never the embed URL', async () => {
    client.current!.getAsset.mockResolvedValue(detail());
    render();
    const link = await screen.findByLabelText(en('detail.shareUrl.label'));
    expect((link as HTMLInputElement).value).toBe(detail().fileUrl);
    expect(screen.queryByDisplayValue(detail().url)).toBeNull();
  });

  it('shows the permalink URL when one is set, and copies it once', async () => {
    client.current!.getAsset.mockResolvedValue(detail({ permalink: 'docs/certificate.pdf', permalinkUrl: PERMALINK_URL }));
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    render();
    const link = await screen.findByLabelText(en('detail.shareUrl.label'));
    expect((link as HTMLInputElement).value).toBe(PERMALINK_URL);
    await user.click(screen.getByRole('button', { name: en('detail.shareUrl.copy') }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(PERMALINK_URL);
    expect(await screen.findByText(en('detail.shareUrl.copied'))).toBeInTheDocument();
  });

  it('says a private asset’s link is not publicly reachable', async () => {
    client.current!.getAsset.mockResolvedValue(detail({ visibility: 'private' }));
    render();
    expect(await screen.findByText(en('detail.shareUrl.privateNotice'))).toBeInTheDocument();
  });
});

describe('AssetDetailDrawer — permalink', () => {
  it('validates as you type: a//b shows the invalid_segment sentence and disables Save', async () => {
    client.current!.getAsset.mockResolvedValue(detail());
    const user = userEvent.setup();
    render();
    const input = await screen.findByLabelText(en('detail.permalink.label'));
    await user.type(input, 'a//b');
    expect(screen.getByText(en('detail.permalink.invalid.invalid_segment'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en('detail.permalink.save') })).toBeDisabled();
  });

  it('saves a new permalink once', async () => {
    client.current!.getAsset.mockResolvedValue(detail());
    client.current!.setPermalink.mockResolvedValue(detail({ permalink: 'docs/certificate.pdf', permalinkUrl: PERMALINK_URL }));
    const user = userEvent.setup();
    render();
    await user.type(await screen.findByLabelText(en('detail.permalink.label')), 'docs/certificate.pdf');
    await user.click(screen.getByRole('button', { name: en('detail.permalink.save') }));
    await waitFor(() => expect(client.current!.setPermalink).toHaveBeenCalledTimes(1));
    expect(client.current!.setPermalink).toHaveBeenCalledWith(ASSET_ID, 'docs/certificate.pdf');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks before changing or removing a set permalink, and Cancel sends nothing', async () => {
    client.current!.getAsset.mockResolvedValue(detail({ permalink: 'docs/certificate.pdf', permalinkUrl: PERMALINK_URL }));
    const user = userEvent.setup();
    render();
    const input = await screen.findByLabelText(en('detail.permalink.label'));
    await user.clear(input);
    await user.type(input, 'docs/certificate-2026.pdf');
    await user.click(screen.getByRole('button', { name: en('detail.permalink.save') }));
    const change = await screen.findByRole('dialog', { name: en('detail.permalink.changeTitle') });
    expect(within(change).getByText(en('detail.permalink.changeBody', { oldUrl: PERMALINK_URL }))).toBeInTheDocument();
    await user.click(within(change).getByRole('button', { name: EN_CANCEL }));
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: en('detail.permalink.remove') }));
    const remove = await screen.findByRole('dialog', { name: en('detail.permalink.removeTitle') });
    expect(within(remove).getByText(en('detail.permalink.removeBody', { oldUrl: PERMALINK_URL }))).toBeInTheDocument();
    await user.click(within(remove).getByRole('button', { name: EN_CANCEL }));
    expect(client.current!.setPermalink).not.toHaveBeenCalled();
    expect(client.current!.removePermalink).not.toHaveBeenCalled();
  });

  it('asks before taking a name another asset used, and Use it anyway re-sends with confirmReuse once', async () => {
    client.current!.getAsset.mockResolvedValue(detail());
    client.current!.setPermalink
      .mockRejectedValueOnce(
        refusal(409, 'ASSET_PERMALINK_PREVIOUSLY_USED', 'used before', {
          permalink: 'docs/sheet.pdf',
          releasedAt: '2026-10-10T10:00:00.000Z',
        }),
      )
      .mockResolvedValueOnce(detail({ permalink: 'docs/sheet.pdf', permalinkUrl: PERMALINK_URL }));
    const user = userEvent.setup();
    render();
    await user.type(await screen.findByLabelText(en('detail.permalink.label')), 'docs/sheet.pdf');
    await user.click(screen.getByRole('button', { name: en('detail.permalink.save') }));
    const reuse = await screen.findByRole('dialog', { name: en('detail.permalink.reuseTitle') });
    expect(within(reuse).getByText(/docs\/sheet\.pdf/)).toBeInTheDocument();
    await user.click(within(reuse).getByRole('button', { name: en('detail.permalink.reuseConfirm') }));
    await waitFor(() => expect(client.current!.setPermalink).toHaveBeenCalledTimes(2));
    expect(client.current!.setPermalink).toHaveBeenLastCalledWith(ASSET_ID, 'docs/sheet.pdf', { confirmReuse: true });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('Cancel on the reuse dialog sends nothing more', async () => {
    client.current!.getAsset.mockResolvedValue(detail());
    client.current!.setPermalink.mockRejectedValueOnce(
      refusal(409, 'ASSET_PERMALINK_PREVIOUSLY_USED', 'used before', {
        permalink: 'docs/sheet.pdf',
        releasedAt: '2026-10-10T10:00:00.000Z',
      }),
    );
    const user = userEvent.setup();
    render();
    await user.type(await screen.findByLabelText(en('detail.permalink.label')), 'docs/sheet.pdf');
    await user.click(screen.getByRole('button', { name: en('detail.permalink.save') }));
    const reuse = await screen.findByRole('dialog', { name: en('detail.permalink.reuseTitle') });
    await user.click(within(reuse).getByRole('button', { name: EN_CANCEL }));
    expect(client.current!.setPermalink).toHaveBeenCalledTimes(1);
  });

  it('shows the server message for a name another asset holds', async () => {
    client.current!.getAsset.mockResolvedValue(detail());
    client.current!.setPermalink.mockRejectedValueOnce(
      refusal(409, 'ASSET_PERMALINK_TAKEN', 'The permalink "docs/x.pdf" is already used by another asset.'),
    );
    const user = userEvent.setup();
    render();
    await user.type(await screen.findByLabelText(en('detail.permalink.label')), 'docs/x.pdf');
    await user.click(screen.getByRole('button', { name: en('detail.permalink.save') }));
    expect(await screen.findByText('The permalink "docs/x.pdf" is already used by another asset.')).toBeInTheDocument();
  });

  it('is read-only without assets.write: no Save, no Remove', async () => {
    client.current!.getAsset.mockResolvedValue(detail({ permalink: 'docs/certificate.pdf', permalinkUrl: PERMALINK_URL }));
    render(READ);
    const input = await screen.findByLabelText(en('detail.permalink.label'));
    expect(input).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: en('detail.permalink.save') })).toBeNull();
    expect(screen.queryByRole('button', { name: en('detail.permalink.remove') })).toBeNull();
  });
});

const EN_CANCEL = en('common.cancel');
