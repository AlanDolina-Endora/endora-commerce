import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { setMobileViewport } from '../../setup';
import {
  ADMIN_ID,
  PROJECT_ID,
  ROLES,
  ROLE_MANAGER,
  detail,
  en,
  renderProjects,
} from './projects-fixtures';

/**
 * Creating a Project by hand (`specs/163-projects-and-tasks/`, User Story 1 —
 * tasks T047 and T055; `contracts/admin-surfaces.md` §2, `/projects/new`).
 *
 * Without a Template — which arrives with User Story 3 — `POST /projects`
 * requires its Stages, so the form carries a Stage list (name, colour, planned
 * duration; at least one). Members are chosen with the kit's
 * `AdminUserPicker`, each with the Project Roles of `GET /projects/roles?active=true`.
 * An empty Organization list is an internal Project, and the form says what
 * that means for who sees it.
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
      get: (...args: unknown[]) => getSpy(...args),
      post: (...args: unknown[]) => postSpy(...args),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

/**
 * The kit's `AdminUserPicker` searches through the kit's private `apiClient`
 * module, which no `vi.mock` of the published barrel reaches, so it is stood in
 * for here by a plain select carrying the same props. The subject is what this
 * form does with the person chosen, not the kit's search.
 */
vi.mock('@endora-commerce/admin-kit/components', async () => {
  const actual = await vi.importActual<typeof import('@endora-commerce/admin-kit/components')>(
    '@endora-commerce/admin-kit/components',
  );
  return {
    ...actual,
    AdminUserPicker: (props: { id?: string; ariaLabel?: string; value: string | null; onChange: (id: string | null) => void }) => (
      <select
        id={props.id}
        aria-label={props.ariaLabel}
        value={props.value ?? ''}
        onChange={(event): void => props.onChange(event.target.value || null)}
      >
        <option value="">—</option>
        <option value={ADMIN_ID}>Anna Nowak</option>
      </select>
    ),
  };
});

const { ApiError } = await import('@endora-commerce/admin-kit/lib');
const { ProjectCreate } = await import('../../../../packages/modules/projects/src/admin/pages/ProjectCreate');

beforeEach(() => {
  setMobileViewport(false);
  getSpy.mockReset();
  postSpy.mockReset();
  getSpy.mockImplementation((path: string) => {
    if (path === '/api/v1/admin/projects/roles?active=true') return Promise.resolve({ data: ROLES });
    if (path.startsWith('/api/v1/admin/organizations')) {
      return Promise.resolve({ data: [], pagination: { cursor: null, hasMore: false, limit: 20 } });
    }
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
  postSpy.mockResolvedValue({ data: detail() });
});

function AddressProbe(): ReactElement {
  const location = useLocation();
  return <output data-testid="address">{location.pathname}</output>;
}

async function renderForm(): Promise<void> {
  renderProjects(
    <>
      <ProjectCreate />
      <AddressProbe />
    </>,
    { path: '/projects/new' },
  );
  await screen.findByRole('heading', { name: en('create.title') });
}

const stagesSection = (): HTMLElement => screen.getByRole('group', { name: en('create.stages.section') });

describe('ProjectCreate', () => {
  it('refuses to send a Project without a title or a named Stage, and says why', async () => {
    await renderForm();
    await userEvent.click(screen.getByRole('button', { name: en('create.submit') }));
    expect(screen.getByText(en('create.error.title'))).toBeTruthy();
    expect(screen.getByText(en('create.error.stageName'))).toBeTruthy();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('explains that a Project with no Organization is internal', async () => {
    await renderForm();
    expect(screen.getByText(en('create.internalNote'))).toBeTruthy();
  });

  it('creates the Project with its Stages and Members, then opens it', async () => {
    await renderForm();
    await userEvent.type(screen.getByLabelText(new RegExp(en('field.title'))), 'Warehouse fit-out');
    await userEvent.type(screen.getByLabelText(en('field.valueAmount')), '12 500,5');
    await userEvent.type(screen.getByLabelText(en('field.valueCurrency')), 'pln');

    const stages = stagesSection();
    await userEvent.type(within(stages).getByLabelText(en('stage.name', { position: 1 })), 'Design');
    const firstDuration = within(stages).getByLabelText(en('stage.duration', { position: 1 }));
    await userEvent.clear(firstDuration);
    await userEvent.type(firstDuration, '14');
    await userEvent.click(within(stages).getByRole('button', { name: en('create.stages.add') }));
    await userEvent.type(within(stages).getByLabelText(en('stage.name', { position: 2 })), 'Build');

    await userEvent.click(screen.getByRole('button', { name: en('create.members.add') }));
    const members = screen.getByRole('group', { name: en('create.members.section') });
    await userEvent.selectOptions(within(members).getByLabelText(en('create.members.person', { position: 1 })), ADMIN_ID);
    await userEvent.click(await within(members).findByRole('checkbox', { name: 'Project Manager' }));

    await userEvent.click(screen.getByRole('button', { name: en('create.submit') }));

    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1));
    const [path, body] = postSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('/api/v1/admin/projects');
    expect(body).toMatchObject({
      title: 'Warehouse fit-out',
      organizationIds: [],
      value: { amount: '12500.50', currency: 'PLN' },
      members: [{ adminUserId: ADMIN_ID, roleIds: [ROLE_MANAGER] }],
    });
    const sentStages = body['stages'] as Array<Record<string, unknown>>;
    expect(sentStages.map((entry) => [entry['name'], entry['plannedDurationDays']])).toEqual([
      ['Design', 14],
      ['Build', 0],
    ]);
    for (const entry of sentStages) expect(entry['color']).toMatch(/^#[0-9a-f]{6}$/i);
    // Nothing a later story owns is sent.
    expect(body).not.toHaveProperty('templateId');
    expect(body).not.toHaveProperty('customFieldValues');
    await waitFor(() => expect(screen.getByTestId('address').textContent).toBe(`/projects/${PROJECT_ID}`));
  });

  it('removes and reorders Stages, and keeps at least one', async () => {
    await renderForm();
    const stages = stagesSection();
    expect(within(stages).queryByRole('button', { name: en('stage.remove', { position: 1 }) })).toBeNull();
    await userEvent.type(within(stages).getByLabelText(en('stage.name', { position: 1 })), 'Design');
    await userEvent.click(within(stages).getByRole('button', { name: en('create.stages.add') }));
    await userEvent.type(within(stages).getByLabelText(en('stage.name', { position: 2 })), 'Build');
    await userEvent.click(within(stages).getByRole('button', { name: en('stage.moveUp', { position: 2 }) }));
    expect((within(stages).getByLabelText(en('stage.name', { position: 1 })) as HTMLInputElement).value).toBe('Build');
    await userEvent.click(within(stages).getByRole('button', { name: en('stage.remove', { position: 1 }) }));
    expect((within(stages).getByLabelText(en('stage.name', { position: 1 })) as HTMLInputElement).value).toBe('Design');
    expect(within(stages).queryByLabelText(en('stage.name', { position: 2 }))).toBeNull();
  });

  it('refuses an amount with more than two decimal places instead of rounding it', async () => {
    await renderForm();
    await userEvent.type(screen.getByLabelText(new RegExp(en('field.title'))), 'Fit-out');
    await userEvent.type(within(stagesSection()).getByLabelText(en('stage.name', { position: 1 })), 'Design');
    await userEvent.type(screen.getByLabelText(en('field.valueAmount')), '10.555');
    await userEvent.type(screen.getByLabelText(en('field.valueCurrency')), 'PLN');
    await userEvent.click(screen.getByRole('button', { name: en('create.submit') }));
    expect(screen.getByText(en('create.error.value'))).toBeTruthy();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it("shows the server's sentence when the Project is refused", async () => {
    postSpy.mockRejectedValue(
      new ApiError(422, {
        error: {
          code: 'PROJECT_ORGANIZATION_OUT_OF_SCOPE',
          message: 'One of the organizations is not available to you.',
        },
      }),
    );
    await renderForm();
    await userEvent.type(screen.getByLabelText(new RegExp(en('field.title'))), 'Fit-out');
    await userEvent.type(within(stagesSection()).getByLabelText(en('stage.name', { position: 1 })), 'Design');
    await userEvent.click(screen.getByRole('button', { name: en('create.submit') }));
    expect(await screen.findByText('One of the organizations is not available to you.')).toBeTruthy();
    expect(screen.getByTestId('address').textContent).toBe('/projects/new');
  });
});
