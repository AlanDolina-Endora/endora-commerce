import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@endora-commerce/admin-kit/lib';
import { defineModuleErrorCodes, type SavedListView } from '@endora-commerce/contracts';
import { expectNoAxeViolations } from '../helpers/axe';
import { installOffsetParentShim } from '../helpers/layout-shim';
import {
  COLLEAGUE_SHARED,
  CURRENT,
  ENDPOINT,
  MODIFIABLE_SHARED,
  OWN_VIEW,
  PL_BUNDLE,
  deferred,
  renderControl,
} from './saved-views-fixtures';

/**
 * Feature 147 (T010, US1) — the kit's saved-views control: the selector and
 * the save dialog (`specs/147-saved-views/contracts/admin-kit-saved-views.md`
 * §2). `apiClient` is replaced through the kit's `lib` barrel, the one seam a
 * test outside the package can name; the component's own requests resolve to
 * the same module record.
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

// Minted by the orders module in Phase 3; branded here the way a module declares it.
const { ORDER_SAVED_VIEW_NAME_TAKEN } = defineModuleErrorCodes(['ORDER_SAVED_VIEW_NAME_TAKEN']);

let nativeDialogs: { prompt: ReturnType<typeof vi.spyOn>; confirm: ReturnType<typeof vi.spyOn>; alert: ReturnType<typeof vi.spyOn> };

function listing(views: SavedListView[]): void {
  api.get.mockImplementation(async () => ({ data: views }));
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  listing([OWN_VIEW, COLLEAGUE_SHARED, MODIFIABLE_SHARED]);
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

async function openSaveDialog(
  props: Parameters<typeof renderControl>[0] = {},
  bundle?: Parameters<typeof renderControl>[1],
): Promise<{ user: ReturnType<typeof userEvent.setup>; dialog: HTMLElement }> {
  const user = userEvent.setup();
  renderControl(props, bundle);
  await screen.findByRole('option', { name: 'Unpaid EU' });
  await user.click(screen.getByRole('button', { name: bundle ? 'Zapisz widok' : 'Save view' }));
  const dialog = await screen.findByRole('dialog', { name: bundle ? 'Zapisz widok' : 'Save view' });
  return { user, dialog };
}

describe('SavedViewsControl — selector', () => {
  it('lists the views, a shared one with the translated suffix, after a "none" option', async () => {
    renderControl();
    const select = screen.getByRole('combobox', { name: 'Saved views' });
    await screen.findByRole('option', { name: 'Unpaid EU' });
    const options = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['— Select a view —', 'Unpaid EU', 'Big orders (shared)', 'Team EU (shared)']);
    expect(api.get).toHaveBeenCalledWith(ENDPOINT);
  });

  it('applies a chosen view with absent sort and columns as null', async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    renderControl({ onApply });
    await screen.findByRole('option', { name: 'Unpaid EU' });
    const select = screen.getByRole('combobox', { name: 'Saved views' });
    await user.selectOptions(select, COLLEAGUE_SHARED.id);
    expect(onApply).toHaveBeenLastCalledWith({ filters: COLLEAGUE_SHARED.filters, sort: null, visibleColumns: null });
    await user.selectOptions(select, OWN_VIEW.id);
    expect(onApply).toHaveBeenLastCalledWith({
      filters: OWN_VIEW.filters,
      sort: OWN_VIEW.sort,
      visibleColumns: OWN_VIEW.visibleColumns,
    });
    onApply.mockClear();
    await user.selectOptions(select, '');
    expect(onApply).not.toHaveBeenCalled();
  });

  it('reports a list-load failure through onError', async () => {
    api.get.mockImplementation(async () => {
      throw new ApiError(500, { error: { code: 'INTERNAL', message: 'Listing exploded.' } });
    });
    const onError = vi.fn();
    renderControl({ onError });
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Listing exploded.'));
  });

  it('gives both icon buttons their accessible names from the core bundle', async () => {
    renderControl();
    await screen.findByRole('option', { name: 'Unpaid EU' });
    expect(screen.getByRole('button', { name: 'Save view' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Delete view' })).toBeDisabled();
  });
});

describe('SavedViewsControl — save dialog', () => {
  it('opens with the name field focused and Share unchecked', async () => {
    const { dialog } = await openSaveDialog();
    expect(within(dialog).getByLabelText('Name')).toHaveFocus();
    expect(within(dialog).getByLabelText('Share with every admin who can open this list')).not.toBeChecked();
  });

  it('refuses an empty or whitespace-only name inline and sends nothing', async () => {
    const { user, dialog } = await openSaveDialog();
    const input = within(dialog).getByLabelText('Name');
    await user.type(input, '   {Enter}');
    const alert = within(dialog).getByRole('alert');
    expect(alert).toHaveTextContent('Enter a name for the view.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain(alert.id);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('refuses a 161-character name with the 160 limit and sends nothing', async () => {
    const { user, dialog } = await openSaveDialog();
    const input = within(dialog).getByLabelText('Name');
    fireEvent.change(input, { target: { value: 'x'.repeat(161) } });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('The name can be at most 160 characters long.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('refuses a name with a bidi override character and sends nothing', async () => {
    const { user, dialog } = await openSaveDialog();
    const input = within(dialog).getByLabelText('Name');
    fireEvent.change(input, { target: { value: 'abc‮def' } });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('The name contains characters that cannot be used.');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('refuses a name the caller already uses, by key, and sends nothing', async () => {
    const { user, dialog } = await openSaveDialog();
    await user.type(within(dialog).getByLabelText('Name'), ' unpaid eu {Enter}');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('You already have a view with this name.');
    expect(api.post).not.toHaveBeenCalled();
  });

  it("allows the name of a colleague's shared view", async () => {
    api.post.mockResolvedValue({ data: { ...OWN_VIEW, id: '44444444-4444-4444-8444-444444444444', name: 'Big orders' } });
    const { user, dialog } = await openSaveDialog();
    await user.type(within(dialog).getByLabelText('Name'), 'big ORDERS{Enter}');
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  });

  it('submits a trimmed name, the share flag and the current state, then closes, reloads and refocuses Save view', async () => {
    api.post.mockResolvedValue({ data: { ...OWN_VIEW, id: '55555555-5555-4555-8555-555555555555', name: 'Fresh' } });
    const { user, dialog } = await openSaveDialog();
    const getsBefore = api.get.mock.calls.length;
    await user.type(within(dialog).getByLabelText('Name'), '  Fresh  ');
    await user.click(within(dialog).getByLabelText('Share with every admin who can open this list'));
    await user.type(within(dialog).getByLabelText('Name'), '{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.post).toHaveBeenCalledWith(ENDPOINT, {
      name: 'Fresh',
      shared: true,
      filters: CURRENT.filters,
      sort: CURRENT.sort,
      visibleColumns: CURRENT.visibleColumns,
    });
    expect(api.get.mock.calls.length).toBeGreaterThan(getsBefore);
    expect(screen.getByRole('button', { name: 'Save view' })).toHaveFocus();
    expect(screen.getByRole('combobox', { name: 'Saved views' })).toHaveValue('');
  });

  it.each([
    ['409', new ApiError(409, { error: { code: ORDER_SAVED_VIEW_NAME_TAKEN, message: 'You already have a saved view with this name on the order list. Choose a different name.' } }), 'You already have a saved view with this name on the order list. Choose a different name.'],
    ['500', new ApiError(500, { error: { code: 'INTERNAL', message: 'The database is unavailable.' } }), 'The database is unavailable.'],
    ['network failure', new TypeError('Failed to fetch'), 'The view could not be saved.'],
  ])('keeps the dialog, the name and the share flag on a %s and shows the message', async (_label, failure, message) => {
    api.post.mockRejectedValue(failure);
    const { user, dialog } = await openSaveDialog();
    const input = within(dialog).getByLabelText('Name');
    const share = within(dialog).getByLabelText('Share with every admin who can open this list');
    await user.type(input, 'Overdue');
    await user.click(share);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent(message));
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(input).toHaveValue('Overdue');
    expect(share).toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('marks the name invalid on a server 409 and clears it on the next keystroke', async () => {
    const message = 'You already have a saved view with this name on the order list. Choose a different name.';
    api.post.mockRejectedValue(new ApiError(409, { error: { code: ORDER_SAVED_VIEW_NAME_TAKEN, message } }));
    const { user, dialog } = await openSaveDialog();
    const input = within(dialog).getByLabelText('Name');
    await user.type(input, 'Overdue{Enter}');
    const alert = within(dialog).getByRole('alert');
    await waitFor(() => expect(alert).toHaveTextContent(message));
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain(alert.id);
    expect(input).toHaveFocus();
    await user.type(input, 's');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(alert).toHaveTextContent('');
  });

  it('does not mark the name invalid on a server failure that is not about the name', async () => {
    api.post.mockRejectedValue(new ApiError(500, { error: { code: 'INTERNAL', message: 'The database is unavailable.' } }));
    const { user, dialog } = await openSaveDialog();
    const input = within(dialog).getByLabelText('Name');
    await user.type(input, 'Overdue{Enter}');
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('The database is unavailable.'));
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('is inert while the save is in flight and sends one request', async () => {
    const pending = deferred<unknown>();
    api.post.mockReturnValue(pending.promise);
    const { user, dialog } = await openSaveDialog();
    const input = within(dialog).getByLabelText('Name');
    await user.type(input, 'Slow{Enter}');
    const submit = await within(dialog).findByRole('button', { name: /Saving…/ });
    expect(submit).toBeDisabled();
    expect(dialog).toHaveAttribute('aria-busy', 'true');
    await user.keyboard('{Escape}');
    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(api.post).toHaveBeenCalledTimes(1);
    pending.resolve({ data: { ...OWN_VIEW, name: 'Slow' } });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it.each(['Escape', 'Cancel', 'scrim'])('closes on %s without a request and refocuses Save view', async (how) => {
    const { user, dialog } = await openSaveDialog();
    await user.type(within(dialog).getByLabelText('Name'), 'Draft');
    if (how === 'Escape') await user.keyboard('{Escape}');
    if (how === 'Cancel') await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    if (how === 'scrim') fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save view' })).toHaveFocus();
  });

  it('keeps Tab inside the dialog', async () => {
    const { user, dialog } = await openSaveDialog();
    await user.type(within(dialog).getByLabelText('Name'), 'Loop');
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < 6; i += 1) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('renders the whole flow in Polish with the Polish bundle', async () => {
    const { user, dialog } = await openSaveDialog({}, PL_BUNDLE);
    expect(screen.getByRole('combobox', { name: 'Zapisane widoki' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '— Wybierz widok —' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Big orders (udostępniony)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Usuń widok' })).toBeDisabled();
    expect(
      within(dialog).getByLabelText('Udostępnij wszystkim administratorom, którzy mają dostęp do tej listy'),
    ).not.toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Anuluj' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Zapisz' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Podaj nazwę widoku.');
    fireEvent.change(within(dialog).getByLabelText('Nazwa'), { target: { value: 'y'.repeat(161) } });
    await user.click(within(dialog).getByRole('button', { name: 'Zapisz' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Nazwa może mieć najwyżej 160 znaków.');
  });

  it('renders HTML-looking names as literal text in options and duplicate feedback', async () => {
    const hostile = ['<b>x</b>', 'a & b', 'x > y', '<img src=x onerror=alert(1)>'].map((name, i) => ({
      ...OWN_VIEW,
      id: `6666666${i}-6666-4666-8666-666666666666`,
      name,
    }));
    listing(hostile);
    const user = userEvent.setup();
    renderControl();
    const select = screen.getByRole('combobox', { name: 'Saved views' });
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(5));
    const texts = within(select).getAllByRole('option').slice(1).map((o) => o.textContent);
    expect(texts).toEqual(hostile.map((v) => v.name));
    expect(document.querySelector('img')).toBeNull();
    expect(select.querySelector('b')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Save view' }));
    const dialog = await screen.findByRole('dialog', { name: 'Save view' });
    const input = within(dialog).getByLabelText('Name');
    fireEvent.change(input, { target: { value: '<img src=x onerror=alert(1)>' } });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('You already have a view with this name.');
    expect(input).toHaveValue('<img src=x onerror=alert(1)>');
    expect(document.querySelector('img')).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('has no axe violations with the save dialog open', async () => {
    await openSaveDialog();
    await expectNoAxeViolations(document.body);
  });
});
