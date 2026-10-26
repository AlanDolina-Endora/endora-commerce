import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setMobileViewport } from '../../setup';
import { ORGANIZATION_ID, PROJECT_ID, en, renderProjects, summary } from './projects-fixtures';

/**
 * The Projects list (`specs/163-projects-and-tasks/`, User Story 1 — tasks
 * T047 and T055; `contracts/admin-surfaces.md` §2).
 *
 * The subject is that **the controls drive the query** — state, Organization,
 * "my projects", search and the two sorts the backend serves since T055
 * (`value`, `deadline`) — and that a row shows the columns of the contract:
 * number, title, Organizations, the current Stage with its deadline (overdue
 * marked in words, not colour alone), value and Project Managers.
 */

const getSpy = vi.fn();

vi.mock('@endora-commerce/admin-kit/lib', async () => {
  const actual = await vi.importActual<typeof import('@endora-commerce/admin-kit/lib')>(
    '@endora-commerce/admin-kit/lib',
  );
  return {
    ...actual,
    usePageSizePreference: () => ({ pageSize: 20 as const, setPageSize: vi.fn() }),
    apiClient: {
      get: (...args: unknown[]) => getSpy(...args),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

const { ProjectsList } = await import('../../../../packages/modules/projects/src/admin/pages/ProjectsList');

const LIST_PATH = '/api/v1/admin/projects';
const SECOND_ID = '00000000-0000-4000-8000-0000000000f2';

let page: { items: unknown[]; nextCursor: string | null; total: number };

beforeEach(() => {
  setMobileViewport(false);
  getSpy.mockReset();
  page = {
    items: [
      summary(),
      summary({
        id: SECOND_ID,
        number: 'PRJ-000002',
        title: 'Office move',
        organizations: [],
        currentStage: { id: '00000000-0000-4000-8000-000000000d09', name: 'Packing', color: '#f59e0b', deadlineOn: '2026-10-01', overdue: true },
        value: null,
        projectManagers: [],
      }),
    ],
    nextCursor: null,
    total: 2,
  };
  getSpy.mockImplementation((path: string) => {
    if (path === LIST_PATH || path.startsWith(`${LIST_PATH}?`)) return Promise.resolve(page);
    if (path.startsWith('/api/v1/admin/organizations')) {
      return Promise.resolve({
        data: [{ id: ORGANIZATION_ID, name: 'Acme', status: 'active' }],
        pagination: { cursor: null, hasMore: false, limit: 20 },
      });
    }
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
});

/** Every list request made so far, as parsed query strings. */
function listQueries(): URLSearchParams[] {
  return getSpy.mock.calls
    .map(([path]) => path as string)
    .filter((path) => path === LIST_PATH || path.startsWith(`${LIST_PATH}?`))
    .map((path) => new URLSearchParams(path.split('?')[1] ?? ''));
}

const lastQuery = (): URLSearchParams => listQueries().at(-1) ?? new URLSearchParams();

async function renderList(permissions?: readonly string[]): Promise<void> {
  renderProjects(<ProjectsList />, { path: '/projects', ...(permissions ? { permissions } : {}) });
  await screen.findByText('Warehouse fit-out');
}

describe('ProjectsList', () => {
  it('shows each Project with its Organizations, current Stage and deadline, value and Project Managers', async () => {
    await renderList();
    const link = screen.getByRole('link', { name: 'PRJ-000001' });
    expect(link.getAttribute('href')).toBe(`/projects/${PROJECT_ID}`);
    const first = link.closest('tr') as HTMLElement;
    expect(within(first).getByText('Acme')).toBeTruthy();
    expect(within(first).getByText('Design')).toBeTruthy();
    expect(within(first).getByText('Anna Nowak')).toBeTruthy();
    expect(within(first).getByText(/12[\s ,.]?500/)).toBeTruthy();
    expect(within(first).queryByText(en('list.overdue'))).toBeNull();

    // No Organization is an internal Project; an overdue deadline says so in words.
    const second = screen.getByRole('link', { name: 'PRJ-000002' }).closest('tr') as HTMLElement;
    expect(within(second).getByText(en('list.internal'))).toBeTruthy();
    expect(within(second).getByText(en('list.overdue'))).toBeTruthy();
  });

  it('asks for the first page newest first, and nothing it was not asked to filter by', async () => {
    await renderList();
    const query = lastQuery();
    expect(query.get('sort')).toBe('createdAt');
    expect(query.get('order')).toBe('desc');
    expect(query.has('state')).toBe(false);
    expect(query.has('memberId')).toBe(false);
    expect(query.has('organizationId')).toBe(false);
  });

  it('filters by state, by "my projects" and by Organization', async () => {
    await renderList();
    await userEvent.selectOptions(screen.getByLabelText(en('list.filter.state')), 'open');
    await waitFor(() => expect(lastQuery().getAll('state')).toEqual(['open']));

    await userEvent.click(screen.getByLabelText(en('list.filter.mine')));
    await waitFor(() => expect(lastQuery().get('memberId')).toBe('me'));

    await userEvent.click(screen.getByLabelText(en('list.filter.organization')));
    await userEvent.click(await screen.findByRole('option', { name: /Acme/ }));
    await waitFor(() => expect(lastQuery().get('organizationId')).toBe(ORGANIZATION_ID));
  });

  it('searches by number or title once typing pauses', async () => {
    await renderList();
    await userEvent.type(screen.getByLabelText(en('list.search')), 'PRJ-7');
    await waitFor(() => expect(lastQuery().get('q')).toBe('PRJ-7'));
  });

  it('sorts by value and by deadline', async () => {
    await renderList();
    const sort = screen.getByLabelText(en('list.sort'));
    await userEvent.selectOptions(sort, 'value:desc');
    await waitFor(() => {
      expect(lastQuery().get('sort')).toBe('value');
      expect(lastQuery().get('order')).toBe('desc');
    });
    await userEvent.selectOptions(sort, 'deadline:asc');
    await waitFor(() => {
      expect(lastQuery().get('sort')).toBe('deadline');
      expect(lastQuery().get('order')).toBe('asc');
    });
  });

  it('pages on with the cursor the server answered', async () => {
    page = { ...page, nextCursor: 'cursor-2', total: 60 };
    await renderList();
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(lastQuery().get('cursor')).toBe('cursor-2'));
  });

  it('offers "New project" only to an operator who may create one', async () => {
    await renderList();
    expect(screen.getByRole('link', { name: en('list.new') }).getAttribute('href')).toBe('/projects/new');
  });

  it('offers no create action to a reader', async () => {
    await renderList(['projects:read', 'organizations:read']);
    expect(screen.queryByRole('link', { name: en('list.new') })).toBeNull();
  });

  it('says what an empty list means', async () => {
    page = { items: [], nextCursor: null, total: 0 };
    renderProjects(<ProjectsList />, { path: '/projects' });
    expect(await screen.findByText(en('list.empty.title'))).toBeTruthy();
  });

  it('shows the error with a retry when the list cannot be read', async () => {
    getSpy.mockImplementation(() => Promise.reject(new Error('offline')));
    renderProjects(<ProjectsList />, { path: '/projects' });
    expect(await screen.findByText(en('list.error'))).toBeTruthy();
  });
});
