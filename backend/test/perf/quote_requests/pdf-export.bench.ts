// perf-weight: fast — about 2 s locally (2026-10-17, p95 ≈ 0.4 s per PDF); no service needed.
import { describe, expect, it } from 'vitest';
import type { ModuleManifest } from '@endora-commerce/contracts';
import { DocumentTypeRegistry } from '../../../../packages/modules/document_templates/src/backend/registry/document-type-registry.js';
import { DocumentRenderer } from '../../../../packages/modules/document_templates/src/backend/rendering/document-renderer.js';
import { BlockDeclarations } from '../../../../packages/modules/document_templates/src/backend/services/block-declarations.js';
import { TemplateResolver } from '../../../../packages/modules/document_templates/src/backend/services/template-resolver.js';
import { createQuoteRequestDocumentType } from '../../../../packages/modules/quote_requests/src/backend/document/quote-request-document-type.js';
import { sampleQuoteRequestData } from '../../../../packages/modules/quote_requests/src/backend/document/sample.js';
import { manifest as quoteRequestsManifest } from '../../../../packages/modules/quote_requests/src/manifest.js';
import { manifest as documentTemplatesManifest } from '../../../../packages/modules/document_templates/src/manifest.js';

/**
 * `specs/153-quote-request-pdf-template/` SC-003 (T050) — a 200-line quote
 * through the built-in layout (header, parties, the Line items table with a
 * detail row and totals) must be produced in under 5 s at the 95th percentile.
 * In process and without a database: the template read is ≤ 2 indexed rows and
 * the data build one read per port, neither of which is what this measures.
 *
 * Tuning knobs (env): PERF_ITERATIONS (default 10), PERF_RUN=true to run.
 */

const iterations = Number(process.env['PERF_ITERATIONS'] ?? '10');
const shouldRun = process.env['PERF_RUN'] === 'true';

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
}

describe.skipIf(!shouldRun)('quote request PDF — production cost (SC-003)', () => {
  it('a 200-line quote through the built-in layout: < 5 s p95', async () => {
    const registry = new DocumentTypeRegistry(() => true, () => undefined);
    registry.register(createQuoteRequestDocumentType({ attributes: async () => [] }));
    const manifests = [quoteRequestsManifest, documentTemplatesManifest].map((manifest) => ({ manifest: manifest as ModuleManifest }));
    const renderer = new DocumentRenderer({
      registry,
      resolver: new TemplateResolver({ findDefaults: async () => [], findById: async () => null, findApplicable: async () => [] }),
      declarations: new BlockDeclarations(() => manifests),
      assets: { openAssetBytes: async () => null },
      log: () => undefined,
    });
    const sample = sampleQuoteRequestData('pl-PL');
    const data = {
      ...sample,
      lines: Array.from({ length: 200 }, (_, i) => ({
        ...sample.lines[i % sample.lines.length]!,
        id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        lineNote: i % 5 === 0 ? `Note for line ${i + 1}` : null,
      })),
    };
    const run = () => renderer.render({ documentType: 'quote_requests.quote_request', salesChannelId: null, language: 'pl-PL', data });
    await run();
    const samples: number[] = [];
    for (let i = 0; i < iterations; i += 1) {
      const started = performance.now();
      await run();
      samples.push(performance.now() - started);
    }
    console.log(`[perf] quote PDF, 200 lines: p95 ${p95(samples).toFixed(0)} ms`);
    expect(p95(samples)).toBeLessThan(5_000);
  }, 600_000);
});
