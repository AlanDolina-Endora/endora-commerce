import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { AppLanguageContext } from '../../../packages/admin-shell/src/i18n/app-language-context';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderWithI18n } from '../helpers/render-with-i18n';
import { adminSession } from '../helpers/render-with-session';

/**
 * The three data-fetching pickers build their **own** requests (feature 091, P2).
 *
 * Before P2 each of them imported another module's admin API client —
 * `salesChannelsClient`, `cmsClient`, `organizationsPickerClient` — which is
 * why `backend/scripts/ledgers/cross-module-imports/host.ts` carried seven keys
 * for four files and why `admin-kit-surface.md` R6 refused to publish them: a
 * kit component that imports module code puts module knowledge in the kit.
 *
 * The exit P2 takes is the one batches three and five took for a module screen:
 * the caller rebuilds the request from the published `apiClient` and the
 * owner's **contract** types. So these tests assert the request, not a client
 * call — there is no client left to spy on, and the URL is now the whole of
 * what the picker knows about the module whose data it shows.
 *
 * The mock is keyed on `@endora-commerce/admin-kit/lib`, the barrel the moved
 * components import `apiClient` from. That is deliberate and is the seam every
 * packaged screen's test already uses (`admin/test/modules/carts/CartsList.test.tsx`
 * says so in its own comment): `vi.mock` keys on a resolved module id, and a
 * component importing `../../lib/api-client.js` from inside the package would
 * resolve to a module this mock does not name.
 */

const getSpy = vi.fn();

vi.mock('@endora-commerce/admin-kit/lib', async () => {
  const actual = await vi.importActual<typeof import('@endora-commerce/admin-kit/lib')>(
    '@endora-commerce/admin-kit/lib',
  );
  return {
    ...actual,
    apiClient: {
      get: (...args: unknown[]) => getSpy(...args),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

const { CmsBlockPicker, CmsPagePicker, ProductPicker, SalesChannelPicker } = await import(
  '@endora-commerce/admin-kit/components'
);
const { AuthProvider } = await import('@endora-commerce/admin-kit/lib');

/**
 * `<Combobox>` calls `useTranslation`, so every picker needs the translation
 * provider; `SalesChannelPicker` additionally reads the admin language, which is
 * a context with no fallback — `useAppLanguage` throws rather than defaulting.
 */
function withLanguage(ui: ReactElement): ReactElement {
  const node = ((): ReactNode => ui)();
  return (
    <AppLanguageContext.Provider value={{ language: 'en', setLanguage: (): void => {} }}>
      <>{node}</>
    </AppLanguageContext.Provider>
  );
}

beforeEach(() => {
  getSpy.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SalesChannelPicker', () => {
  it('asks the sales-channels list endpoint itself, with the picker page size', async () => {
    getSpy.mockResolvedValue({
      items: [
        {
          id: 'ch-1',
          code: 'web',
          name: { 'en-US': 'Web store', 'pl-PL': 'Sklep' },
          active: true,
        },
      ],
      page: 1,
      pageSize: 200,
      total: 1,
    });

    const user = userEvent.setup();
    renderWithI18n(withLanguage(<SalesChannelPicker value={null} onChange={vi.fn()} />));

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith('/api/v1/admin/sales-channels?pageSize=200&activeOnly=false');
    });

    await user.click(screen.getByRole('combobox'));
    await waitFor(() => {
      expect(screen.getByText('Web store')).toBeDefined();
    });
  });

  it('narrows to the active channels when asked', async () => {
    getSpy.mockResolvedValue({ items: [], page: 1, pageSize: 200, total: 0 });
    renderWithI18n(withLanguage(<SalesChannelPicker value={null} onChange={vi.fn()} activeOnly />));
    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith('/api/v1/admin/sales-channels?pageSize=200&activeOnly=true');
    });
  });
});

describe('CmsBlockPicker', () => {
  it('asks the CMS blocks endpoint itself', async () => {
    getSpy.mockResolvedValue({
      data: [{ id: 'blk-1', code: 'promo', name: 'Promo banner' }],
      nextCursor: null,
    });

    const user = userEvent.setup();
    renderWithI18n(<CmsBlockPicker value={null} onChange={vi.fn()} />);

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith('/api/v1/admin/cms/blocks');
    });

    await user.click(screen.getByRole('combobox'));
    await waitFor(() => {
      expect(screen.getByText('Promo banner')).toBeDefined();
    });
  });
});

describe('CmsPagePicker', () => {
  it('asks the CMS pages endpoint itself, carrying the typed query', async () => {
    getSpy.mockResolvedValue({
      data: [{ id: 'pg-1', slug: 'about', name: 'About us', status: 'published' }],
      nextCursor: null,
    });

    const user = userEvent.setup();
    renderWithI18n(<CmsPagePicker value={null} onChange={vi.fn()} />);

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'abo');

    await waitFor(() => {
      const last = getSpy.mock.calls.at(-1)?.[0] as string | undefined;
      expect(last).toBe('/api/v1/admin/cms/pages?q=abo&limit=20');
    });

    await waitFor(() => {
      expect(screen.getByText('About us')).toBeDefined();
    });
  });
});

/**
 * `ProductPicker`'s additive props (feature 145, research R-5, contract B12).
 *
 * The quick single-product search beside **Browse products** applies the same
 * `productSelectability` as the table, so a product a host refuses is shown and
 * disabled with its reason rather than hidden. The `catalog:read` gate is
 * **opt-in**: it applies only when the host passes `rules`, so the consumers that
 * pass none (`seo`'s `SeoPage`, `quote_requests`' `RfqDetail`, `catalog`'s
 * `ProductEditor`) keep exactly today's behaviour — the last case here renders
 * the picker with no `AuthProvider` at all, which a gate would throw on.
 */
describe('ProductPicker — rules, alreadyAddedIds, onPickProduct', () => {
  const REPO_ROOT = resolve(process.cwd(), '..');
  const CORE = {
    core: JSON.parse(
      readFileSync(join(REPO_ROOT, 'packages/modules/_i18n/i18n/en.json'), 'utf8'),
    ) as Record<string, string>,
  };

  const ROWS = [
    { id: 'p-group', sku: 'GRP-1', slug: 'grp', name: { 'en-US': 'Grouped set' }, status: 'active', type: 'grouped' },
    { id: 'p-draft', sku: 'DRF-1', slug: 'drf', name: { 'en-US': 'Draft widget' }, status: 'draft', type: 'simple' },
    { id: 'p-added', sku: 'ADD-1', slug: 'add', name: { 'en-US': 'Added widget' }, status: 'active', type: 'simple' },
    { id: 'p-ok', sku: 'OK-1', slug: 'ok', name: { 'en-US': 'Plain widget', 'pl-PL': 'Zwykły widżet' }, status: 'active', type: 'simple' },
  ];

  const ORDER_RULES = {
    initialStatus: 'active' as const,
    blockedTypes: ['grouped', 'bundle'] as const,
    blockedStatuses: ['draft', 'inactive'] as const,
  };

  function withSession(ui: ReactElement, permissions: readonly string[]): ReactElement {
    return <AuthProvider initial={adminSession({ permissions })}>{ui}</AuthProvider>;
  }

  it('renders refused products disabled with their translated reason, and hands over the full summary', async () => {
    getSpy.mockResolvedValue({ data: ROWS });
    const onChange = vi.fn();
    const onPickProduct = vi.fn();
    const user = userEvent.setup();
    renderWithI18n(
      withSession(
        <ProductPicker
          mode="select"
          value={null}
          onChange={onChange}
          includeArchived
          rules={ORDER_RULES}
          alreadyAddedIds={['p-added']}
          onPickProduct={onPickProduct}
        />,
        ['catalog:read'],
      ),
      CORE,
    );

    await user.click(screen.getByRole('combobox'));
    await waitFor(() => expect(screen.getByRole('option', { name: /Plain widget/ })).toBeDefined());

    const group = screen.getByRole('option', { name: /Grouped set/ });
    expect(group.getAttribute('aria-disabled')).toBe('true');
    expect(group.textContent).toContain('Product group — pick its individual products');
    const draft = screen.getByRole('option', { name: /Draft widget/ });
    expect(draft.getAttribute('aria-disabled')).toBe('true');
    expect(draft.textContent).toContain('Not active — cannot be added');
    const added = screen.getByRole('option', { name: /Added widget/ });
    expect(added.getAttribute('aria-disabled')).toBe('true');
    expect(added.textContent).toContain('Already added');
    expect(screen.getByRole('option', { name: /Plain widget/ }).getAttribute('aria-disabled')).toBeNull();

    await user.click(group);
    expect(onPickProduct).not.toHaveBeenCalled();

    await user.click(screen.getByRole('option', { name: /Plain widget/ }));
    expect(onChange).toHaveBeenCalledWith('p-ok');
    expect(onPickProduct).toHaveBeenCalledWith({
      id: 'p-ok',
      sku: 'OK-1',
      slug: 'ok',
      name: { 'en-US': 'Plain widget', 'pl-PL': 'Zwykły widżet' },
      status: 'active',
      type: 'simple',
    });
  });

  it('with rules and without catalog:read it is disabled with the hint', () => {
    renderWithI18n(
      withSession(
        <ProductPicker mode="select" value={null} onChange={vi.fn()} rules={ORDER_RULES} />,
        ['orders:write'],
      ),
      CORE,
    );
    const input = screen.getByRole('combobox') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    const hint = document.getElementById(input.getAttribute('aria-describedby') ?? '');
    expect(hint?.textContent).toBe('You need the catalog read permission to browse products.');
  });

  it('without the new props it behaves as before — no catalog:read gate, no session needed', async () => {
    getSpy.mockResolvedValue({ data: ROWS });
    const user = userEvent.setup();
    // No AuthProvider: an unconditional gate would throw here.
    renderWithI18n(<ProductPicker mode="select" value={null} onChange={vi.fn()} />, CORE);
    const input = screen.getByRole('combobox') as HTMLInputElement;
    expect(input.disabled).toBe(false);
    expect(input.getAttribute('aria-describedby')).toBeNull();

    await user.click(input);
    await waitFor(() => expect(screen.getByRole('option', { name: /Grouped set/ })).toBeDefined());
    // Nothing is disabled, and the raw status suffix is today's.
    for (const option of screen.getAllByRole('option')) {
      expect(option.getAttribute('aria-disabled')).toBeNull();
    }
    expect(screen.getByRole('option', { name: /Draft widget/ }).textContent).toContain('DRF-1 · draft');
    expect(getSpy.mock.calls.at(-1)?.[0]).toBe('/api/v1/admin/catalog/products?page=0&pageSize=20');
  });

  it('without rules a session lacking catalog:read changes nothing either', () => {
    renderWithI18n(
      withSession(<ProductPicker mode="select" value={null} onChange={vi.fn()} />, []),
      CORE,
    );
    expect((screen.getByRole('combobox') as HTMLInputElement).disabled).toBe(false);
  });
});
