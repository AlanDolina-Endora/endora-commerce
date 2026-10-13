import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Bundle } from '../../../../packages/admin-shell/src/i18n/types';
import { renderWithI18n } from '../../helpers/render-with-i18n';
import { adminSession, modulePresence, withSession } from '../../helpers/render-with-session';

/**
 * Feature 145, User Story 4 (FR-040, FR-041, FR-043, FR-044, FR-010, SC-003):
 * on a price list's **Products & brackets** tab, **Add** opens the shared
 * product browser over the whole catalogue, one confirm is one bulk-add
 * request, and the roster names every product — however many — and opens the
 * bracket editor for any of them.
 *
 * **The bundle is `_i18n`'s shipped English one, read off disk**, so a key that
 * does not exist fails here instead of passing as its own name.
 *
 * **The server is a small fake**: the catalogue list filters, counts and
 * paginates; `batch-by-id` answers the ids it holds; the roster is a mutable
 * array the bulk add appends to, so the reload after a confirm reads what the
 * write did.
 */

const getSpy = vi.fn();
const postSpy = vi.fn();

vi.mock('@endora-commerce/admin-kit/lib', async () => {
  const actual = await vi.importActual<typeof import('@endora-commerce/admin-kit/lib')>(
    '@endora-commerce/admin-kit/lib',
  );
  return {
    ...actual,
    apiClient: {
      get: (...a: unknown[]) => getSpy(...a),
      post: (...a: unknown[]) => postSpy(...a),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

const { PriceListDetailPage } = await import(
  '../../../../packages/modules/price_lists/src/admin/pages/PriceListDetailPage'
);
const { ApiError } = await import('@endora-commerce/admin-kit/lib');

// ---------------------------------------------------------------- bundle

const REPO_ROOT = resolve(process.cwd(), '..');
const CORE: Record<string, string> = JSON.parse(
  readFileSync(join(REPO_ROOT, 'packages/modules/_i18n/i18n/en.json'), 'utf8'),
) as Record<string, string>;
const BUNDLE: Bundle = { core: CORE };

const key = (k: string): string => {
  const v = CORE[k];
  if (v === undefined) throw new Error(`missing core key ${k}`);
  return v;
};

// ---------------------------------------------------------------- fake catalogue

type Status = 'draft' | 'active' | 'inactive';
type Type = 'simple' | 'configurable' | 'grouped' | 'bundle' | 'virtual';

interface Row {
  id: string;
  sku: string;
  slug: string;
  name: Record<string, string>;
  status: Status;
  type: Type;
}

function product(id: string, name: string, status: Status = 'active', type: Type = 'simple'): Row {
  return { id, sku: `SKU-${id.toUpperCase()}`, slug: id, name: { 'en-US': name }, status, type };
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** g1 grouped, b1 bundle, d1 draft, i1 inactive, then a01…a40 — active simple. */
const CATALOG: Row[] = [
  product('g1', 'Grouped set', 'active', 'grouped'),
  product('b1', 'Bundle kit', 'active', 'bundle'),
  product('d1', 'Draft widget', 'draft'),
  product('i1', 'Old widget', 'inactive'),
  ...Array.from({ length: 40 }, (_, i) => product(`a${pad(i + 1)}`, `Widget ${pad(i + 1)}`)),
];

const LIST_PATH = '/api/v1/admin/catalog/products';
const BATCH_PATH = '/api/v1/admin/catalog/products/batch-by-id';
const PL_ID = 'pl-1';
const PL_PATH = `/api/v1/admin/price-lists-engine/${PL_ID}`;
const BULK_PATH = `${PL_PATH}/products/bulk-add`;

function serveCatalog(catalog: readonly Row[], url: string): unknown {
  const params = new URLSearchParams(url.split('?')[1] ?? '');
  const status = params.get('status');
  const type = params.get('type');
  const page = Number(params.get('page') ?? '0');
  const pageSize = Number(params.get('pageSize') ?? '20');
  const base = catalog.filter((p) => type === null || p.type === type);
  const filtered = base.filter((p) => status === null || p.status === status);
  return {
    data: filtered.slice(page * pageSize, (page + 1) * pageSize),
    pagination: { page, pageSize, total: filtered.length },
    counts: {
      all: base.length,
      active: base.filter((p) => p.status === 'active').length,
      draft: base.filter((p) => p.status === 'draft').length,
      inactive: base.filter((p) => p.status === 'inactive').length,
    },
  };
}

// ---------------------------------------------------------------- fake server state

interface RosterEntry {
  productId: string;
  bracketsByCurrency: Record<string, Array<{ minQty: number; unitPrice: string }>>;
}

const EXISTING_BRACKETS = { PLN: [{ minQty: 1, unitPrice: '9.99' }] };

let catalog: Row[];
let roster: RosterEntry[];
let isSystem: boolean;
/** Ids the bulk add reports `failed: product_not_found` (deleted after the picker opened). */
let deletedIds: Set<string>;
/** Per-test override of the bulk-add answer; the default appends to `roster`. */
let bulkAdd: ((body: { productIds: string[] }) => Promise<unknown>) | null;

function defaultBulkAdd(body: { productIds: string[] }): Promise<unknown> {
  const added: string[] = [];
  const unchanged: string[] = [];
  const failed: Array<{ productId: string; reason: 'product_not_found' }> = [];
  for (const id of body.productIds) {
    if (roster.some((e) => e.productId === id)) unchanged.push(id);
    else if (deletedIds.has(id) || !catalog.some((p) => p.id === id)) failed.push({ productId: id, reason: 'product_not_found' });
    else {
      added.push(id);
      roster = [{ productId: id, bracketsByCurrency: {} }, ...roster];
    }
  }
  return Promise.resolve({ data: { added, unchanged, failed } });
}

const SESSION = adminSession({ permissions: ['*'] });
const PAGE_SIZE_KEY = `b2b-admin.page-size.catalog-products.${SESSION.adminUser.id}`;

beforeEach(() => {
  getSpy.mockReset();
  postSpy.mockReset();
  catalog = CATALOG;
  roster = [
    { productId: 'a39', bracketsByCurrency: EXISTING_BRACKETS },
    { productId: 'a40', bracketsByCurrency: EXISTING_BRACKETS },
  ];
  isSystem = false;
  deletedIds = new Set();
  bulkAdd = null;
  window.localStorage.clear();
  window.localStorage.setItem(PAGE_SIZE_KEY, '10');
  getSpy.mockImplementation((path: string) => {
    if (path === PL_PATH) {
      return Promise.resolve({
        data: {
          id: PL_ID,
          name: isSystem ? 'Default' : 'Spring sale',
          type: 'sale',
          status: 'draft',
          startsAt: null,
          endsAt: null,
          applicationRule: { kind: 'all' },
          isSystem,
          modifiedAt: '2026-10-01T00:00:00.000Z',
          createdAt: '2026-10-01T00:00:00.000Z',
        },
      });
    }
    if (path === `${PL_PATH}/products`) {
      return Promise.resolve({ data: { items: roster.map((e) => ({ ...e })) } });
    }
    if (path === '/api/v1/admin/pricing/rule-targets/currencies') {
      return Promise.resolve({ data: { items: [] } });
    }
    if (path.startsWith(`${LIST_PATH}?`)) return Promise.resolve(serveCatalog(catalog, path));
    return Promise.resolve({ data: [] });
  });
  postSpy.mockImplementation((path: string, body: unknown) => {
    if (path === BATCH_PATH) {
      const ids = (body as { ids: string[] }).ids;
      return Promise.resolve({
        data: catalog.filter((p) => ids.includes(p.id)),
        pagination: { page: 0, pageSize: 500, total: ids.length },
      });
    }
    if (path === BULK_PATH) {
      const b = body as { productIds: string[] };
      return bulkAdd ? bulkAdd(b) : defaultBulkAdd(b);
    }
    return Promise.reject(new Error(`unexpected POST ${path}`));
  });
});

// ---------------------------------------------------------------- rig

function renderPage(permissions: readonly string[] = ['*']): void {
  renderWithI18n(
    withSession(
      <MemoryRouter initialEntries={[`/price-lists/${PL_ID}`]}>
        <Routes>
          <Route path="/price-lists/:id" element={<PriceListDetailPage />} />
        </Routes>
      </MemoryRouter>,
      {
        session: adminSession({ permissions: [...permissions] }),
        presence: modulePresence({ present: ['price_lists', 'catalog'] }),
      },
    ),
    BUNDLE,
  );
}

type User = ReturnType<typeof userEvent.setup>;

/** Open the page on the Products & brackets tab and wait for the roster. */
async function openProductsTab(user: User): Promise<void> {
  await user.click(await screen.findByRole('tab', { name: key('priceLists.detail.tab.products') }));
  await screen.findByText(key('priceLists.detail.products.title').replace('{count}', String(roster.length)));
}

function addButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: key('priceLists.detail.products.add') }) as HTMLButtonElement;
}

async function openPicker(user: User): Promise<HTMLElement> {
  await user.click(addButton());
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(dialog.querySelector('[aria-busy="true"]')).toBeNull());
  await waitFor(() => expect(within(dialog).queryAllByRole('checkbox').length).toBeGreaterThan(1));
  return dialog;
}

function rowCheckbox(dialog: HTMLElement, name: string): HTMLInputElement {
  return within(dialog).getByRole('checkbox', { name: `Select ${name}` }) as HTMLInputElement;
}

/** Tick Widget 01…Widget NN, paging forward as the picker needs to. */
async function tickWidgets(user: User, dialog: HTMLElement, count: number): Promise<string[]> {
  const names: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    const name = `Widget ${pad(i)}`;
    if (within(dialog).queryByText(name) === null) {
      await user.click(within(dialog).getByRole('button', { name: /Next/ }));
      await waitFor(() => expect(within(dialog).getByText(name)).toBeInTheDocument());
    }
    await user.click(rowCheckbox(dialog, name));
    names.push(name);
  }
  return names;
}

const bulkBodies = (): Array<{ productIds: string[] }> =>
  postSpy.mock.calls.filter(([p]) => p === BULK_PATH).map(([, b]) => b as { productIds: string[] });

const batchBodies = (): Array<{ ids: string[]; page: number; pageSize: number }> =>
  postSpy.mock.calls
    .filter(([p]) => p === BATCH_PATH)
    .map(([, b]) => b as { ids: string[]; page: number; pageSize: number });

function rosterNames(): string[] {
  return Array.from(document.querySelectorAll('[data-roster-name]')).map((el) => el.textContent ?? '');
}

function selectedRosterName(): string | null {
  return document.querySelector('[aria-current="true"] [data-roster-name]')?.textContent ?? null;
}

/** The product name the bracket editor's header shows, or null with no editor open. */
function editorName(): string | null {
  return screen.queryByText(key('priceLists.bracket.help'))?.previousElementSibling?.textContent ?? null;
}

const ids = (from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => `a${pad(from + i)}`);

// ---------------------------------------------------------------- cases

describe('Price list Products & brackets — bulk add through the product browser (US4)', () => {
  it('opens the browser on All with every type and status selectable (sc. 1, FR-012)', async () => {
    const user = userEvent.setup();
    renderPage();
    await openProductsTab(user);
    const dialog = await openPicker(user);

    expect(within(dialog).getByRole('tab', { name: /^All/ }).getAttribute('aria-selected')).toBe('true');
    expect(getSpy.mock.calls.map(([p]) => String(p))).toContain(`${LIST_PATH}?includeArchived=1&page=0&pageSize=10`);
    expect(within(dialog).getByRole('heading', { name: key('priceLists.detail.picker.title') })).toBeInTheDocument();
    for (const name of ['Grouped set', 'Bundle kit', 'Draft widget', 'Old widget', 'Widget 01']) {
      expect(rowCheckbox(dialog, name).disabled).toBe(false);
    }
  });

  it('marks products already on the list as such, not selectable (sc. 2)', async () => {
    const user = userEvent.setup();
    catalog = [product('a39', 'Widget 39'), product('a40', 'Widget 40'), product('a01', 'Widget 01')];
    renderPage();
    await openProductsTab(user);
    const dialog = await openPicker(user);

    for (const name of ['Widget 39', 'Widget 40']) {
      const box = rowCheckbox(dialog, name);
      expect(box.disabled).toBe(true);
      expect(document.getElementById(box.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
        key('priceLists.detail.picker.alreadyOnList'),
      );
    }
    expect(rowCheckbox(dialog, 'Widget 01').disabled).toBe(false);
  });

  it('adds 30 from several pages in one request, closes, reloads and opens the first added (sc. 3, 5)', async () => {
    const user = userEvent.setup();
    renderPage();
    await openProductsTab(user);
    const dialog = await openPicker(user);
    await tickWidgets(user, dialog, 30);

    await user.click(within(dialog).getByRole('button', { name: 'Add 30' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(bulkBodies()).toEqual([{ productIds: ids(1, 30) }]);
    await waitFor(() => expect(rosterNames()).toHaveLength(32));
    expect(rosterNames()).toEqual(expect.arrayContaining(['Widget 01', 'Widget 30', 'Widget 39', 'Widget 40']));
    expect(selectedRosterName()).toBe('Widget 01');
    expect(editorName()).toBe('Widget 01');
    expect(roster.find((e) => e.productId === 'a39')?.bracketsByCurrency).toEqual(EXISTING_BRACKETS);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('names the products that failed with the translated reason, and keeps the others (sc. 4)', async () => {
    const user = userEvent.setup();
    deletedIds = new Set(['a05', 'a07']);
    renderPage();
    await openProductsTab(user);
    const dialog = await openPicker(user);
    await tickWidgets(user, dialog, 30);

    await user.click(within(dialog).getByRole('button', { name: 'Add 30' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(bulkBodies()).toHaveLength(1);
    await waitFor(() => expect(rosterNames()).toHaveLength(30));
    const alert = await screen.findByRole('alert');
    const reason = key('priceLists.detail.bulkAdd.failed.product_not_found');
    expect(alert.textContent).toContain('Widget 05');
    expect(alert.textContent).toContain('SKU-A05');
    expect(alert.textContent).toContain('Widget 07');
    expect(alert.textContent).toContain(reason);
    expect(alert.textContent).toContain(
      key('priceLists.detail.bulkAdd.failed').split('{products}')[0]!.replace('{count}', '2').trim(),
    );
    expect(rosterNames()).not.toContain('Widget 05');
    expect(selectedRosterName()).toBe('Widget 01');
  });

  it('shows no error for a product another admin added meanwhile (sc. 8)', async () => {
    const user = userEvent.setup();
    renderPage();
    await openProductsTab(user);
    const dialog = await openPicker(user);
    await tickWidgets(user, dialog, 3);
    roster = [{ productId: 'a02', bracketsByCurrency: EXISTING_BRACKETS }, ...roster];

    await user.click(within(dialog).getByRole('button', { name: 'Add 3' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await waitFor(() => expect(rosterNames()).toHaveLength(5));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(roster.find((e) => e.productId === 'a02')?.bracketsByCurrency).toEqual(EXISTING_BRACKETS);
    expect(selectedRosterName()).toBe('Widget 01');
  });

  it('closes and leaves the selection as it was when nothing was added (Assumptions)', async () => {
    const user = userEvent.setup();
    renderPage();
    await openProductsTab(user);
    expect(selectedRosterName()).toBe('Widget 39');
    const dialog = await openPicker(user);
    await tickWidgets(user, dialog, 2);
    roster = [
      { productId: 'a01', bracketsByCurrency: {} },
      { productId: 'a02', bracketsByCurrency: {} },
      ...roster,
    ];

    await user.click(within(dialog).getByRole('button', { name: 'Add 2' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(rosterNames()).toHaveLength(4));
    expect(selectedRosterName()).toBe('Widget 39');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    ['404 list deleted', () => new ApiError(404, { error: { code: 'NOT_FOUND', message: 'Price list pl-1 not found.' } } as never)],
    ['403 refused', () => new ApiError(403, { error: { code: 'FORBIDDEN', message: 'Forbidden' } } as never)],
    ['500 server error', () => new ApiError(500, { error: { code: 'INTERNAL', message: 'boom' } } as never)],
    ['network error', () => new TypeError('Failed to fetch')],
  ])('keeps the picker open with the selection and a Retry on %s; Retry re-sends the same body (sc. 13)', async (_l, makeError) => {
    const user = userEvent.setup();
    let fail = true;
    bulkAdd = (body) => (fail ? Promise.reject(makeError()) : defaultBulkAdd(body));
    renderPage();
    await openProductsTab(user);
    const dialog = await openPicker(user);
    await tickWidgets(user, dialog, 12);

    await user.click(within(dialog).getByRole('button', { name: 'Add 12' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toContain(key('priceLists.detail.bulkAdd.error'));
    expect(within(dialog).getByText('12 selected')).toBeInTheDocument();
    expect(rosterNames()).toEqual(['Widget 39', 'Widget 40']);

    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(bulkBodies()).toEqual([{ productIds: ids(1, 12) }, { productIds: ids(1, 12) }]);
    await waitFor(() => expect(rosterNames()).toHaveLength(14));
  });

  it('disables confirm and Retry while the request is in flight (FR-010)', async () => {
    const user = userEvent.setup();
    const pending: Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];
    bulkAdd = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));
    renderPage();
    await openProductsTab(user);
    const dialog = await openPicker(user);
    await tickWidgets(user, dialog, 2);

    await user.click(within(dialog).getByRole('button', { name: 'Add 2' }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Add 2' })).toBeDisabled());
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();

    pending[0]!.reject(new TypeError('Failed to fetch'));
    const retry = await within(dialog).findByRole('button', { name: 'Retry' });
    await user.click(retry);
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Add 2' })).toBeDisabled());
    expect(within(dialog).queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(bulkBodies()).toHaveLength(2);
  });

  it('keeps Add disabled on the system Default list (sc. 6)', async () => {
    const user = userEvent.setup();
    isSystem = true;
    renderPage();
    await openProductsTab(user);
    expect(addButton()).toBeDisabled();
  });

  it('disables Add with a hint without price_lists:write (FR-044)', async () => {
    const user = userEvent.setup();
    renderPage(['price_lists:read', 'catalog:read']);
    await openProductsTab(user);
    const button = addButton();
    expect(button).toBeDisabled();
    const hint = document.getElementById(button.getAttribute('aria-describedby') ?? '');
    expect(hint?.textContent).toBe(key('priceLists.detail.products.add.noPermission'));
  });

  it('names a 700-product roster through batch-by-id in 500 + 200, and opens the editor beyond the newest 20 (sc. 7, SC-003)', async () => {
    const user = userEvent.setup();
    const big = Array.from({ length: 700 }, (_, i) => product(`r${String(i).padStart(3, '0')}`, `Roster ${i}`));
    catalog = big.filter((p) => p.id !== 'r699');
    roster = big.map((p) => ({ productId: p.id, bracketsByCurrency: {} }));
    renderPage();
    await openProductsTab(user);

    await waitFor(() => expect(rosterNames()).toContain('Roster 650'));
    expect(batchBodies().map((b) => [b.ids.length, b.page, b.pageSize])).toEqual([
      [500, 0, 500],
      [200, 0, 500],
    ]);
    expect(rosterNames().filter((n) => n.startsWith('Roster '))).toHaveLength(699);
    expect(rosterNames()).toContain('r699');
    expect(getSpy.mock.calls.map(([p]) => String(p))).not.toContain(LIST_PATH);

    await user.click(screen.getByText('Roster 650', { selector: '[data-roster-name]' }));
    expect(editorName()).toBe('Roster 650');
    await user.click(screen.getByText('r699', { selector: '[data-roster-name]' }));
    expect(editorName()).toBe('r699');
  });
});
