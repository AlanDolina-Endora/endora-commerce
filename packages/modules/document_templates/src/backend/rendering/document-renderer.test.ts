import { describe, expect, it, vi } from 'vitest';
import type {
  DocumentBlockRenderer,
  DocumentTypeRegistration,
  ModuleManifest,
} from '@endora-commerce/contracts';
import { ModuleDisabledError } from '@endora-commerce/platform/kernel';
import { DocumentTypeRegistry } from '../registry/document-type-registry.js';
import { BlockDeclarations } from '../services/block-declarations.js';
import { TemplateResolver, type TemplateRow } from '../services/template-resolver.js';
import { DocumentRenderer } from './document-renderer.js';

/**
 * T022 — the engine, asserted on document **definitions**, not bytes, plus
 * one byte-level smoke render.
 */

const A = '00000000-0000-4000-8000-00000000000a';
const tree = (content: unknown[], rootProps: Record<string, unknown> = {}) => ({ root: { props: rootProps }, content });
const node = (type: string, props: Record<string, unknown> = {}) => ({ type, props });

interface Data {
  readonly title: string;
}

function setup(opts: {
  rows?: TemplateRow[];
  registration?: Partial<DocumentTypeRegistration<Data, { stamp: string }>>;
  present?: Set<string>;
  blocks?: DocumentBlockRenderer<Data, { stamp: string }>[];
  manifests?: { manifest: ModuleManifest }[];
}) {
  const present = opts.present ?? new Set(['acme', 'ksef', 'document_templates']);
  const isPresent = (id: string): boolean => present.has(id);
  const registry = new DocumentTypeRegistry(isPresent, () => undefined);
  const body: DocumentBlockRenderer<Data, { stamp: string }> = {
    name: 'acme.Body',
    moduleId: 'acme',
    render: ({ props, data, prepared, interpolate }) => ({
      text: `${interpolate(String(props['text'] ?? ''))}|${data.title}|${prepared?.stamp ?? '-'}|${String(props['tone'])}`,
    }),
  };
  const stamp: DocumentBlockRenderer<Data, { stamp: string }> = {
    name: 'ksef.Stamp',
    moduleId: 'ksef',
    render: () => ({ text: 'stamp' }),
  };
  const registration: DocumentTypeRegistration<Data, { stamp: string }> = {
    code: 'acme.note',
    moduleId: 'acme',
    labelKey: 'x',
    blocks: () => opts.blocks ?? [body, stamp],
    coreBlocks: ['document_templates.Text', 'document_templates.Image'],
    selection: 'per_document',
    defaultContent: () => ({ schemaVersion: 1, languages: { 'en-US': tree([node('acme.Body', { text: 'built-in tree' })]) } }),
    sampleData: () => ({ title: 'sample' }),
    ...opts.registration,
  };
  registry.register(registration);
  const rows = opts.rows ?? [];
  const resolver = new TemplateResolver({
    findDefaults: async (type, channel) =>
      rows.filter((r) => r.documentType === type && r.isDefault && (r.salesChannelId === null || r.salesChannelId === channel)),
    findById: async (id) => rows.find((r) => r.id === id) ?? null,
  });
  const manifests = opts.manifests ?? [
    {
      manifest: {
        id: 'acme',
        name: 'acme',
        version: '1',
        description: 'acme',
        blocks: [
          { name: 'acme.Body', labelKey: 'b', category: 'acme', contexts: ['document'], fields: {}, defaultProps: { tone: 'calm', text: 'default text' } },
        ],
      } as unknown as ModuleManifest,
    },
  ];
  const assets = { openAssetBytes: vi.fn(async () => ({ bytes: new Uint8Array([0x89, 0x50]), mimeType: 'image/png' })) };
  const log = vi.fn();
  const renderer = new DocumentRenderer({
    registry,
    resolver,
    declarations: new BlockDeclarations(() => manifests, isPresent),
    assets,
    now: () => new Date('2026-10-17T10:00:00.000Z'),
    log,
  });
  return { renderer, present, assets, log };
}

const row = (id: string, content: unknown, over: Partial<TemplateRow> = {}): TemplateRow => ({
  id,
  documentType: 'acme.note',
  salesChannelId: null,
  isDefault: true,
  version: 4,
  content: { schemaVersion: 1, languages: { 'en-US': content } },
  ...over,
});

const input = (over: Record<string, unknown> = {}) => ({
  documentType: 'acme.note',
  salesChannelId: A,
  language: 'en-US',
  data: { title: 'Real' },
  ...over,
});

const texts = (definition: { content: unknown }) =>
  (definition.content as { text?: unknown }[]).map((c) => c.text);

describe('DocumentRenderer — palette and presence', () => {
  it('skips a block outside the type palette (another type’s block)', async () => {
    const { renderer } = setup({
      rows: [row('t1', tree([node('acme.Body', { text: 'a' }), node('comparisons.ComparisonTable', {}), node('document_templates.Heading', { text: 'not offered' })]))],
    });
    const built = await renderer.buildDefinition(input());
    expect(texts(built.definition)).toEqual(['a|Real|-|calm']);
  });

  it('skips a block whose owner is absent and leaves its stored props untouched', async () => {
    const stored = { id: 's', keep: { deep: 1 } };
    const content = tree([node('acme.Body', { text: 'a' }), node('ksef.Stamp', stored)]);
    const { renderer, present } = setup({ rows: [row('t1', content)] });
    present.delete('ksef');
    const built = await renderer.buildDefinition(input());
    expect(texts(built.definition)).toEqual(['a|Real|-|calm']);
    expect(stored).toEqual({ id: 's', keep: { deep: 1 } });
  });

  it('merges declared defaultProps under stored props', async () => {
    const { renderer } = setup({ rows: [row('t1', tree([node('acme.Body', { tone: undefined })]))] });
    const built = await renderer.buildDefinition(input());
    expect(texts(built.definition)).toEqual(['default text|Real|-|calm']);
  });

  it('hands every block the result of prepareRender, once, with the placed names', async () => {
    const prepareRender = vi.fn(async () => ({ stamp: 'P' }));
    const { renderer } = setup({
      rows: [row('t1', tree([node('acme.Body', { text: '1' }), node('acme.Body', { text: '2' }), node('ksef.Stamp')]))],
      registration: { prepareRender },
    });
    const built = await renderer.buildDefinition(input());
    expect(texts(built.definition)).toEqual(['1|Real|P|calm', '2|Real|P|calm', 'stamp']);
    expect(prepareRender).toHaveBeenCalledTimes(1);
    expect(prepareRender).toHaveBeenCalledWith({ title: 'Real' }, { placedBlocks: new Set(['acme.Body', 'ksef.Stamp']), preview: false });
  });
});

describe('DocumentRenderer — fall-through', () => {
  it('a default whose tree prints nothing falls through to the built-in tree', async () => {
    const { renderer } = setup({ rows: [row('t1', tree([node('gone.Block')]))] });
    const built = await renderer.buildDefinition(input());
    expect(built.source).toBe('built_in');
    expect(texts(built.definition)).toEqual(['built-in tree|Real|-|calm']);
  });

  it('uses renderBuiltIn last, with prepareRender told nothing was placed', async () => {
    const prepareRender = vi.fn(async () => ({ stamp: 'B' }));
    const { renderer } = setup({
      rows: [row('t1', tree([]))],
      registration: {
        defaultContent: () => ({ schemaVersion: 1, languages: { 'en-US': tree([node('gone.Block')]) } }),
        renderBuiltIn: (data, prepared) => [{ text: `code ${data.title} ${prepared.stamp}` }],
        prepareRender,
      },
    });
    const built = await renderer.buildDefinition(input());
    expect(texts(built.definition)).toEqual(['code Real B']);
    expect(prepareRender).toHaveBeenCalledWith({ title: 'Real' }, { placedBlocks: null, preview: false });
  });

  it('refuses an empty document for a type with no code layout', async () => {
    const { renderer } = setup({
      registration: { defaultContent: () => ({ schemaVersion: 1, languages: { 'en-US': tree([node('gone.Block')]) } }) },
    });
    await expect(renderer.buildDefinition(input())).rejects.toMatchObject({ code: 'DOCUMENT_RENDER_FAILED' });
  });

  it('answers DOCUMENT_TYPE_NOT_AVAILABLE for an absent host, before reading anything', async () => {
    const { renderer, present } = setup({});
    present.delete('acme');
    await expect(renderer.buildDefinition(input())).rejects.toMatchObject({ code: 'DOCUMENT_TYPE_NOT_AVAILABLE', statusCode: 404 });
  });

  it('renders an explicitly chosen template and reports a missing one', async () => {
    const { renderer } = setup({
      rows: [row('pick', tree([node('acme.Body', { text: 'picked' })]), { isDefault: false }), row('def', tree([node('acme.Body', { text: 'default' })]))],
    });
    const picked = await renderer.buildDefinition(input({ templateId: 'pick' }));
    expect(picked.source).toBe('explicit');
    expect(texts(picked.definition)).toEqual(['picked|Real|-|calm']);
    const missing = await renderer.buildDefinition(input({ templateId: '00000000-0000-4000-8000-000000000000' }));
    expect(missing.requestedTemplateMissing).toBe(true);
    expect(texts(missing.definition)).toEqual(['default|Real|-|calm']);
  });
});

describe('DocumentRenderer — page', () => {
  it('applies the type pageDefaults under stored root props, and its styles', async () => {
    const { renderer } = setup({
      rows: [row('t1', tree([node('acme.Body')], { marginTop: 10, baseFontSize: 99 }))],
      registration: {
        pageDefaults: { orientation: 'portrait', marginTop: 40, marginRight: 40, marginBottom: 48, marginLeft: 40, styles: { docTitle: { bold: true } } },
      },
    });
    const { definition } = await renderer.buildDefinition(input());
    expect(definition.pageMargins).toEqual([40, 10, 40, 48]);
    expect(definition.defaultStyle).toEqual({ fontSize: 10, font: 'Roboto' });
    expect(definition.styles).toEqual({ docTitle: { bold: true } });
    expect(definition.pageOrientation).toBeUndefined();
    expect(definition.header).toBeUndefined();
    expect(definition.footer).toBeUndefined();
    expect(definition.info).toBeUndefined();
  });

  it("'auto' orientation asks the type, and defaults to portrait", async () => {
    const landscape = setup({ rows: [row('t1', tree([node('acme.Body')]))], registration: { suggestOrientation: () => 'landscape' } });
    expect((await landscape.renderer.buildDefinition(input())).definition.pageOrientation).toBe('landscape');
    const plain = setup({ rows: [row('t1', tree([node('acme.Body')]))] });
    expect((await plain.renderer.buildDefinition(input())).definition.pageOrientation).toBeUndefined();
  });

  it('prints header and footer with merge fields and page numbers', async () => {
    const { renderer } = setup({
      rows: [row('t1', tree([node('acme.Body')], { headerText: 'Offer {{date}}', footerText: 'Acme · {{who}}', showPageNumbers: true }))],
      registration: { resolveVariables: () => ({ who: 'Anna' }) },
    });
    const { definition } = await renderer.buildDefinition(input());
    const header = (definition.header as (p: number, n: number) => { text: string })(1, 3);
    expect(header.text).toBe('Offer October 17, 2026');
    const footer = (definition.footer as (p: number, n: number) => { columns: { text: string }[] })(2, 3);
    expect(footer.columns.map((c) => c.text)).toEqual(['Acme · Anna', '2 / 3']);
  });
});

describe('DocumentRenderer — failures', () => {
  it('turns a block that throws into DOCUMENT_RENDER_FAILED and logs template, version and block', async () => {
    const { renderer, log } = setup({
      rows: [row('t1', tree([node('acme.Body')]))],
      blocks: [{ name: 'acme.Body', moduleId: 'acme', render: () => { throw new Error('boom'); } }],
    });
    await expect(renderer.buildDefinition(input())).rejects.toMatchObject({ code: 'DOCUMENT_RENDER_FAILED', statusCode: 503 });
    expect(log).toHaveBeenCalledWith(
      '[document_templates] a block failed to render',
      expect.objectContaining({ templateId: 't1', templateVersion: 4, blockName: 'acme.Body' }),
    );
  });

  it('re-throws a ModuleDisabledError untouched', async () => {
    const { renderer } = setup({
      rows: [row('t1', tree([node('acme.Body')]))],
      blocks: [{ name: 'acme.Body', moduleId: 'acme', render: () => { throw new ModuleDisabledError('catalog'); } }],
    });
    await expect(renderer.buildDefinition(input())).rejects.toBeInstanceOf(ModuleDisabledError);
  });
});

describe('DocumentRenderer — images and preview', () => {
  it('inlines a core Image from the assets library and never fetches a URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { renderer, assets } = setup({
      rows: [row('t1', tree([node('document_templates.Image', { assetId: 'logo', src: 'https://x.test/a.png' })]))],
    });
    const { definition } = await renderer.buildDefinition(input());
    expect((definition.content as { image?: string }[])[0]!.image).toMatch(/^data:image\/png;base64,/);
    expect(assets.openAssetBytes).toHaveBeenCalledWith('logo');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('previews an unsaved canvas, marked as a preview, falling back when it prints nothing', async () => {
    const prepareRender = vi.fn(async () => ({ stamp: 'pv' }));
    const { renderer } = setup({ registration: { prepareRender } });
    const canvas = await renderer.buildDefinition(
      input({ salesChannelId: null, tree: tree([node('acme.Body', { text: 'canvas' })]) }),
    );
    expect(canvas.source).toBe('canvas');
    expect(texts(canvas.definition)).toEqual(['canvas|Real|pv|calm']);
    expect(prepareRender).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ preview: true }));
    const empty = await renderer.buildDefinition(input({ salesChannelId: null, tree: tree([]) }));
    expect(empty.source).toBe('built_in');
  });

  it('produces PDF bytes (smoke)', async () => {
    const { renderer } = setup({ rows: [row('t1', tree([node('acme.Body'), node('document_templates.Text', { text: 'Zażółć gęślą jaźń' })]))] });
    const result = await renderer.render(input());
    expect(Buffer.from(result.bytes.subarray(0, 5)).toString('utf8')).toBe('%PDF-');
    expect(result).toMatchObject({ source: 'default', templateId: 't1', templateVersion: 4, language: 'en-US', requestedTemplateMissing: false });
  });
});
