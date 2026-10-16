import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { passthroughBundle } from '../../helpers/render-with-i18n';
import {
  adminSession,
  everyDeclaredModule,
  modulePresence,
  renderWithSession,
} from '../../helpers/render-with-session';

/**
 * `specs/150-admin-global-search/` T061 — a global-search Category result opens
 * `/catalog/categories?focus=<id>` (research R-15): the tree shows the focused
 * category's row — its ancestors' rows included, the tree having no collapsed
 * state — marked `aria-current="true"`, scrolled into view and focused once.
 * An id the tree does not hold changes nothing.
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

const { CategoriesTree } = await import('../../../../packages/modules/catalog/src/admin/pages/CategoriesTree');

const ROOT = '33333333-3333-4333-8333-333333333301';
const MID = '33333333-3333-4333-8333-333333333302';
const LEAF = '33333333-3333-4333-8333-333333333303';

const BUNDLE = passthroughBundle('catalog', ['categories.page.title', 'categories.action.edit']);

const scrollSpy = vi.fn();

function renderTree(url: string): void {
  renderWithSession(
    <StrictMode>
      <MemoryRouter initialEntries={[url]}>
        <CategoriesTree />
      </MemoryRouter>
    </StrictMode>,
    {
      session: adminSession({ permissions: ['*'] }),
      presence: modulePresence({ present: everyDeclaredModule() }),
      contributions: [],
      bundle: BUNDLE,
    },
  );
}

describe('CategoriesTree — focus from global search (spec 150)', () => {
  beforeEach(() => {
    scrollSpy.mockReset();
    Element.prototype.scrollIntoView = scrollSpy;
    getSpy.mockReset();
    getSpy.mockResolvedValue({
      data: [
        { id: ROOT, parentCategoryId: null, name: { 'en-US': 'Furniture' }, slug: 'furniture', sortOrder: 0, isActive: true },
        { id: MID, parentCategoryId: ROOT, name: { 'en-US': 'Seating' }, slug: 'seating', sortOrder: 0, isActive: true },
        { id: LEAF, parentCategoryId: MID, name: { 'en-US': 'Chairs' }, slug: 'chairs', sortOrder: 0, isActive: true },
      ],
    });
  });

  it('marks, scrolls to and focuses the nested category once, its ancestors shown', async () => {
    renderTree(`/catalog/categories?focus=${LEAF}`);
    const row = await waitFor(() => {
      const found = document.querySelector('tr[aria-current="true"]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(row.textContent).toContain('Chairs');
    expect(screen.getByText('Furniture')).toBeTruthy();
    expect(screen.getByText('Seating')).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(row));
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('tr[aria-current]')).toHaveLength(1);
  });

  it('changes nothing for an id the tree does not hold', async () => {
    renderTree('/catalog/categories?focus=44444444-4444-4444-8444-444444444444');
    await waitFor(() => expect(screen.getByText('Chairs')).toBeTruthy());
    expect(document.querySelector('tr[aria-current]')).toBeNull();
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it('changes nothing without a focus parameter', async () => {
    renderTree('/catalog/categories');
    await waitFor(() => expect(screen.getByText('Chairs')).toBeTruthy());
    expect(document.querySelector('tr[aria-current]')).toBeNull();
    expect(scrollSpy).not.toHaveBeenCalled();
  });
});
