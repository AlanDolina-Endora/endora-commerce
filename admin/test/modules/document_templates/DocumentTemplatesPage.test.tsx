import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { adminSession, everyDeclaredModule, modulePresence, renderWithSession } from '../../helpers/render-with-session';
import { expectNoAxeViolations } from '../../helpers/axe';
import { BUNDLE, COMPARISON, INVOICE, summary } from './fixtures';

/**
 * `specs/152-compare-pdf-template/` T037 — *Document templates*
 * (`contracts/admin-ui.md` §2): one card per available type with its built-in
 * layout and its templates by scope, the default marked; the write controls
 * absent without the write code; set-default and the confirmed delete of a
 * default; axe.
 */

const api = {
  listDocumentTypes: vi.fn(),
  listTemplates: vi.fn(),
  listSalesChannels: vi.fn(),
  setDefaultTemplate: vi.fn(),
  clearDefaultTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  createTemplate: vi.fn(),
  getDocumentType: vi.fn(),
  previewDocument: vi.fn(),
};
vi.mock('../../../../packages/modules/document_templates/src/admin/api', () => api);

const { DocumentTemplatesPage } = await import(
  '../../../../packages/modules/document_templates/src/admin/pages/DocumentTemplatesPage'
);

function renderPage(permissions: string[] = ['*'], path = '/document-templates'): HTMLElement {
  return renderWithSession(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <DocumentTemplatesPage />
      </MemoryRouter>
    </StrictMode>,
    {
      session: adminSession({ permissions }),
      presence: modulePresence({ present: everyDeclaredModule() }),
      contributions: [],
      bundle: BUNDLE,
    },
  ).container;
}

const card = (code: string): HTMLElement => screen.getByTestId(`document-type-${code}`);

describe('DocumentTemplatesPage (spec 152)', () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    api.listDocumentTypes.mockResolvedValue([COMPARISON, INVOICE]);
    api.listSalesChannels.mockResolvedValue([{ id: '00000000-0000-4000-8000-0000000000c1', name: 'Channel B' }]);
    api.listTemplates.mockImplementation(async (type: string) =>
      type === 'comparisons.comparison'
        ? [
            summary(),
            summary({ id: '00000000-0000-4000-8000-0000000000d2', name: 'Brand B', isDefault: true, salesChannelId: '00000000-0000-4000-8000-0000000000c1', salesChannelName: 'Channel B' }),
            summary({ id: '00000000-0000-4000-8000-0000000000d3', name: 'Draft', isDefault: false }),
          ]
        : [],
    );
  });

  it('shows one card per available type, its built-in layout and its templates by scope (FR-001, FR-002)', async () => {
    renderPage();
    await waitFor(() => expect(card('comparisons.comparison')).toBeTruthy());
    const comparison = within(card('comparisons.comparison'));
    expect(comparison.getByText('documentTypes.comparison.label')).toBeTruthy();
    expect(comparison.getByTestId('built-in-row')).toBeTruthy();
    expect(comparison.getByText('page.allChannels')).toBeTruthy();
    expect(comparison.getByText('Channel B')).toBeTruthy();
    expect(comparison.getAllByText('page.default')).toHaveLength(2);
    expect(within(card('invoices.invoice')).getByText('page.noTemplates')).toBeTruthy();
  });

  it('sets the default with the loaded version', async () => {
    api.setDefaultTemplate.mockResolvedValue(summary());
    renderPage();
    await waitFor(() => expect(screen.getByTestId('template-row-00000000-0000-4000-8000-0000000000d3')).toBeTruthy());
    fireEvent.click(within(screen.getByTestId('template-row-00000000-0000-4000-8000-0000000000d3')).getByRole('button', { name: 'page.setDefault' }));
    await waitFor(() => expect(api.setDefaultTemplate).toHaveBeenCalledWith('00000000-0000-4000-8000-0000000000d3', 3));
  });

  it('deleting a default asks first, says what applies instead, and confirms (FR-007)', async () => {
    api.deleteTemplate.mockResolvedValue(undefined);
    renderPage();
    await waitFor(() => expect(screen.getByTestId('template-row-00000000-0000-4000-8000-0000000000d1')).toBeTruthy());
    fireEvent.click(within(screen.getByTestId('template-row-00000000-0000-4000-8000-0000000000d1')).getByRole('button', { name: 'page.delete' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('dialog.deleteDefaultGlobal')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'page.delete' }));
    await waitFor(() => expect(api.deleteTemplate).toHaveBeenCalledWith('00000000-0000-4000-8000-0000000000d1', 3, true));
  });

  it('offers no mutating control without document_templates:write (FR-060)', async () => {
    renderPage(['document_templates:read']);
    await waitFor(() => expect(card('comparisons.comparison')).toBeTruthy());
    for (const name of ['page.newTemplate', 'page.setDefault', 'page.clearDefault', 'page.delete', 'page.duplicate', 'page.createFromThis']) {
      expect(screen.queryAllByRole('button', { name })).toHaveLength(0);
    }
    expect(screen.getAllByRole('button', { name: 'editor.preview' }).length).toBeGreaterThan(0);
  });

  it('says what to do when no document type is available', async () => {
    api.listDocumentTypes.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(screen.getByText('page.empty')).toBeTruthy());
  });

  it('marks the type named in ?type= and has no axe violations', async () => {
    const container = renderPage(['*'], '/document-templates?type=invoices.invoice');
    await waitFor(() => expect(card('invoices.invoice').className).toContain('ring-2'));
    await expectNoAxeViolations(container);
  });
});
