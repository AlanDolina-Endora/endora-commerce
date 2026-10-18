import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { passthroughBundle, renderWithI18n } from '../helpers/render-with-i18n';

/**
 * The import/export screen renders only the controls the operator's role may
 * use. The server lists an entity when its export or its import is permitted
 * and says which through `canExport` / `canImport`; a supported import the role
 * may not run is hidden, which is a different thing from an import that does
 * not exist and keeps its own "not supported" note.
 */

const entities = [
  {
    name: 'products',
    exportHeader: ['id'],
    importHeader: ['sku'],
    canExport: true,
    canImport: false,
  },
  {
    name: 'stock',
    exportHeader: ['product_sku'],
    importHeader: ['product_sku'],
    canExport: false,
    canImport: true,
  },
  {
    name: 'orders',
    exportHeader: ['id'],
    importHeader: null,
    canExport: true,
    canImport: false,
  },
];

vi.mock('@endora-commerce/admin-kit/lib', async () => {
  const actual = await vi.importActual<typeof import('@endora-commerce/admin-kit/lib')>(
    '@endora-commerce/admin-kit/lib',
  );
  return {
    ...actual,
    apiClient: { ...actual.apiClient, get: vi.fn(async () => ({ data: { entities } })) },
  };
});

const { default: ImportExportPage } = await import(
  '../../../packages/modules/import_export/src/admin/pages/ImportExportPage'
);

const bundle = passthroughBundle('import_export', [
  'page.title',
  'page.description',
  'loading',
  'empty',
  'entity.products',
  'entity.stock',
  'entity.orders',
  'exportCsv',
  'importCsv',
  'importNotSupported',
  'requiredHeader',
]);

async function card(name: string): Promise<HTMLElement> {
  const title = await screen.findByText(`entity.${name}`);
  const root = title.closest('.space-y-4 > *');
  if (!(root instanceof HTMLElement)) throw new Error(`no card for ${name}`);
  return root;
}

describe('ImportExportPage — controls follow the role', () => {
  it('shows the export and hides the import the role may not run', async () => {
    renderWithI18n(<ImportExportPage />, bundle);
    const products = within(await card('products'));
    expect(products.getByText('exportCsv')).toBeTruthy();
    expect(products.queryByText('importCsv')).toBeNull();
    expect(products.queryByText('requiredHeader')).toBeNull();
    expect(products.queryByText('importNotSupported')).toBeNull();
  });

  it('shows the import and hides the export the role may not run', async () => {
    renderWithI18n(<ImportExportPage />, bundle);
    const stock = within(await card('stock'));
    expect(stock.queryByText('exportCsv')).toBeNull();
    expect(stock.getByText('importCsv')).toBeTruthy();
  });

  it('keeps the note for an entity whose import does not exist', async () => {
    renderWithI18n(<ImportExportPage />, bundle);
    const orders = within(await card('orders'));
    expect(orders.getByText('exportCsv')).toBeTruthy();
    expect(orders.getByText('importNotSupported')).toBeTruthy();
  });
});
