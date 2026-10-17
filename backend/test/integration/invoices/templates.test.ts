import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { ADMIN_COOKIE, CUSTOMER_COOKIE, seedInvoiceableOrder, setSellerSettings } from './helpers.js';
import { ensureSalesChannelId } from '../../helpers/sales-channel-fixtures.js';
import { withSystemScope } from '../../../src/tenancy/escape-hatch.js';

/**
 * `specs/152-compare-pdf-template/` T059, T059a — invoice templates live in
 * *Document templates* and every invoice PDF is produced through them.
 *
 * - the Invoice type and its palette are served by the facility's API, and the
 *   withdrawn `/api/v1/admin/invoice-templates*` routes answer 404 (N4);
 * - an invoice is printed with the default of its channel, else the default for
 *   all channels, else the built-in layout (FR-084) — on the admin download, the
 *   regenerate and the customer download alike;
 * - the e-mail attachment is produced from the same template as the download
 *   (owner answer N1, FR-093).
 *
 * What a PDF carries is read off the engine's document definition (a spy on
 * `documentRenderer.buildDefinition`): PDF bytes are compressed.
 */

const ADMIN = { b2b_session: 'stub-admin-session' };
const API = '/api/v1/admin/document-templates';

interface Built {
  definition: { content: unknown[] };
  source: string;
  templateId: string | null;
}

let CH: string;
let OTHER: string;

describe('invoices — templates through document templates (spec 152)', () => {
  let h: BackendServerHandle;
  let renderer: { buildDefinition: (input: unknown) => Promise<Built> };
  const created: string[] = [];

  beforeAll(async () => {
    h = await setupBackendServer();
    CH = await ensureSalesChannelId(h.em(), 'inv-doc-tpl');
    OTHER = await ensureSalesChannelId(h.em(), 'inv-doc-tpl-other');
    await setSellerSettings(h);
    const audit = { actorAdminUserId: '00000000-0000-0000-0000-000000000000' };
    for (const code of ['inv-doc-tpl', 'inv-doc-tpl-other']) {
      await h.settings.adminService.setValueForSubset(
        'invoices.numbering.invoice.pattern',
        [code],
        `${code === 'inv-doc-tpl' ? 'FVDT' : 'FVDO'} {seq}/{YYYY}`,
        null,
        audit,
      );
    }
    renderer = h.container.resolve('documentRenderer') as typeof renderer;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const id of created.splice(0)) {
      await h.em().getConnection().execute(`delete from document_templates where id = ?`, [id]);
    }
  });

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  async function issue(salesChannelId: string): Promise<{ orderId: string; invoiceId: string }> {
    const { orderId } = await seedInvoiceableOrder(h.em(), { salesChannelId });
    const res = await h.app.inject({
      method: 'POST',
      url: `/api/v1/admin/orders/${orderId}/invoices`,
      cookies: ADMIN_COOKIE,
      payload: { kind: 'invoice' },
    });
    expect(res.statusCode).toBe(201);
    return { orderId, invoiceId: (res.json() as { data: { id: string } }).data.id };
  }

  async function invoiceTemplate(name: string, salesChannelId: string | null): Promise<string> {
    const res = await h.app.inject({
      method: 'POST',
      url: API,
      cookies: ADMIN,
      payload: { documentType: 'invoices.invoice', name, salesChannelId, source: { kind: 'built_in' }, setDefault: false },
    });
    expect(res.statusCode).toBe(201);
    const { id, version } = (res.json() as { data: { id: string; version: number } }).data;
    created.push(id);
    const saved = await h.app.inject({
      method: 'PUT',
      url: `${API}/${id}/content/pl-PL`,
      cookies: ADMIN,
      payload: {
        expectedVersion: version,
        tree: {
          root: { props: {} },
          content: [
            { type: 'invoices.InvoiceNotes', props: { id: 'n', text: `Szablon: ${name}` } },
            { type: 'invoices.InvoiceHeader', props: { id: 'h' } },
            { type: 'invoices.InvoiceParties', props: { id: 'p' } },
            { type: 'invoices.InvoiceLineItems', props: { id: 'l' } },
            { type: 'invoices.InvoiceTotals', props: { id: 't' } },
          ],
        },
      },
    });
    expect(saved.statusCode).toBe(200);
    const def = await h.app.inject({ method: 'POST', url: `${API}/${id}/set-default`, cookies: ADMIN, payload: { expectedVersion: version + 1 } });
    expect(def.statusCode).toBe(200);
    return id;
  }

  async function capture<T>(act: () => Promise<T>): Promise<{ result: T; built: Built[] }> {
    const spy = vi.spyOn(renderer, 'buildDefinition');
    const result = await act();
    const built = await Promise.all(spy.mock.results.map((r) => r.value as Promise<Built>));
    spy.mockRestore();
    return { result, built };
  }

  it('serves the Invoice type: ten invoice blocks, no general-purpose block, Polish only (FR-080, FR-085)', async () => {
    const detail = await h.app.inject({ method: 'GET', url: `${API}/types/invoices.invoice`, cookies: ADMIN });
    expect(detail.statusCode).toBe(200);
    expect((detail.json() as { data: { languages: string[]; selection: string } }).data).toMatchObject({
      languages: ['pl-PL'],
      selection: 'default_only',
    });
    const config = await h.app.inject({ method: 'GET', url: `${API}/types/invoices.invoice/builder-config`, cookies: ADMIN });
    const names = (config.json() as { data: { components: { name: string }[] } }).data.components.map((c) => c.name);
    expect(names.filter((n) => n.startsWith('invoices.'))).toHaveLength(10);
    expect(names.some((n) => n.startsWith('document_templates.') || n.startsWith('comparisons.'))).toBe(false);
  });

  it('refuses an English invoice layout and a comparison block in an invoice template (N5, FR-019)', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: API,
      cookies: ADMIN,
      payload: { documentType: 'invoices.invoice', name: 'Refusals', salesChannelId: null, source: { kind: 'built_in' } },
    });
    const { id } = (res.json() as { data: { id: string } }).data;
    created.push(id);
    const english = await h.app.inject({ method: 'PUT', url: `${API}/${id}/content/en-US`, cookies: ADMIN, payload: { expectedVersion: 1, tree: { content: [] } } });
    expect(english.statusCode).toBe(422);
    const foreign = await h.app.inject({
      method: 'PUT',
      url: `${API}/${id}/content/pl-PL`,
      cookies: ADMIN,
      payload: { expectedVersion: 1, tree: { content: [{ type: 'comparisons.ComparisonTable', props: {} }] } },
    });
    expect(foreign.statusCode).toBe(422);
    expect((foreign.json() as { error: { details: { blockName: string } } }).error.details.blockName).toBe('comparisons.ComparisonTable');
  });

  it('withdrew the former invoice-template API (N4, FR-092)', async () => {
    for (const url of ['/api/v1/admin/invoice-templates', '/api/v1/admin/invoice-templates/page-builder/config']) {
      expect((await h.app.inject({ method: 'GET', url, cookies: ADMIN_COOKIE })).statusCode).toBe(404);
    }
  });

  it('with no template: the built-in layout, carrying what an invoice requires (FR-083)', async () => {
    const { invoiceId } = await issue(CH);
    const { result, built } = await capture(() =>
      h.app.inject({ method: 'GET', url: `/api/v1/admin/invoices/${invoiceId}/pdf`, cookies: ADMIN_COOKIE }),
    );
    expect(result.statusCode).toBe(200);
    expect(result.rawPayload.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(built[0]?.source).toBe('built_in');
    const text = JSON.stringify(built[0]?.definition.content);
    expect(text).toMatch(/FVDT \d+\/\d{4}/);
    expect(text).toContain('złotych');
  });

  it("an invoice of a channel is printed with its channel's default, another channel's with the global default (FR-084)", async () => {
    const global = await invoiceTemplate('Globalny', null);
    const channel = await invoiceTemplate('Kanałowy', CH);
    const ofChannel = await issue(CH);
    const ofOther = await issue(OTHER);

    const admin = await capture(() =>
      h.app.inject({ method: 'GET', url: `/api/v1/admin/invoices/${ofChannel.invoiceId}/pdf`, cookies: ADMIN_COOKIE }),
    );
    expect(admin.built[0]).toMatchObject({ source: 'default', templateId: channel });
    expect(JSON.stringify(admin.built[0]?.definition.content)).toContain('Szablon: Kanałowy');

    const regenerate = await capture(() =>
      h.app.inject({ method: 'POST', url: `/api/v1/admin/invoices/${ofChannel.invoiceId}/regenerate-pdf`, cookies: ADMIN_COOKIE }),
    );
    expect(regenerate.result.statusCode).toBe(200);
    expect(regenerate.built[0]?.templateId).toBe(channel);

    const customer = await capture(() =>
      h.app.inject({ method: 'GET', url: `/api/v1/orders/${ofChannel.orderId}/invoices/${ofChannel.invoiceId}/pdf`, cookies: CUSTOMER_COOKIE }),
    );
    expect(customer.result.statusCode).toBe(200);
    expect(customer.built[0]?.templateId).toBe(channel);

    const other = await capture(() =>
      h.app.inject({ method: 'GET', url: `/api/v1/admin/invoices/${ofOther.invoiceId}/pdf`, cookies: ADMIN_COOKIE }),
    );
    expect(other.built[0]?.templateId).toBe(global);
    expect(JSON.stringify(other.built[0]?.definition.content)).not.toContain('Kanałowy');
  });

  it('the e-mail attachment is produced from the same template as the download (N1, FR-093)', async () => {
    const channel = await invoiceTemplate('Mailowy', CH);
    const { invoiceId } = await issue(CH);
    const dispatcher = (
      h.container.resolve('invoices') as {
        handle: { emailDispatcher: { dispatch(id: string, o: { mode: 'attachment' }): Promise<unknown> } };
      }
    ).handle.emailDispatcher;
    const email = await capture(() =>
      withSystemScope('test: e-mail attachment', () => dispatcher.dispatch(invoiceId, { mode: 'attachment' })),
    );
    const download = await capture(() =>
      h.app.inject({ method: 'GET', url: `/api/v1/admin/invoices/${invoiceId}/pdf`, cookies: ADMIN_COOKIE }),
    );
    expect(email.built).toHaveLength(1);
    expect(email.built[0]?.templateId).toBe(channel);
    expect(email.built[0]?.templateId).toBe(download.built[0]?.templateId);
    expect(JSON.stringify(email.built[0]?.definition.content)).toContain('Szablon: Mailowy');
  });

  it('previews an unsaved invoice canvas with the sample invoice', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: `${API}/preview`,
      cookies: ADMIN,
      payload: {
        documentType: 'invoices.invoice',
        language: 'pl-PL',
        tree: {
          content: [
            { type: 'invoices.InvoiceHeader', props: { showSaleDate: false } },
            { type: 'invoices.InvoiceNotes', props: { text: 'Draft {{var invoice.number}}' } },
          ],
        },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });
});
