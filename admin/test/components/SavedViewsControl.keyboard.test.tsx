import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SavedListView } from '@endora-commerce/contracts';
import { installOffsetParentShim } from '../helpers/layout-shim';
import { ENDPOINT, OWN_VIEW, renderControl } from './saved-views-fixtures';

/**
 * Feature 147 (SC-002, QA) — save and delete a view with the keyboard alone:
 * Tab to a control, Enter or Space to act, type into the name field, Enter to
 * submit. Selecting an option is the browser's native `<select>` behaviour, so
 * it is the one step driven by a change event.
 */

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }));

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

let views: SavedListView[];

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  views = [OWN_VIEW];
  api.get.mockImplementation(async () => ({ data: views }));
});

afterEach(() => vi.restoreAllMocks());

describe('SavedViewsControl — keyboard only', () => {
  it('saves a view with Tab, Enter and typing, and focus returns to Save view', async () => {
    api.post.mockResolvedValue({ data: { ...OWN_VIEW, id: '44444444-4444-4444-8444-444444444444', name: 'Kbd' } });
    const user = userEvent.setup();
    renderControl();
    await screen.findByRole('option', { name: 'Unpaid EU' });
    screen.getByRole('combobox', { name: 'Saved views' }).focus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Save view' })).toHaveFocus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'Save view' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveFocus();
    await user.keyboard('  Kbd  {Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0]?.[0]).toBe(ENDPOINT);
    expect(api.post.mock.calls[0]?.[1]).toMatchObject({ name: 'Kbd', shared: false });
    expect(screen.getByRole('button', { name: 'Save view' })).toHaveFocus();
  });

  it('deletes a view with Tab and Enter, Cancel being the default focus, and focus lands on the selector', async () => {
    api.delete.mockImplementation(async () => {
      views = [];
      return { data: { deleted: OWN_VIEW.id } };
    });
    const user = userEvent.setup();
    renderControl();
    await screen.findByRole('option', { name: 'Unpaid EU' });
    const select = screen.getByRole('combobox', { name: 'Saved views' });
    fireEvent.change(select, { target: { value: OWN_VIEW.id } });
    select.focus();
    await user.tab(); // Save view
    await user.tab(); // Delete view
    expect(screen.getByRole('button', { name: 'Delete view' })).toHaveFocus();
    await user.keyboard(' ');
    await screen.findByRole('dialog', { name: 'Delete view' });
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    // Enter on the default focus keeps the view.
    await user.keyboard('{Tab}');
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
    expect(api.delete).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(select).toHaveFocus();
  });
});
