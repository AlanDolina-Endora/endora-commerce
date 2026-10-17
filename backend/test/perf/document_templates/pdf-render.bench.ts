// perf-weight: fast — about 20 s locally (2026-10-17); no service needed.
import { describe, expect, it } from 'vitest';
import type { ModuleManifest } from '@endora-commerce/contracts';
import { DocumentTypeRegistry } from '../../../../packages/modules/document_templates/src/backend/registry/document-type-registry.js';
import { DocumentRenderer } from '../../../../packages/modules/document_templates/src/backend/rendering/document-renderer.js';
import { BlockDeclarations } from '../../../../packages/modules/document_templates/src/backend/services/block-declarations.js';
import { TemplateResolver } from '../../../../packages/modules/document_templates/src/backend/services/template-resolver.js';
import { createComparisonDocumentType } from '../../../../packages/modules/comparisons/src/backend/document/comparison-document-type.js';
import { sampleComparisonData } from '../../../../packages/modules/comparisons/src/backend/document/sample-comparison.js';
import { ComparisonPdfRenderer } from '../../../../packages/modules/comparisons/src/backend/services/comparison-pdf-renderer.js';
import { createInvoiceDocumentType } from '../../../../packages/modules/invoices/src/backend/document/invoice-document-type.js';
import { InvoicePdfBlockRegistry } from '../../../../packages/modules/invoices/src/backend/services/invoice-pdf-block-registry.js';
import { manifest as comparisonsManifest } from '../../../../packages/modules/comparisons/src/manifest.js';
import { manifest as documentTemplatesManifest } from '../../../../packages/modules/document_templates/src/manifest.js';

/**
 * `specs/152-compare-pdf-template/` SC-003 (T072) — the cost of producing a PDF
 * through the document-template engine, in process and without a database (the
 * template read is ≤ 2 indexed rows and is not what this measures):
 *
 *  - a 16-product comparison through the built-in layout must stay under
 *    5 s at the 95th percentile and no more than 0.5 s slower than the fixed
 *    renderer it replaces;
 *  - an invoice through the built-in invoice layout is reported. (Its "within
 *    10 % of today" half cannot be measured after the move — owner answer P1
 *    removed the old renderer — so the number is recorded, not compared.)
 *
 * Tuning knobs (env): PERF_ITERATIONS (default 10), PERF_RUN=true to run.
 */

const iterations = Number(process.env['PERF_ITERATIONS'] ?? '10');
const shouldRun = process.env['PERF_RUN'] === 'true';

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
}

async function time(run: () => Promise<unknown>): Promise<number[]> {
  const samples: number[] = [];
  await run();
  for (let i = 0; i < iterations; i += 1) {
    const started = performance.now();
    await run();
    samples.push(performance.now() - started);
  }
  return samples;
}

function engine(): { renderer: DocumentRenderer; registry: DocumentTypeRegistry } {
  const registry = new DocumentTypeRegistry(() => true, () => undefined);
  const manifests = [comparisonsManifest, documentTemplatesManifest].map((manifest) => ({ manifest: manifest as ModuleManifest }));
  const renderer = new DocumentRenderer({
    registry,
    resolver: new TemplateResolver({ findDefaults: async () => [], findById: async () => null }),
    declarations: new BlockDeclarations(() => manifests),
    assets: { openAssetBytes: async () => null },
    log: () => undefined,
  });
  return { renderer, registry };
}

describe.skipIf(!shouldRun)('document templates — PDF production cost (SC-003)', () => {
  it('a 16-product comparison: < 5 s p95 and ≤ +0.5 s over the fixed layout', async () => {
    const { renderer, registry } = engine();
    registry.register(createComparisonDocumentType());
    const sample = sampleComparisonData('en-US');
    const products = Array.from({ length: 16 }, (_, i) => ({ ...sample.view.products[0]!, id: `p-${i}`, sku: `SKU-${i}` }));
    const data = {
      ...sample,
      view: {
        ...sample.view,
        products,
        comparableAttributes: Array.from({ length: 30 }, (_, r) => ({
          key: `a${r}`,
          label: { 'en-US': `Attribute ${r}` },
          valueType: 'string' as const,
          values: products.map((_, c) => `value ${r}.${c}`),
          rowClass: (r % 2 === 0 ? 'common' : 'different') as 'common' | 'different',
        })),
      },
    };
    const fixed = new ComparisonPdfRenderer();
    const viaTemplate = p95(await time(() => renderer.render({ documentType: 'comparisons.comparison', salesChannelId: null, language: 'en-US', data })));
    const viaFixed = p95(await time(() => fixed.render(data.view)));
    console.log(`[perf] comparison 16 products × 30 rows: template p95 ${viaTemplate.toFixed(0)} ms, fixed p95 ${viaFixed.toFixed(0)} ms`);
    expect(viaTemplate).toBeLessThan(5_000);
    expect(viaTemplate - viaFixed).toBeLessThan(500);
  }, 600_000);

  it('an invoice through the built-in layout (recorded)', async () => {
    const { renderer, registry } = engine();
    const type = createInvoiceDocumentType({ contributed: new InvoicePdfBlockRegistry(), loadAssetImage: async () => null });
    registry.register(type);
    const data = type.sampleData('pl-PL');
    const samples = await time(() => renderer.render({ documentType: 'invoices.invoice', salesChannelId: null, language: 'pl-PL', data }));
    console.log(`[perf] invoice built-in layout: p95 ${p95(samples).toFixed(0)} ms`);
    expect(p95(samples)).toBeLessThan(5_000);
  }, 600_000);
});
