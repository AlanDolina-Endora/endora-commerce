import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@endora-commerce/admin-kit/lib';
import type { SavedListView } from '@endora-commerce/contracts';
import { expectNoAxeViolations } from '../helpers/axe';
import { installOffsetParentShim } from '../helpers/layout-shim';
import {
  COLLEAGUE_SHARED,
  ENDPOINT,
  MODIFIABLE_SHARED,
  OWN_VIEW,
  deferred,
  renderControl,
} from './saved-views-fixtures';

/**
 * Feature 147 (T011, US1) — deleting a saved view through the kit's
 * confirmation dialog (`specs/147-saved-views/contracts/admin-kit-saved-views.md`
 * §2 *Delete confirmation*, FR-014, FR-023).
 */

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@endora-commerce/admin-kit/lib', async () => {
  const actual = await vi.importActual<typeof import('@endora-commerce/admin-kit/lib')>(
    '@endora-commerce/admin-kit/lib',
  );
  return {
    ...actual,
    apiClient: {
      get: (...args: unknown[]) => api.get(...args),
      post: (...args: unknown[]) => api.post(...args),
      put: (...args: unknown[]) => api.put(...args),
      patch: (...args: unknown[]) => api.patch(...args),
      delete: (...args: unknown[]) => api.delete(...args),
    },
  };
});

installOffsetParentShim();

let nativeDialogs: { prompt: ReturnType<typeof vi.spyOn>; confirm: ReturnType<typeof vi.spyOn>; alert: ReturnType<typeof vi.spyOn> };
let views: SavedListView[];

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  views = [OWN_VIEW, COLLEAGUE_SHARED, MODIFIABLE_SHARED];
  api.get.mockImplementation(async () => ({ data: views }));
  nativeDialogs = {
    prompt: vi.spyOn(window, 'prompt').mockImplementation(() => null),
    confirm: vi.spyOn(window, 'confirm').mockImplementation(() => false),
    alert: vi.spyOn(window, 'alert').mockImplementation(() => undefined),
  };
});

afterEach(() => {
  expect(api.patch).not.toHaveBeenCalled();
  expect(nativeDialogs.prompt).not.toHaveBeenCalled();
  expect(nativeDialogs.confirm).not.toHaveBeenCalled();
  expect(nativeDialogs.alert).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

async function selectView(
  view: SavedListView,
  onApply = vi.fn(),
): Promise<{ user: ReturnType<typeof userEvent.setup>; select: HTMLElement; deleteButton: HTMLElement; onApply: typeof onApply }> {
  const user = userEvent.setup();
  renderControl({ onApply });
  await screen.findByRole('option', { name: 'Unpaid EU' });
  const select = screen.getByRole('combobox', { name: 'Saved views' });
  await user.selectOptions(select, view.id);
  return { user, select, deleteButton: screen.getByRole('button', { name: 'Delete view' }), onApply };
}

async function openDelete(view: SavedListView): Promise<Awaited<ReturnType<typeof selectView>> & { dialog: HTMLElement }> {
  const selected = await selectView(view);
  await selected.user.click(selected.deleteButton);
  const dialog = await screen.findByRole('dialog', { name: 'Delete view' });
  return { ...selected, dialog };
}

describe('SavedViewsControl — delete', () => {
  it('enables Delete view only for a selected view the caller may modify', async () => {
    const { user, select, deleteButton } = await selectView(COLLEAGUE_SHARED);
    expect(deleteButton).toBeDisabled();
    await user.selectOptions(select, '');
    expect(deleteButton).toBeDisabled();
    await user.selectOptions(select, OWN_VIEW.id);
    expect(deleteButton).toBeEnabled();
    await user.selectOptions(select, MODIFIABLE_SHARED.id);
    expect(deleteButton).toBeEnabled();
  });

  it('names the view in the confirmation and focuses Cancel; no shared warning for a private view', async () => {
    const { dialog } = await openDelete(OWN_VIEW);
    expect(dialog).toHaveTextContent('Delete the view “Unpaid EU”?');
    expect(dialog).not.toHaveTextContent('This view is shared.');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('warns that a shared view disappears for everybody', async () => {
    const { dialog } = await openDelete(MODIFIABLE_SHARED);
    expect(dialog).toHaveTextContent('Delete the view “Team EU”?');
    expect(dialog).toHaveTextContent(
      'This view is shared. It will disappear for every admin who can open this list.',
    );
  });

  it.each(['Escape', 'Cancel', 'scrim'])('keeps the view on %s and refocuses Delete view', async (how) => {
    const { user, dialog, select, deleteButton } = await openDelete(OWN_VIEW);
    if (how === 'Escape') await user.keyboard('{Escape}');
    if (how === 'Cancel') await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    if (how === 'scrim') fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.delete).not.toHaveBeenCalled();
    expect(select).toHaveValue(OWN_VIEW.id);
    expect(deleteButton).toHaveFocus();
  });

  it('deletes, clears the selection without applying, reloads and focuses the selector', async () => {
    api.delete.mockImplementation(async () => {
      views = [COLLEAGUE_SHARED, MODIFIABLE_SHARED];
      return { data: { deleted: OWN_VIEW.id } };
    });
    const { user, dialog, select, onApply } = await openDelete(OWN_VIEW);
    const appliedBefore = onApply.mock.calls.length;
    const getsBefore = api.get.mock.calls.length;
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.delete).toHaveBeenCalledWith(`${ENDPOINT}/${OWN_VIEW.id}`);
    expect(select).toHaveValue('');
    expect(onApply.mock.calls.length).toBe(appliedBefore);
    expect(api.get.mock.calls.length).toBeGreaterThan(getsBefore);
    await waitFor(() => expect(screen.queryByRole('option', { name: 'Unpaid EU' })).toBeNull());
    expect(select).toHaveFocus();
  });

  it('says a view deleted elsewhere is gone, reloads and clears the selection', async () => {
    api.delete.mockImplementation(async () => {
      views = [COLLEAGUE_SHARED, MODIFIABLE_SHARED];
      throw new ApiError(404, { error: { code: 'NOT_FOUND', message: 'Not found.' } });
    });
    const { user, dialog, select } = await openDelete(OWN_VIEW);
    const getsBefore = api.get.mock.calls.length;
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('This view no longer exists.'));
    expect(api.get.mock.calls.length).toBeGreaterThan(getsBefore);
    expect(select).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Delete view' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(select).toHaveFocus();
  });

  it('shows any other refusal in the dialog and changes nothing else', async () => {
    api.delete.mockRejectedValue(new ApiError(403, { error: { code: 'FORBIDDEN', message: 'You may not delete this view.' } }));
    const { user, dialog, select } = await openDelete(OWN_VIEW);
    // Described by nothing until there is something to say: an empty alert
    // region would be announced as a blank description.
    expect(within(dialog).getByRole('button', { name: 'Delete' })).not.toHaveAttribute('aria-describedby');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('You may not delete this view.'));
    expect(select).toHaveValue(OWN_VIEW.id);
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toHaveAccessibleDescription(
      'You may not delete this view.',
    );
  });

  it('is inert while the delete is in flight and sends one request', async () => {
    const pending = deferred<unknown>();
    api.delete.mockReturnValue(pending.promise);
    const { user, dialog } = await openDelete(OWN_VIEW);
    const confirm = within(dialog).getByRole('button', { name: 'Delete' });
    await user.click(confirm);
    await waitFor(() => expect(confirm).toBeDisabled());
    expect(dialog).toHaveAttribute('aria-busy', 'true');
    await user.keyboard('{Escape}');
    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    fireEvent.click(confirm);
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(api.delete).toHaveBeenCalledTimes(1);
    pending.resolve({ data: { deleted: OWN_VIEW.id } });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('names a hostile view in the confirmation as literal text', async () => {
    const hostile: SavedListView = { ...OWN_VIEW, id: '77777777-7777-4777-8777-777777777777', name: '<img src=x onerror=alert(1)>' };
    views = [OWN_VIEW, hostile];
    const { dialog } = await openDelete(hostile);
    expect(dialog).toHaveTextContent('Delete the view “<img src=x onerror=alert(1)>”?');
    expect(document.querySelector('img')).toBeNull();
  });

  it('has no axe violations with the confirmation open', async () => {
    await openDelete(MODIFIABLE_SHARED);
    await expectNoAxeViolations(document.body);
  });
});
