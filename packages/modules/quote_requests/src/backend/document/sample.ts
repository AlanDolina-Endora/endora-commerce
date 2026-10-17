import type { QuoteRequestDocumentData } from '@endora-commerce/contracts';

/**
 * The fictitious quote the template editor draws over and the preview prints
 * (`contracts/quote-request-document.md` §1): fully priced, five lines — two
 * discounted, one in a packaging unit, one with a note — an organisation with
 * an address, a customer, a representative, two details and a validity date.
 * Names are invented; product names are kept language-neutral.
 */
export function sampleQuoteRequestData(language: string): QuoteRequestDocumentData {
  const polish = language.split('-')[0]?.toLowerCase() === 'pl';
  return {
    generatedAt: '2026-10-17T10:00:00.000Z',
    quote: {
      id: '00000000-0000-4000-8000-000000000153',
      businessId: 'QR-000153',
      status: 'Approved',
      revisionNumber: 2,
      createdAt: '2026-10-10T09:00:00.000Z',
      submittedAt: '2026-10-10T09:05:00.000Z',
      approvedAt: '2026-10-16T14:00:00.000Z',
      expiresAt: '2026-11-16T12:00:00.000Z',
      headerNote: polish
        ? 'Dostawa jednorazowa na adres magazynu. Prosimy o potwierdzenie do końca tygodnia.'
        : 'One delivery to the warehouse address. Please confirm by the end of the week.',
      taxRate: 0.23,
      currency: 'PLN',
    },
    channel: { id: '00000000-0000-4000-8000-0000000000c1', name: polish ? 'Sklep B2B' : 'B2B store' },
    buyer: {
      organizationName: 'Example Industries',
      legalName: 'Example Industries Ltd.',
      taxId: 'PL1234567890',
      address: { line1: '12 Sample Street', line2: null, postalCode: '00-001', city: 'Warsaw', country: 'PL' },
      customerName: 'Anna Example',
      customerEmail: 'anna@example.com',
    },
    salesRep: { name: 'Jan Sample', email: 'jan.sample@example.com' },
    details: [
      { label: polish ? 'Numer zamówienia klienta' : 'Customer order number', value: 'PO-2026-117' },
      { label: polish ? 'Miejsce dostawy' : 'Delivery site', value: polish ? 'Magazyn główny' : 'Main warehouse' },
    ],
    lines: [
      line(1, 'Hex bolt M8×40', 'HB-M8-40', 500, 0.42, 0.5),
      line(2, 'Hex nut M8', 'HN-M8', 500, 0.12, 0.12),
      line(3, 'Washer 8.4 mm', 'W-84', 1200, 0.05, 0.06, {
        packagingUnitName: polish ? 'Karton 100 szt.' : 'Box of 100',
        packagingUnitBaseQuantity: 100,
      }),
      line(4, 'Threaded rod M8, 1 m', 'TR-M8-1000', 40, 3.9, 3.9, {
        lineNote: polish ? 'Cięte na 0,5 m' : 'Cut to 0.5 m',
      }),
      line(5, 'Anchor 10×80', 'AN-10-80', 200, 1.15, 1.15),
    ],
  };
}

function line(
  n: number,
  productName: string,
  sku: string,
  quantity: number,
  agreed: number,
  list: number,
  over: Partial<QuoteRequestDocumentData['lines'][number]> = {},
): QuoteRequestDocumentData['lines'][number] {
  return {
    id: `00000000-0000-4000-8000-00000000010${n}`,
    productId: `00000000-0000-4000-8000-00000000020${n}`,
    productName,
    variantLabel: null,
    sku,
    quantity,
    packagingUnitName: null,
    packagingUnitBaseQuantity: null,
    agreedUnitPrice: agreed,
    proposedUnitPrice: null,
    referenceUnitPrice: list,
    referenceCurrency: 'PLN',
    lineCurrency: 'PLN',
    lineNote: null,
    attributes: {},
    ...over,
  };
}
