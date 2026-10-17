import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { AdminSearchCapability, AdminSearchGroup, AdminSearchResponse } from '@endora-commerce/contracts';
import { renderWithI18n, passthroughBundle } from '../helpers/render-with-i18n';
import {
  adminSession,
  everyDeclaredModule,
  everyDeclaredPermission,
  modulePresence,
  withSession,
} from '../helpers/render-with-session';
import { expectNoAxeViolations } from '../helpers/axe';

/**
 * `specs/150-admin-global-search/` T055 — records in the command palette
 * (contracts/admin-ui.md §1): the minimum length, the debounce, the abort and
 * the stale-response guard, groups after *Actions* in the server's order with
 * the server's labels, one Arrow/Enter loop across screens, actions and
 * records, the status badge, "more", an unavailable type, "Searching…", the
 * see-all row, the per-open capability probe, the live region and axe.
 */

let capability: AdminSearchCapability | Error;
const capabilitySpy = vi.fn(async (): Promise<AdminSearchCapability> => {
  if (capability instanceof Error) throw capability;
  return capability;
});
type SearchImpl = (query: { q: string; limit?: number }, signal?: AbortSignal) => Promise<AdminSearchResponse>;
let searchImpl: SearchImpl;
const searchSpy = vi.fn((query: { q: string; limit?: number }, signal?: AbortSignal) => searchImpl(query, signal));

vi.mock('../../../packages/admin-shell/src/lib/global-search/api', () => ({
  getAdminSearchCapability: (...a: unknown[]) => capabilitySpy(...(a as [])),
  searchAdminRecords: (q: { q: string; limit?: number }, signal?: AbortSignal) => searchSpy(q, signal),
}));

vi.mock('../../../packages/admin-shell/src/lib/admin-actions/useAdminActions', () => ({
  useAdminActions: () => ({
    actions: [
      {
        moduleId: 'orders',
        actionId: 'open-orders',
        label: 'Open orders',
        description: 'View orders',
        icon: 'Receipt',
        targetRoute: '/orders',
        keywords: [],
        weight: 1,
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

vi.mock('../../../packages/admin-shell/src/components/notifications', () => ({
  NotificationBell: () => <span data-testid="notifications" />,
}));

vi.mock('../../../packages/admin-shell/src/components/LanguagePicker.js', () => ({
  LanguagePicker: () => <span data-testid="language-picker" />,
}));

vi.mock('../../../packages/admin-shell/src/lib/prompt-actions/api', () => ({
  getPromptCapability: async () => ({ status: 'disabled', bulkLimit: 500 }),
  listUnseenPromptRequests: async () => [],
  submitPrompt: vi.fn(),
  clarifyPrompt: vi.fn(),
  confirmPrompt: vi.fn(),
  cancelPrompt: vi.fn(),
  getPromptRequest: vi.fn(),
  markPromptRequestSeen: vi.fn(),
}));

const { AppShell } = await import('../../../packages/admin-shell/src/components/AppShell');

const bundle = {
  core: {
    ...passthroughBundle('core', [
      'appShell.brand.text',
      'appShell.search.openPalette',
      'appShell.search.commandPalettePlaceholder',
      'appShell.search.noMatches',
      'appShell.palette.group.navigate',
      'appShell.palette.group.actions',
      'appShell.profileMenu.signOut',
    ]).core,
    'appShell.palette.records.searching': 'Searching records…',
    'appShell.palette.records.more': 'More results',
    'appShell.palette.records.unavailable': '{label} could not be searched',
    'appShell.palette.records.seeAll': 'See all results for “{query}”',
    'appShell.palette.records.announce': '{count} records found',
  },
};

const ORDERS: AdminSearchGroup = {
  entityType: 'orders.order',
  label: 'Orders',
  icon: 'Receipt',
  status: 'ok',
  hits: [
    { id: 'o1', title: 'ZAM/2026/0042', subtitle: 'ACME · 2026-10-01', status: { code: 'new', label: 'New' }, targetRoute: '/orders/o1' },
    { id: 'o2', title: 'ZAM/2026/0043', subtitle: null, status: null, targetRoute: '/orders/o2' },
  ],
  hasMore: true,
};
const CRM_TIMED_OUT: AdminSearchGroup = {
  entityType: 'crm.opportunity',
  label: 'Sales opportunities',
  icon: 'CircleDollarSign',
  status: 'timed_out',
  hits: [],
  hasMore: false,
};
const CUSTOMERS: AdminSearchGroup = {
  entityType: 'customers.customer',
  label: 'Customers',
  icon: 'Users',
  status: 'ok',
  hits: [{ id: 'c1', title: 'Jan Kowalski', subtitle: 'jan@acme.example', status: null, targetRoute: '/customers/c1' }],
  hasMore: false,
};

function response(q: string, groups: AdminSearchGroup[]): AdminSearchResponse {
  return {
    data: { query: q, groups },
    meta: { belowMinimumLength: false, minimumQueryLength: 3, limit: 5, tookMs: 3 },
  };
}

let locationSeen = '/';
function LocationProbe(): null {
  const location = useLocation();
  locationSeen = `${location.pathname}${location.search}`;
  return null;
}

function renderShell(): void {
  renderWithI18n(
    <StrictMode>
      {withSession(
        <MemoryRouter initialEntries={['/']}>
          <LocationProbe />
          <Routes>
            <Route element={<AppShell />}>
              <Route path="*" element={<div>content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>,
        { session: adminSession({ permissions: everyDeclaredPermission() }), presence: modulePresence({ present: everyDeclaredModule() }) },
      )}
    </StrictMode>,
    bundle,
  );
}

async function openPalette(): Promise<void> {
  await userEvent.setup().keyboard('{Meta>}k{/Meta}');
  await waitFor(() => expect(document.querySelector('.b2b-palette')).not.toBeNull());
}

function typeQuery(value: string): void {
  const input = document.querySelector('.b2b-palette__input input') as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
}

/** The rows the cursor walks — notes (searching, unavailable) are not rows. */
function selectableLabels(): string[] {
  return [...document.querySelectorAll('.b2b-palette__item:not([data-palette-note])')].map(
    (el) => el.querySelector(':scope > div > div:first-child')?.textContent ?? '',
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('AppShell palette — records (spec 150)', () => {
  beforeEach(() => {
    capability = {
      minimumQueryLength: 3,
      resultsPerEntity: 5,
      entityTypes: [
        { entityType: 'orders.order', label: 'Orders', icon: 'Receipt' },
        { entityType: 'customers.customer', label: 'Customers', icon: 'Users' },
      ],
    };
    searchImpl = async (query) => response(query.q, [ORDERS, CRM_TIMED_OUT, CUSTOMERS]);
    capabilitySpy.mockClear();
    searchSpy.mockClear();
    locationSeen = '/';
    document.body.innerHTML = '';
  });

  it('requests nothing below the minimum length', async () => {
    renderShell();
    await openPalette();
    await waitFor(() => expect(capabilitySpy).toHaveBeenCalled());
    typeQuery('ac');
    await sleep(400);
    expect(searchSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(/See all results/)).toBeNull();
  });

  it('sends one request per pause, with the per-type limit', async () => {
    renderShell();
    await openPalette();
    await waitFor(() => expect(capabilitySpy).toHaveBeenCalled());
    typeQuery('acm');
    typeQuery('acme');
    await waitFor(() => expect(searchSpy).toHaveBeenCalledTimes(1));
    expect(searchSpy.mock.calls[0]?.[0]).toMatchObject({ q: 'acme', limit: 5 });
  });

  it('aborts a superseded request and never shows its late answer (FR-007)', async () => {
    let releaseFirst: (() => void) | undefined;
    searchImpl = (query) =>
      query.q === 'acm'
        ? new Promise((resolve) => {
            releaseFirst = () => resolve(response('acm', [CUSTOMERS]));
          })
        : Promise.resolve(response(query.q, [ORDERS]));
    renderShell();
    await openPalette();
    await waitFor(() => expect(capabilitySpy).toHaveBeenCalled());
    typeQuery('acm');
    await waitFor(() => expect(searchSpy).toHaveBeenCalledTimes(1));
    typeQuery('acme');
    await waitFor(() => expect(searchSpy).toHaveBeenCalledTimes(2));
    expect((searchSpy.mock.calls[0]?.[1] as AbortSignal).aborted).toBe(true);
    await waitFor(() => expect(screen.getByText('ZAM/2026/0042')).toBeTruthy());
    releaseFirst?.();
    await sleep(50);
    expect(screen.queryByText('Jan Kowalski')).toBeNull();
    expect(screen.getByText('ZAM/2026/0042')).toBeTruthy();
  });

  it('renders the record groups after Actions, in server order, with server labels, badge, "more" and an unavailable type', async () => {
    renderShell();
    await openPalette();
    await waitFor(() => expect(capabilitySpy).toHaveBeenCalled());
    typeQuery('acme');
    await waitFor(() => expect(screen.getByText('ZAM/2026/0042')).toBeTruthy());
    const headers = [...document.querySelectorAll('.b2b-palette__group')].map((el) => el.textContent ?? '');
    expect(headers.indexOf('appShell.palette.group.actions')).toBeLessThan(headers.findIndex((h) => h.startsWith('Orders')));
    expect(headers.filter((h) => !h.startsWith('appShell'))).toEqual([
      'Orders· More results',
      'Sales opportunities',
      'Customers',
    ]);
    expect(screen.getByText('New')).toBeTruthy();
    expect(screen.getByText('Sales opportunities could not be searched')).toBeTruthy();
    expect(screen.getByText('See all results for “acme”')).toBeTruthy();
  });

  it('walks screens, actions and records as one list and opens the record on Enter (FR-006)', async () => {
    renderShell();
    await openPalette();
    await waitFor(() => expect(capabilitySpy).toHaveBeenCalled());
    typeQuery('acme');
    await waitFor(() => expect(screen.getByText('ZAM/2026/0042')).toBeTruthy());
    const labels = selectableLabels();
    // Actions first, then the records (the unavailable note is not a row), then see-all.
    expect(labels).toEqual(['Open orders', 'ZAM/2026/0042', 'ZAM/2026/0043', 'Jan Kowalski', 'See all results for “acme”']);
    const user = userEvent.setup();
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(document.querySelector('.b2b-palette__item.is-cur')?.textContent).toContain('Jan Kowalski');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(locationSeen).toBe('/customers/c1'));
    expect(document.querySelector('.b2b-palette')).toBeNull();
  });

  it('opens the results page for the same text from the see-all row (FR-029)', async () => {
    renderShell();
    await openPalette();
    await waitFor(() => expect(capabilitySpy).toHaveBeenCalled());
    typeQuery('acme & co');
    await waitFor(() => expect(screen.getByText('See all results for “acme & co”')).toBeTruthy());
    fireEvent.click(screen.getByText('See all results for “acme & co”'));
    await waitFor(() => expect(locationSeen).toBe('/global-search?q=acme%20%26%20co'));
  });

  it('shows "Searching…" while a search runs, without delaying screens and actions', async () => {
    let release: (() => void) | undefined;
    searchImpl = (query) =>
      new Promise((resolve) => {
        release = () => resolve(response(query.q, [ORDERS]));
      });
    renderShell();
    await openPalette();
    await waitFor(() => expect(capabilitySpy).toHaveBeenCalled());
    typeQuery('acme');
    await waitFor(() => expect(screen.getByTestId('palette-records-searching')).toBeTruthy());
    expect(screen.getByText('Open orders')).toBeTruthy();
    await waitFor(() => expect(release).toBeDefined());
    release?.();
    await waitFor(() => expect(screen.queryByTestId('palette-records-searching')).toBeNull());
    expect(screen.getByText('ZAM/2026/0042')).toBeTruthy();
  });

  it('hides records for this open when the probe fails or offers no type, and probes again on the next open', async () => {
    capability = new Error('503 MODULE_DISABLED');
    renderShell();
    await openPalette();
    await waitFor(() => expect(capabilitySpy).toHaveBeenCalledTimes(1));
    typeQuery('acme');
    await sleep(400);
    expect(searchSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(/See all results/)).toBeNull();

    await userEvent.setup().keyboard('{Escape}');
    await waitFor(() => expect(document.querySelector('.b2b-palette')).toBeNull());
    capability = { minimumQueryLength: 3, resultsPerEntity: 5, entityTypes: [] };
    await openPalette();
    await waitFor(() => expect(capabilitySpy.mock.calls.length).toBeGreaterThanOrEqual(2));
    typeQuery('acme');
    await sleep(400);
    expect(searchSpy).not.toHaveBeenCalled();

    await userEvent.setup().keyboard('{Escape}');
    await waitFor(() => expect(document.querySelector('.b2b-palette')).toBeNull());
    capability = { minimumQueryLength: 3, resultsPerEntity: 5, entityTypes: [{ entityType: 'orders.order', label: 'Orders', icon: 'Receipt' }] };
    await openPalette();
    typeQuery('acme');
    await waitFor(() => expect(screen.getByText('ZAM/2026/0042')).toBeTruthy());
  });

  it('announces the count in a live region, and has no axe violations with results shown (FR-033)', async () => {
    renderShell();
    await openPalette();
    const status = screen.getByTestId('palette-records-status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('');
    await waitFor(() => expect(capabilitySpy).toHaveBeenCalled());
    typeQuery('acme');
    await waitFor(() => expect(status.textContent).toBe('3 records found'));
    // Focus never leaves the input.
    expect(document.activeElement).toBe(document.querySelector('.b2b-palette__input input'));
    await expectNoAxeViolations(document.querySelector('.b2b-palette')!);
  });
});
