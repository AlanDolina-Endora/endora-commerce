/**
 * Invoice PDF parity goldens (`specs/152-compare-pdf-template/` T009, SC-008;
 * `contracts/invoice-document.md` §5).
 *
 * Invoice templates move onto the `document_templates` facility in feature
 * 152, and the owner's requirement is that every invoice PDF keeps its content.
 * Parity is proven on the pdfmake **document definition**, not trusted: this
 * file captured the definitions today's `InvoicePdfRenderer` builds for a
 * fixed matrix of invoices and templates **before** any invoice file changed,
 * and committed them under `__golden__/`.
 *
 * Run with `UPDATE_GOLDENS=1` to (re)write the files; otherwise every case is
 * asserted equal to its committed golden. Re-capturing is never the answer to
 * a red case here — a difference is an invoice PDF that changed.
 *
 * Functions inside a definition (table layouts) are compared by their source
 * and by the values they answer for a few row indexes, because a closure's
 * source alone does not show the colour it captured.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InvoiceDetail, InvoicePdfBlockRegistration } from '@endora-commerce/contracts';
import { InvoicePdfRenderer } from '../../services/invoice-pdf-renderer.js';
import { InvoicePdfBlockRegistry } from '../../services/invoice-pdf-block-registry.js';
import { GENERIC_INVOICE_TEMPLATE_CONTENT } from '../../seeds/generic-invoice-template.js';
import { sampleInvoiceDetail } from '../../pdf-components/sample.js';
import { pickLanguageTree } from '../../pdf-components/tree-mapper.js';

const GOLDEN_DIR = dirname(fileURLToPath(import.meta.url));
const UPDATE = process.env['UPDATE_GOLDENS'] === '1';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CHANNEL_A = '00000000-0000-4000-8000-0000000000a1';
const CHANNEL_B = '00000000-0000-4000-8000-0000000000b1';

export function regularInvoice(overrides: Partial<InvoiceDetail> = {}): InvoiceDetail {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    orderId: '00000000-0000-4000-8000-000000000002',
    orderBusinessId: 'ORD-TEST-0001',
    salesChannelId: CHANNEL_A,
    kind: 'invoice',
    number: 'FV 26/2026',
    status: 'ready',
    currency: 'PLN',
    issuedAt: '2026-05-04T10:00:00.000Z',
    saleDate: '2026-05-04',
    paymentDueDate: '2026-05-18',
    paymentMethod: 'Przelew',
    netTotal: 5405,
    taxTotal: 1243.15,
    grossTotal: 6648.15,
    paidTotal: 1000,
    amountDue: 5648.15,
    total: 6648.15,
    originalInvoiceId: null,
    templateId: null,
    pdfAssetId: null,
    ksefReferenceNumber: null,
    ksefProcessedAt: null,
    lines: [
      { ordinal: 1, name: 'Serwer', unit: 'szt.', quantity: 1, unitNetPrice: 900, taxRate: 0.23, netValue: 900, grossValue: 1107 },
      { ordinal: 2, name: 'Roboczogodziny', unit: 'h', quantity: 26.5, unitNetPrice: 170, taxRate: 0.23, netValue: 4505, grossValue: 5541.15 },
    ],
    vatSummary: [{ taxRate: 0.23, netTotal: 5405, vatAmount: 1243.15, grossTotal: 6648.15 }],
    seller: {
      legalName: 'Example Seller Sp. z o.o.',
      addressLine1: 'ul. Przykładowa 2',
      addressLine2: '',
      postalCode: '00-001',
      city: 'Warszawa',
      country: 'PL',
      taxId: '1234567890',
      bankName: 'Example Bank',
      bankAccount: '00 1234',
      swift: 'EXMPPLPW',
      email: 'faktury@example.test',
      phone: '+48 22 000 00 00',
    },
    buyer: {
      name: 'Example Buyer Sp. z o.o.',
      taxId: '1231231230',
      addressLine1: 'ul. Kupiecka 7',
      addressLine2: 'lok. 3',
      postalCode: '30-001',
      city: 'Kraków',
      country: 'PL',
    },
    ...overrides,
  };
}

export const correctionInvoice = (): InvoiceDetail =>
  regularInvoice({
    id: '00000000-0000-4000-8000-000000000011',
    kind: 'correction',
    number: 'FK 3/2026',
    originalInvoiceId: '00000000-0000-4000-8000-000000000001',
    netTotal: -900,
    taxTotal: -207,
    grossTotal: -1107,
    paidTotal: 0,
    amountDue: -1107,
    total: -1107,
    lines: [
      { ordinal: 1, name: 'Serwer — korekta', unit: 'szt.', quantity: -1, unitNetPrice: 900, taxRate: 0.23, netValue: -900, grossValue: -1107 },
    ],
    vatSummary: [{ taxRate: 0.23, netTotal: -900, vatAmount: -207, grossTotal: -1107 }],
  });

export const channelBInvoice = (): InvoiceDetail =>
  regularInvoice({ id: '00000000-0000-4000-8000-000000000021', salesChannelId: CHANNEL_B, number: 'FV 27/2026' });

export const ksefInvoice = (): InvoiceDetail =>
  regularInvoice({
    id: '00000000-0000-4000-8000-000000000031',
    number: 'FV 28/2026',
    ksefReferenceNumber: '1234567890-20260504-ABCDEF123456-7A',
    ksefProcessedAt: '2026-05-04T10:05:00.000Z',
  });

/** The seeded generic tree, Polish layout — what every installation starts with. */
export const seedTree = (): unknown => structuredClone(pickLanguageTree(GENERIC_INVOICE_TEMPLATE_CONTENT, 'pl-PL'));

const ALIGNS = { left: 'left', center: 'center', right: 'right' } as const;

/** Every own block, each with non-default props (case 3). */
export function editedTree(): unknown {
  return {
    root: { props: {} },
    content: [
      { type: 'invoices.InvoiceLogo', props: { id: 'l', imageSource: 'url', src: '', width: 100, maxHeight: 50, align: ALIGNS.left, marginBottom: 4 } },
      {
        type: 'invoices.InvoiceHeader',
        props: {
          id: 'h', titleSize: 18, titleColor: '#1d4ed8', titleBold: false, align: ALIGNS.right,
          showIssuedAt: true, showSaleDate: false, showPaymentDue: true, showPaymentMethod: false,
          labelIssuedAt: 'Wystawiono', labelSaleDate: 'Sprzedano', labelPaymentDue: 'Zapłać do',
          labelPaymentMethod: 'Forma', labelKsefNumber: 'Nr KSeF', marginTop: 6, marginBottom: 20,
        },
      },
      { type: 'invoices.InvoiceSpacer', props: { id: 's', height: 24, backgroundColor: '#f1f5f9' } },
      {
        type: 'invoices.InvoiceParties',
        props: {
          id: 'p', sellerLabel: 'Sprzedawca', buyerLabel: 'Nabywca', showSellerBank: false, showSellerSwift: false,
          showBuyerTaxId: true, labelFontSize: 12, bodyFontSize: 9, columnGap: 24, sellerWidthPercent: 40,
          marginTop: 2, marginBottom: 10,
        },
      },
      {
        type: 'invoices.InvoiceLineItems',
        props: {
          id: 'li', fontSize: 8, headerBold: false, headerBackground: '#e2e8f0', headerColor: '#0f172a',
          borderColor: '#94a3b8', zebra: true, showUnit: false, showQty: true, showUnitNet: true,
          showTaxRate: false, showNet: true, showGross: true, marginTop: 4, marginBottom: 8,
        },
      },
      {
        type: 'invoices.InvoiceVatSummary',
        props: {
          id: 'v', fontSize: 9, headerBold: true, headerBackground: '#fef3c7', headerColor: '#78350f',
          borderColor: '#d97706', showTotalRow: false, totalLabel: 'Suma', marginTop: 0, marginBottom: 6,
        },
      },
      {
        type: 'invoices.InvoiceTotals',
        props: {
          id: 't', align: ALIGNS.left, fontSize: 11, color: '#111827', amountDueColor: '#b91c1c', amountDueBold: false,
          amountInWordsItalics: false, showPaid: true, showAmountDue: true, showGross: false, showAmountInWords: true,
          labelPaid: 'Wpłacono', labelAmountDue: 'Pozostało', labelGross: 'Brutto', labelInWords: 'Słownie',
          marginTop: 3, marginBottom: 3,
        },
      },
      {
        type: 'invoices.InvoiceNotes',
        props: {
          id: 'n', text: 'Uwagi dla {{var buyer.name}}', align: ALIGNS.center, fontSize: 9, color: '#475569',
          bold: true, italics: true, showTopDivider: true, marginTop: 8, marginBottom: 8,
        },
      },
      { type: 'invoices.InvoiceDivider', props: { id: 'd', thickness: 2, color: '#000000', style: 'dashed', widthPercent: 60, align: ALIGNS.center, marginY: 10 } },
      {
        type: 'invoices.InvoiceFooter',
        props: {
          id: 'f', text: '{{var seller.legalName}} — NIP {{var seller.taxId}}', align: ALIGNS.right, fontSize: 7,
          color: '#64748b', bold: false, italics: true, showTopDivider: false, marginTop: 12, marginBottom: 0,
        },
      },
    ],
  };
}

/** A channel's override (case 4a) — short, recognisably different from the seed. */
export function channelTree(): unknown {
  return {
    root: { props: {} },
    content: [
      { type: 'invoices.InvoiceHeader', props: { id: 'h', titleSize: 20, align: ALIGNS.center } },
      { type: 'invoices.InvoiceParties', props: { id: 'p' } },
      { type: 'invoices.InvoiceLineItems', props: { id: 'li' } },
      { type: 'invoices.InvoiceTotals', props: { id: 't' } },
      { type: 'invoices.InvoiceFooter', props: { id: 'f', text: 'Kanał B' } },
    ],
  };
}

/** A tree placing a contributed block, between the header and the parties (case 5, 6). */
export function treeWithContributed(name: string): unknown {
  return {
    root: { props: {} },
    content: [
      { type: 'invoices.InvoiceHeader', props: { id: 'h' } },
      { type: name, props: { id: 'c', caption: 'Weryfikacja' } },
      { type: 'invoices.InvoiceParties', props: { id: 'p' } },
      { type: 'invoices.InvoiceTotals', props: { id: 't' } },
    ],
  };
}

/** Nothing renderable: an unknown block and an untyped node (case 7). */
export const emptyTree = (): unknown => ({
  root: { props: {} },
  content: [{ type: 'gone.Block', props: { id: 'x', keep: 1 } }, { props: { id: 'y' } }],
});

/** Logo by asset id and by an external URL (case 8). */
export const ASSET_ID = '0f0e0d0c-0b0a-4908-8706-050403020100';
export const LOGO_URL = 'https://cdn.example.test/logo.png';
export const logoTree = (): unknown => ({
  root: { props: {} },
  content: [
    { type: 'invoices.InvoiceLogo', props: { id: 'l1', imageSource: 'library', assetId: ASSET_ID, width: 120, maxHeight: 60, align: 'left', marginBottom: 6 } },
    { type: 'invoices.InvoiceLogo', props: { id: 'l2', imageSource: 'url', src: LOGO_URL, width: 90, maxHeight: 40, align: 'right', marginBottom: 2 } },
    { type: 'invoices.InvoiceHeader', props: { id: 'h' } },
  ],
});

/** 1×1 PNG, served for the asset and for the URL. */
export const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=',
  'base64',
);
export const loadAssetImage = async (id: string) =>
  id === ASSET_ID ? { bytes: PNG_BYTES, mimeType: 'image/png' } : null;

/** A fake contributor printing the KSeF number, the shape `ksef` registers. */
export function ksefContributor(opts: { reject?: boolean } = {}): InvoicePdfBlockRegistration {
  return {
    name: 'acme.KsefSection',
    moduleId: 'acme',
    printsKsefReferenceNumber: true,
    describe: () => ({ label: 'KSeF', fields: { caption: { type: 'text', label: 'Caption' } } }),
    resolve: async (invoiceId) => {
      if (opts.reject) throw new Error('verification service down');
      return { link: `https://ksef.example.test/${invoiceId}` };
    },
    render: ({ props, invoice, locale, resolved }) => ({
      stack: [
        { text: `${String(props['caption'] ?? 'KSeF')}: ${invoice.ksefReferenceNumber ?? '—'}` },
        { text: `locale=${locale}` },
        { text: resolved === null ? 'no link' : (resolved as { link: string }).link },
      ],
    }),
  };
}

// ---------------------------------------------------------------------------
// The matrix (`contracts/invoice-document.md` §5)
// ---------------------------------------------------------------------------

export interface GoldenCase {
  readonly file: string;
  readonly invoice: () => InvoiceDetail;
  readonly locale: 'pl' | 'en';
  readonly tree: (() => unknown) | null;
  /** Contributed blocks registered, and whether their module is present. */
  readonly contributors?: () => { registration: InvoicePdfBlockRegistration; present: boolean }[];
}

export const GOLDEN_CASES: readonly GoldenCase[] = [
  { file: '01-seed-regular', invoice: regularInvoice, locale: 'pl', tree: seedTree },
  { file: '02-seed-correction', invoice: correctionInvoice, locale: 'pl', tree: seedTree },
  { file: '03-edited-tree', invoice: regularInvoice, locale: 'pl', tree: editedTree },
  { file: '04a-channel-override', invoice: channelBInvoice, locale: 'pl', tree: channelTree },
  { file: '04b-global-for-other-channel', invoice: regularInvoice, locale: 'pl', tree: seedTree },
  {
    file: '05a-ksef-block-placed-present',
    invoice: ksefInvoice,
    locale: 'pl',
    tree: () => treeWithContributed('acme.KsefSection'),
    contributors: () => [{ registration: ksefContributor(), present: true }],
  },
  {
    file: '05b-ksef-block-placed-absent',
    invoice: ksefInvoice,
    locale: 'pl',
    tree: () => treeWithContributed('acme.KsefSection'),
    contributors: () => [{ registration: ksefContributor(), present: false }],
  },
  {
    file: '06-contributor-resolve-rejects',
    invoice: ksefInvoice,
    locale: 'pl',
    tree: () => treeWithContributed('acme.KsefSection'),
    contributors: () => [{ registration: ksefContributor({ reject: true }), present: true }],
  },
  {
    file: '07-nothing-renderable-built-in',
    invoice: ksefInvoice,
    locale: 'pl',
    tree: emptyTree,
    contributors: () => [{ registration: ksefContributor(), present: true }],
  },
  { file: '08-logo-asset-and-url', invoice: regularInvoice, locale: 'pl', tree: logoTree },
  { file: '09-preview-sample-en', invoice: sampleInvoiceDetail, locale: 'en', tree: seedTree },
  { file: '10-email-built-in-no-tree', invoice: regularInvoice, locale: 'pl', tree: null },
];

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

/** A definition as comparable JSON: functions become their source plus sampled answers. */
export function toComparable(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, v: unknown) => {
      if (typeof v === 'function') {
        const samples: unknown[] = [];
        for (const i of [0, 1, 2, 5]) {
          try {
            samples.push((v as (...a: unknown[]) => unknown)(i, { table: { body: [[], [], [], [], [], []] } }));
          } catch {
            samples.push('<throws>');
          }
        }
        return { $fn: String(v), $samples: samples };
      }
      return v;
    }),
  ) as unknown;
}

export function readGolden(file: string): unknown {
  return JSON.parse(readFileSync(join(GOLDEN_DIR, `${file}.json`), 'utf8')) as unknown;
}

function writeGolden(file: string, value: unknown): void {
  mkdirSync(GOLDEN_DIR, { recursive: true });
  writeFileSync(join(GOLDEN_DIR, `${file}.json`), `${JSON.stringify(value, null, 2)}\n`);
}

/** Stub the network for case 8's external logo: answer PNG bytes for {@link LOGO_URL}. */
export function stubLogoFetch(): void {
  vi.stubGlobal('fetch', async (url: string) => {
    if (String(url) !== LOGO_URL) return new Response(null, { status: 404 });
    return new Response(PNG_BYTES, { status: 200, headers: { 'content-type': 'image/png' } });
  });
}

// ---------------------------------------------------------------------------
// Today's renderer (the baseline)
// ---------------------------------------------------------------------------

async function legacyDefinition(c: GoldenCase): Promise<unknown> {
  const presence = new Map<string, boolean>();
  const registry = new InvoicePdfBlockRegistry((moduleId) => presence.get(moduleId) ?? true);
  for (const { registration, present } of c.contributors?.() ?? []) {
    registry.register(registration);
    presence.set(registration.moduleId, present);
  }
  const renderer = new InvoicePdfRenderer({ loadAssetImage, blocks: registry });
  const content = await renderer.content(c.invoice(), c.locale, c.tree ? c.tree() : undefined);
  const buildDoc = (renderer as unknown as { buildDoc(content: unknown): unknown }).buildDoc.bind(renderer);
  return toComparable(buildDoc(content));
}

describe('invoice PDF parity goldens (152 T009)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  for (const c of GOLDEN_CASES) {
    it(`${c.file} matches its golden`, async () => {
      stubLogoFetch();
      const actual = await legacyDefinition(c);
      if (UPDATE || !existsSync(join(GOLDEN_DIR, `${c.file}.json`))) {
        if (!UPDATE) throw new Error(`golden ${c.file} is missing — run with UPDATE_GOLDENS=1`);
        writeGolden(c.file, actual);
      }
      expect(actual).toEqual(readGolden(c.file));
    });
  }
});
