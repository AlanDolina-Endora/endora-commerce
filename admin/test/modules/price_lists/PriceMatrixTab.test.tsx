import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { PriceMatrixEntry } from '@endora-commerce/contracts';
import type { Bundle } from '../../../../packages/admin-shell/src/i18n/types';
import { renderWithI18n } from '../../helpers/render-with-i18n';
import { adminSession, modulePresence, withSession } from '../../helpers/render-with-session';

/**
 * Feature 148 — the *Price matrix* tab on a price list
 * (`specs/148-price-list-matrix-rules/contracts/admin-ui-price-matrix.md`).
 *
 * The bundles are the shipped English ones read off disk — `_i18n`'s `core`
 * and this module's own — so a missing key fails here instead of rendering as
 * its name. The server is a small fake holding the entries in an array.
 */

const getSpy = vi.fn();
const postSpy = vi.fn();
const patchSpy = vi.fn();
const deleteSpy = vi.fn();

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
      patch: (...a: unknown[]) => patchSpy(...a),
      delete: (...a: unknown[]) => deleteSpy(...a),
    },
  };
});

const { PriceListDetailPage } = await import(
  '../../../../packages/modules/price_lists/src/admin/pages/PriceListDetailPage'
);
const { ApiError } = await import('@endora-commerce/admin-kit/lib');

const REPO_ROOT = resolve(process.cwd(), '..');
const read = (path: string): Record<string, string> =>
  JSON.parse(readFileSync(join(REPO_ROOT, path), 'utf8')) as Record<string, string>;
const CORE = read('packages/modules/_i18n/i18n/en.json');
const MODULE = read('packages/modules/price_lists/i18n/en.json');
const BUNDLE: Bundle = { core: CORE, price_lists: MODULE };

const m = (k: string, params: Record<string, string | number> = {}): string => {
  let v = MODULE[k];
  if (v === undefined) throw new Error(`missing price_lists key ${k}`);
  for (const [name, value] of Object.entries(params)) v = v.replace(`{${name}}`, String(value));
  return v;
};

const PL_ID = 'pl-1';
const PL_PATH = `/api/v1/admin/price-lists-engine/${PL_ID}`;
const MATRIX_PATH = `${PL_PATH}/matrix`;
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
const ORG_ID = '11111111-1111-4111-8111-111111111111';

let entries: PriceMatrixEntry[];
let attributes: Array<{ key: string; label: string; valueType: string; options: Array<{ value: string; label: string }> }>;
let createImpl: ((body: Record<string, unknown>) => Promise<unknown>) | null;

function makeEntry(over: Partial<PriceMatrixEntry>): PriceMatrixEntry {
  return {
    id: `e-${entries.length + 1}`,
    priceListId: PL_ID,
    selectionKind: 'category',
    productId: null,
    categoryId: CATEGORY_ID,
    attribute: null,
    organizationId: ORG_ID,
    minQuantity: 500,
    maxQuantity: null,
    price: { type: 'discount_percent', percent: '12' },
    active: true,
    inactiveReason: null,
    targetDeleted: false,
    labels: { product: null, category: 'Fasteners', attribute: null, organization: 'Acme Sp. z o.o.' },
    createdAt: '2026-10-16T00:00:00.000Z',
    updatedAt: '2026-10-16T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  getSpy.mockReset();
  postSpy.mockReset();
  patchSpy.mockReset();
  deleteSpy.mockReset();
  entries = [];
  attributes = [
    { key: 'material', label: 'Material', valueType: 'select', options: [{ value: 'stainless', label: 'Stainless steel' }, { value: 'brass', label: 'Brass' }] },
  ];
  createImpl = null;
  getSpy.mockImplementation((path: string) => {
    if (path === PL_PATH) {
      return Promise.resolve({
        data: {
          id: PL_ID,
          name: 'Contract prices',
          type: 'base',
          status: 'active',
          startsAt: null,
          endsAt: null,
          applicationRule: { kind: 'all' },
          isSystem: false,
          modifiedAt: '2026-10-01T00:00:00.000Z',
          createdAt: '2026-10-01T00:00:00.000Z',
        },
      });
    }
    if (path.startsWith(`${MATRIX_PATH}?`)) {
      return Promise.resolve({ data: { items: entries, total: entries.length, page: 0, pageSize: 50, limit: 5000 } });
    }
    if (path.startsWith('/api/v1/admin/pricing/rule-targets/attributes')) {
      return Promise.resolve({ data: { items: attributes } });
    }
    if (path === '/api/v1/admin/pricing/rule-targets/categories') {
      return Promise.resolve({
        data: { items: [{ id: CATEGORY_ID, slug: 'fasteners', name: { 'en-US': 'Fasteners' }, parentCategoryId: null, sortOrder: 0 }] },
      });
    }
    if (path.startsWith('/api/v1/admin/pricing/rule-targets/organizations')) {
      return Promise.resolve({ data: { items: [{ id: ORG_ID, name: 'Acme Sp. z o.o.', taxId: 'PL1' }], nextCursor: null } });
    }
    if (path === '/api/v1/admin/pricing/rule-targets/currencies') {
      return Promise.resolve({ data: { items: [{ code: 'PLN', exposedByChannels: ['pl_retail'] }] } });
    }
    return Promise.resolve({ data: { items: [] } });
  });
  postSpy.mockImplementation((path: string, body: Record<string, unknown>) => {
    if (path !== MATRIX_PATH) return Promise.reject(new Error(`unexpected POST ${path}`));
    if (createImpl) return createImpl(body);
    const created = makeEntry({
      categoryId: (body['categoryId'] as string | null) ?? null,
      organizationId: (body['organizationId'] as string | null) ?? null,
      minQuantity: body['minQuantity'] as number,
    });
    entries = [...entries, created];
    return Promise.resolve({ data: created });
  });
  deleteSpy.mockImplementation((path: string) => {
    entries = entries.filter((e) => !path.endsWith(`/${e.id}`));
    return Promise.resolve(undefined);
  });
});

function renderPage(permissions: readonly string[] = ['*']): void {
  renderWithI18n(
    withSession(
      <MemoryRouter initialEntries={[`/price-lists/${PL_ID}?tab=matrix`]}>
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

describe('Price matrix tab (feature 148)', () => {
  it('opens on ?tab=matrix and shows the empty state', async () => {
    renderPage();
    const tab = await screen.findByRole('tab', { name: m('priceMatrix.tab') });
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByText(m('priceMatrix.empty.title'))).toBeTruthy();
    expect(screen.getByText(m('priceMatrix.counter', { count: 0, limit: 5000 }))).toBeTruthy();
  });

  it('creates a category × organization × percentage entry with the contract body', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: m('priceMatrix.add') }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: m('priceMatrix.selection.category') }));
    await user.selectOptions(await within(dialog).findByLabelText(m('priceMatrix.form.category')), CATEGORY_ID);
    await user.selectOptions(await within(dialog).findByLabelText(m('priceMatrix.form.organization')), ORG_ID);
    const from = within(dialog).getByLabelText(m('priceMatrix.quantity.from'));
    await user.clear(from);
    await user.type(from, '500');
    await user.click(within(dialog).getByRole('radio', { name: m('priceMatrix.price.discountPercent') }));
    await user.type(within(dialog).getByLabelText(m('priceMatrix.price.percent')), '12');
    await user.click(within(dialog).getByRole('button', { name: m('priceMatrix.form.save') }));

    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1));
    expect(postSpy.mock.calls[0]![1]).toEqual({
      productId: null,
      categoryId: CATEGORY_ID,
      attribute: null,
      organizationId: ORG_ID,
      minQuantity: 500,
      maxQuantity: null,
      price: { type: 'discount_percent', percent: '12' },
    });
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Fasteners')).toBeTruthy();
    expect(within(table).getByText('500+')).toBeTruthy();
    expect(within(table).getByText('−12%')).toBeTruthy();
  });

  it('builds an attribute selection from the eligible attributes only', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: m('priceMatrix.add') }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: m('priceMatrix.selection.attribute') }));
    await user.selectOptions(await within(dialog).findByLabelText(m('priceMatrix.form.attribute')), 'material');
    await user.selectOptions(within(dialog).getByLabelText(m('priceMatrix.form.attributeValue')), 'stainless');
    await user.type(within(dialog).getByLabelText(m('priceMatrix.price.percent')), '10');
    await user.click(within(dialog).getByRole('button', { name: m('priceMatrix.form.save') }));
    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1));
    expect(postSpy.mock.calls[0]![1]).toMatchObject({
      attribute: { key: 'material', value: 'stainless' },
      categoryId: null,
      price: { type: 'discount_percent', percent: '10' },
    });
  });

  it('explains where to flag an attribute when none is eligible', async () => {
    attributes = [];
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: m('priceMatrix.add') }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: m('priceMatrix.selection.attribute') }));
    expect(await within(dialog).findByText(m('priceMatrix.form.noEligibleAttributes'))).toBeTruthy();
  });

  it('marks an inactive attribute entry with its reason, and a deleted target', async () => {
    entries = [
      makeEntry({
        id: 'e-attr',
        selectionKind: 'attribute',
        categoryId: null,
        attribute: { key: 'material', value: 'stainless' },
        active: false,
        inactiveReason: 'attribute_not_flagged',
        labels: { product: null, category: null, attribute: { label: 'Material', valueLabel: 'Stainless steel' }, organization: 'Acme Sp. z o.o.' },
      }),
      makeEntry({ id: 'e-deleted', minQuantity: 1, targetDeleted: true, labels: { product: null, category: null, attribute: null, organization: 'Acme Sp. z o.o.' } }),
    ];
    renderPage();
    const table = await screen.findByRole('table');
    expect(within(table).getByText(m('priceMatrix.status.inactive'))).toBeTruthy();
    expect(within(table).getByText(m('priceMatrix.inactive.attribute_not_flagged'))).toBeTruthy();
    expect(within(table).getByText(m('priceMatrix.targetDeleted'))).toBeTruthy();
  });

  it('hides every write control without price_lists:write', async () => {
    entries = [makeEntry({})];
    renderPage(['price_lists:read']);
    expect(await screen.findByText(m('priceMatrix.readOnly'))).toBeTruthy();
    const table = await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: m('priceMatrix.add') })).toBeNull();
    expect(within(table).queryByRole('button', { name: m('priceMatrix.delete') })).toBeNull();
    expect(within(table).queryByRole('button', { name: m('priceMatrix.edit') })).toBeNull();
  });

  it('deletes after a confirmation', async () => {
    entries = [makeEntry({ id: 'e-1' })];
    const user = userEvent.setup();
    renderPage();
    const table = await screen.findByRole('table');
    await user.click(within(table).getByRole('button', { name: m('priceMatrix.delete') }));
    const confirm = await screen.findByRole('dialog');
    expect(within(confirm).getByText(m('priceMatrix.delete.confirm'))).toBeTruthy();
    await user.click(within(confirm).getByRole('button', { name: m('priceMatrix.delete') }));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith(`${MATRIX_PATH}/e-1`));
    expect(await screen.findByText(m('priceMatrix.empty.title'))).toBeTruthy();
  });

  it('shows an overlap with a way to the conflicting entry', async () => {
    entries = [makeEntry({ id: 'e-1' })];
    createImpl = () =>
      Promise.reject(
        new ApiError(409, {
          error: {
            code: 'PRICE_MATRIX_ENTRY_OVERLAP',
            message: 'Another entry already covers part of this quantity range.',
            details: { conflictingEntryId: 'e-1' },
          },
        }),
      );
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: m('priceMatrix.add') }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(m('priceMatrix.price.percent')), '5');
    await user.click(within(dialog).getByRole('button', { name: m('priceMatrix.form.save') }));
    expect(await within(dialog).findByText('Another entry already covers part of this quantity range.')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: m('priceMatrix.error.overlap.show') }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const row = await screen.findByTestId('price-matrix-row-e-1');
    expect(row.getAttribute('data-highlighted')).toBe('true');
  });
});
