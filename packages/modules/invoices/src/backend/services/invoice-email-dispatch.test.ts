import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import type {
  DocumentRenderInput,
  InvoiceDetail,
  TransactionalEmailSendInput,
  TransactionalEmailSender,
} from '@endora-commerce/contracts';
import { ModuleDisabledError } from '@endora-commerce/platform/kernel';
import { InvoiceEmailDispatcher, type InvoiceEmailDispatchDeps } from './invoice-email-dispatch.js';
import { invoiceRenderInput } from '../document/render-invoice.js';
import { INVOICES_SETTING_CODES } from '../../manifest.js';

/**
 * `specs/152-compare-pdf-template/` T059a — FR-093 (owner answer N1): the PDF
 * attached to the invoice e-mail is rendered through the document-template
 * facility with **exactly** the download's input, so the same invoice is
 * e-mailed and downloaded from the same template. A render failure stays a
 * contained "not sent" (issuance is never undone, FR-029); a switched-off
 * facility is a presence answer and is re-thrown.
 */

const DETAIL = {
  id: 'ffffffff-0000-4000-8000-000000000001',
  orderId: 'ffffffff-0000-4000-8000-000000000002',
  number: 'FV 1/2026',
  grossTotal: 123.45,
  currency: 'PLN',
  salesChannelId: 'ffffffff-0000-4000-8000-0000000000c1',
} as unknown as InvoiceDetail;

function deps(sender: TransactionalEmailSender, render: (input: DocumentRenderInput) => Promise<{ bytes: Uint8Array }>): InvoiceEmailDispatchDeps {
  return {
    orderReadPort: { findById: async () => ({ id: DETAIL.orderId, businessId: 'ORD-1' }) } as unknown as InvoiceEmailDispatchDeps['orderReadPort'],
    invoiceService: { buildDetail: async () => DETAIL } as unknown as InvoiceEmailDispatchDeps['invoiceService'],
    documents: { render: render as unknown as InvoiceEmailDispatchDeps['documents']['render'] },
    settingsService: {
      async get<T>(code: string, _channel: string | null, schema: z.ZodType<T>): Promise<T> {
        return schema.parse(code === INVOICES_SETTING_CODES.EMAIL_DELIVERY_MODE ? 'attachment' : '');
      },
    },
    getSender: () => sender,
    resolveRecipientEmail: async () => 'buyer@example.com',
    resolveLanguage: async () => 'pl-PL',
    log: () => undefined,
  };
}

describe('invoice e-mail attachment (FR-093)', () => {
  it('renders the attachment with exactly the download’s input', async () => {
    const sent: TransactionalEmailSendInput[] = [];
    const render = vi.fn(async () => ({ bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]) }));
    const result = await new InvoiceEmailDispatcher(
      deps({ send: async (input) => (sent.push(input), { status: 'sent' }) }, render),
    ).dispatch(DETAIL.id);
    expect(result).toEqual({ sent: true });
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith(invoiceRenderInput(DETAIL));
    expect(invoiceRenderInput(DETAIL)).toEqual({
      documentType: 'invoices.invoice',
      salesChannelId: DETAIL.salesChannelId,
      language: 'pl-PL',
      data: { invoice: DETAIL, amountLocale: 'pl' },
    });
    expect(sent[0]!.attachments?.[0]?.content).toEqual(Buffer.from([0x25, 0x50, 0x44, 0x46]));
  });

  it('a failed render is a contained "not sent" — issuance is not undone', async () => {
    const result = await new InvoiceEmailDispatcher(
      deps({ send: async () => ({ status: 'sent' }) }, async () => Promise.reject(new Error('pdf failed'))),
    ).dispatch(DETAIL.id);
    expect(result).toEqual({ sent: false, reason: 'failed' });
  });

  it('a switched-off facility is re-thrown, not absorbed', async () => {
    await expect(
      new InvoiceEmailDispatcher(
        deps({ send: async () => ({ status: 'sent' }) }, async () => Promise.reject(new ModuleDisabledError('document_templates'))),
      ).dispatch(DETAIL.id),
    ).rejects.toBeInstanceOf(ModuleDisabledError);
  });
});
