import { describe, expect, it, vi } from 'vitest';

const present = new Set<string>();

vi.mock('@endora-commerce/platform/kernel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@endora-commerce/platform/kernel')>();
  return { ...actual, effectiveState: { isPresent: (id: string) => present.has(id) } };
});

const { ImportExportService } = await import('./import-export-service.js');
type Ports = ConstructorParameters<typeof ImportExportService>[0];

const ALL_OWNERS = ['catalog', 'inventory', 'orders', 'customer_accounts', 'organizations'];

function service(): InstanceType<typeof ImportExportService> {
  // The adapters only touch their ports when exporting or importing, which no
  // test below does.
  return new ImportExportService({} as Ports);
}

function holding(...codes: string[]): (code: string) => Promise<boolean> {
  return async (code) => codes.includes(code);
}

describe('ImportExportService — per-entity permissions', () => {
  it('gates every entity on the code its owning module enforces over the same rows', () => {
    present.clear();
    for (const owner of ALL_OWNERS) present.add(owner);
    const s = service();
    expect(
      Object.fromEntries(
        ['products', 'categories', 'stock', 'customers', 'orders'].map((entity) => [
          entity,
          { export: s.exportPermissionFor(entity), import: s.importPermissionFor(entity) },
        ]),
      ),
    ).toEqual({
      products: { export: 'catalog:read', import: 'catalog:write' },
      categories: { export: 'catalog:read', import: 'catalog:write' },
      stock: { export: 'inventory:read', import: 'inventory:write' },
      // Export-only entities answer their read code for an import too, so a
      // caller who may not read the rows is refused before the 405.
      customers: { export: 'customers:read', import: 'customers:read' },
      orders: { export: 'orders:read', import: 'orders:read' },
    });
  });

  it('names no code for an entity this deployment does not offer', () => {
    present.clear();
    for (const owner of ALL_OWNERS) present.add(owner);
    present.delete('orders');
    const s = service();
    expect(s.exportPermissionFor('orders')).toBeUndefined();
    expect(s.importPermissionFor('orders')).toBeUndefined();
    expect(s.exportPermissionFor('nonexistent')).toBeUndefined();
  });

  it('offers a catalogue-only caller the catalogue entities and nothing else', async () => {
    present.clear();
    for (const owner of ALL_OWNERS) present.add(owner);
    const entities = await service().listEntities(holding('catalog:read', 'catalog:write'));
    expect(entities.map((e) => [e.name, e.canExport, e.canImport])).toEqual([
      ['products', true, true],
      ['categories', true, true],
    ]);
  });

  it('marks a supported import the caller may not run as not permitted, keeping its header', async () => {
    present.clear();
    for (const owner of ALL_OWNERS) present.add(owner);
    const entities = await service().listEntities(holding('inventory:read'));
    expect(entities).toEqual([
      {
        name: 'stock',
        exportHeader: ['product_sku', 'variant_id', 'on_hand', 'reserved'],
        importHeader: ['product_sku', 'variant_id', 'on_hand'],
        canExport: true,
        canImport: false,
      },
    ]);
  });

  it('offers an export-only entity with no import, whatever the caller holds', async () => {
    present.clear();
    for (const owner of ALL_OWNERS) present.add(owner);
    const entities = await service().listEntities(holding('customers:read', 'orders:read'));
    expect(entities.map((e) => [e.name, e.canExport, e.canImport, e.importHeader])).toEqual([
      ['customers', true, false, null],
      ['orders', true, false, null],
    ]);
  });

  it('lists nothing for a caller holding none of the codes', async () => {
    present.clear();
    for (const owner of ALL_OWNERS) present.add(owner);
    expect(await service().listEntities(holding('settings:read'))).toEqual([]);
  });

  it('collects the union of every adapter code, present or not', () => {
    present.clear();
    expect(service().permissionCodes()).toEqual([
      'catalog:read',
      'catalog:write',
      'customers:read',
      'inventory:read',
      'inventory:write',
      'orders:read',
    ]);
  });
});
