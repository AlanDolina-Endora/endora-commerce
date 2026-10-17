import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DocumentSampleProvider, useDocumentSample, type DocumentBlockEditorConfig } from './index.js';

/**
 * `specs/152-compare-pdf-template/contracts/admin-ui.md` §5 — the sample a
 * document-template editor hands its block renderers. The canvas shows the
 * same sample the server's *Preview PDF* renders (FR-016), so a renderer reads
 * it from the editor rather than carrying its own copy.
 */

interface Sample {
  readonly title: string;
}

function Probe(): ReactNode {
  const sample = useDocumentSample<Sample>();
  return <b>{sample === null ? 'no-sample' : sample.title}</b>;
}

describe('DocumentSampleProvider / useDocumentSample', () => {
  it('answers null outside a provider, so a renderer can draw a neutral state', () => {
    expect(renderToString(<Probe />)).toContain('no-sample');
  });

  it('hands the provider value to every renderer below it', () => {
    const html = renderToString(
      <DocumentSampleProvider value={{ title: 'Sample comparison' }}>
        <Probe />
      </DocumentSampleProvider>,
    );
    expect(html).toContain('Sample comparison');
  });

  it('a DocumentBlockEditorConfig renders over the sample', () => {
    const config: DocumentBlockEditorConfig = {
      render: ({ heading }: { heading?: string }) => (
        <section>
          {heading}
          <Probe />
        </section>
      ),
    };
    const Render = config.render;
    const html = renderToString(
      <DocumentSampleProvider value={{ title: 'Ten products' }}>
        <Render heading="Compare" />
      </DocumentSampleProvider>,
    );
    expect(html).toContain('Compare');
    expect(html).toContain('Ten products');
  });
});
