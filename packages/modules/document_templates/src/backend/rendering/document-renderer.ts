import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces.js';
import {
  CORE_BLOCK_NAMES,
  ERROR_CODES,
  type CoreBlockName,
  type DocumentBlockRenderer,
  type DocumentRenderContext,
  type DocumentRenderInput,
  type DocumentRenderPort,
  type DocumentRenderResult,
  type DocumentTypeRegistration,
} from '@endora-commerce/contracts';
import { HttpError } from '@endora-commerce/platform/http';
import { rethrowIfModuleDisabled } from '@endora-commerce/platform/kernel';
import type { DocumentTypeRegistry } from '../registry/document-type-registry.js';
import type { BlockDeclarations } from '../services/block-declarations.js';
import type { LayoutCandidate, TemplateResolver } from '../services/template-resolver.js';
import { CORE_BLOCK_RENDERERS } from './core-blocks.js';
import { collectImageAssetIds, loadAssetImages, type AssetBytesReader } from './embed-asset-images.js';
import { interpolateMergeFields, type MergeFieldValues } from './merge-fields.js';
import { resolveRootProps, usableWidth } from './page.js';
import { pdfBytes } from './pdfmake.js';

/**
 * The Page Builder → pdfmake engine — the implementation of
 * `documentRenderPort` (`specs/152-compare-pdf-template/contracts/document-type-registry.md` §4).
 *
 * A host hands over its own data, built under its requester's context; the
 * engine chooses the layout (`TemplateResolver`), keeps of it only the blocks
 * the document type offers whose owner is present, runs the type's per-render
 * preparation once, renders each block, and lays the result out on the page
 * the type and the template describe. It never reads a host's data and never
 * fetches anything: images are assets-library bytes inlined before pdfmake
 * runs, and pdfmake's URL policy denies all.
 *
 * **Failure policy** (research R-17): a block's `render` throwing fails the
 * document with `DOCUMENT_RENDER_FAILED`, logged with the template, its version
 * and the block; a `ModuleDisabledError` is re-thrown untouched. A type whose
 * document must never fail on an enrichment absorbs that in its own
 * `prepareRender` (invoices' contributed blocks).
 */

const CORE = new Set<string>(CORE_BLOCK_NAMES);

export interface DocumentRendererDeps {
  readonly registry: DocumentTypeRegistry;
  readonly resolver: TemplateResolver;
  readonly declarations: BlockDeclarations;
  readonly assets: AssetBytesReader;
  readonly now?: () => Date;
  readonly log?: (message: string, context: Record<string, unknown>) => void;
}

/** What a definition was built from — the metadata half of a render result. */
export interface BuiltDocument {
  readonly definition: TDocumentDefinitions;
  readonly source: DocumentRenderResult['source'];
  readonly templateId: string | null;
  readonly templateVersion: number | null;
  readonly language: string;
  readonly requestedTemplateMissing: boolean;
}

interface PlacedNode {
  readonly type: string;
  readonly props: Readonly<Record<string, unknown>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a type's data shape is the host's.
type AnyRegistration = DocumentTypeRegistration<any, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above.
type AnyBlock = DocumentBlockRenderer<any, any>;

function nodesOf(tree: unknown): PlacedNode[] {
  const content = (tree as { content?: unknown } | null)?.content;
  if (!Array.isArray(content)) return [];
  const out: PlacedNode[] = [];
  for (const node of content as { type?: unknown; props?: unknown }[]) {
    if (typeof node?.type !== 'string') continue;
    const props =
      node.props && typeof node.props === 'object' && !Array.isArray(node.props)
        ? (node.props as Record<string, unknown>)
        : {};
    out.push({ type: node.type, props });
  }
  return out;
}

function rootPropsOf(tree: unknown): unknown {
  return (tree as { root?: { props?: unknown } } | null)?.root?.props;
}

/** Declared defaults under stored props; a stored `undefined` does not shadow a default. */
function mergeDefaults(
  defaults: Readonly<Record<string, unknown>>,
  stored: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(stored)) {
    if (value !== undefined || !(key in defaults)) merged[key] = value;
  }
  return merged;
}

export class DocumentRenderer implements DocumentRenderPort {
  private readonly now: () => Date;
  private readonly log: (message: string, context: Record<string, unknown>) => void;

  constructor(private readonly deps: DocumentRendererDeps) {
    this.now = deps.now ?? (() => new Date());
    this.log = deps.log ?? ((message, context) => console.error(message, context));
  }

  async render<TData>(input: DocumentRenderInput<TData>): Promise<DocumentRenderResult> {
    const built = await this.buildDefinition(input);
    let bytes: Uint8Array;
    try {
      bytes = await pdfBytes(built.definition);
    } catch (error) {
      rethrowIfModuleDisabled(error);
      this.log('[document_templates] pdfmake could not produce the document', {
        documentType: input.documentType,
        templateId: built.templateId,
        templateVersion: built.templateVersion,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new HttpError(503, ERROR_CODES.DOCUMENT_RENDER_FAILED, 'The document could not be produced.');
    }
    const { definition: _definition, ...meta } = built;
    return { bytes, ...meta };
  }

  /**
   * The pdfmake document definition of a document, without producing bytes —
   * what every test of the engine asserts on, because a definition can be
   * compared and a PDF cannot.
   */
  async buildDefinition<TData>(input: DocumentRenderInput<TData>): Promise<BuiltDocument> {
    const registration = this.deps.registry.get(input.documentType);
    if (!registration) {
      throw new HttpError(404, ERROR_CODES.DOCUMENT_TYPE_NOT_AVAILABLE, 'This document type is not available.', {
        documentType: input.documentType,
      });
    }

    const preview = input.preview === true || input.tree !== undefined;
    const blocks = new Map<string, AnyBlock>(
      this.deps.registry.blocks(input.documentType).map((block) => [block.name, block]),
    );
    const core = new Set<string>(this.deps.registry.coreBlocks(input.documentType));
    const renderable = (node: PlacedNode): boolean => blocks.has(node.type) || core.has(node.type);

    let candidates: readonly (LayoutCandidate | { source: 'canvas'; templateId: null; templateVersion: null; language: string; tree: unknown })[];
    let requestedTemplateMissing = false;
    if (input.tree !== undefined) {
      // The admin preview of an unsaved canvas: the canvas, and when it places
      // nothing printable, what a document of this type falls back to.
      candidates = [
        { source: 'canvas', templateId: null, templateVersion: null, language: input.language, tree: input.tree },
        ...(registration.renderBuiltIn
          ? []
          : (
              await this.deps.resolver.resolve({
                documentType: input.documentType,
                salesChannelId: null,
                language: input.language,
                selection: 'default_only',
                builtIn: registration.defaultContent(),
              })
            ).candidates.filter((candidate) => candidate.source === 'built_in')),
      ];
    } else {
      const resolved = await this.deps.resolver.resolve({
        documentType: input.documentType,
        salesChannelId: input.salesChannelId,
        language: input.language,
        selection: registration.selection,
        builtIn: registration.defaultContent(),
        ...(input.templateId !== undefined ? { templateId: input.templateId } : {}),
      });
      candidates = resolved.candidates;
      requestedTemplateMissing = resolved.requestedTemplateMissing;
    }

    const chosen = candidates.find((candidate) => nodesOf(candidate.tree).some(renderable)) ?? null;
    const placed = chosen ? nodesOf(chosen.tree).filter(renderable) : null;
    const language = chosen?.language ?? input.language;

    const root = resolveRootProps(chosen ? rootPropsOf(chosen.tree) : undefined, registration.pageDefaults);
    const orientation =
      root.orientation === 'auto'
        ? (registration.suggestOrientation?.(input.data) ?? 'portrait')
        : root.orientation;
    const context: DocumentRenderContext = {
      documentType: input.documentType,
      language,
      salesChannelId: input.salesChannelId,
      preview,
      pageWidth: usableWidth(root, orientation),
    };

    const prepared = registration.prepareRender
      ? await registration.prepareRender(input.data, {
          placedBlocks: placed ? new Set(placed.map((node) => node.type)) : null,
          preview,
        })
      : undefined;

    const variables: MergeFieldValues = {
      date: new Intl.DateTimeFormat(language, { dateStyle: 'long' }).format(this.now()),
      ...(registration.resolveVariables?.(input.data, context) ?? {}),
    };
    const interpolate = (text: string): string => interpolateMergeFields(text, variables);

    let content: Content[];
    if (placed) {
      const images = await loadAssetImages(
        collectImageAssetIds({ content: placed.filter((node) => node.type === 'document_templates.Image') }),
        this.deps.assets,
      );
      content = [];
      for (const node of placed) {
        const props = mergeDefaults(this.deps.declarations.defaultProps(node.type), node.props);
        content.push(
          await this.renderBlock(registration, node.type, chosen, () =>
            CORE.has(node.type)
              ? CORE_BLOCK_RENDERERS[node.type as CoreBlockName]({ props, interpolate, images, context })
              : blocks.get(node.type)!.render({
                  props,
                  data: input.data,
                  prepared,
                  language,
                  context,
                  interpolate,
                }),
          ),
        );
      }
    } else if (registration.renderBuiltIn) {
      const builtIn = registration.renderBuiltIn;
      content = (await this.renderBlock(registration, '<built-in>', null, () =>
        builtIn(input.data, prepared, context),
      )) as Content[];
    } else {
      this.log('[document_templates] no layout of this document type places anything printable', {
        documentType: input.documentType,
      });
      throw new HttpError(503, ERROR_CODES.DOCUMENT_RENDER_FAILED, 'The document has nothing to print.', {
        documentType: input.documentType,
      });
    }

    const definition: TDocumentDefinitions = {
      pageSize: root.pageSize,
      ...(orientation === 'landscape' ? { pageOrientation: 'landscape' as const } : {}),
      pageMargins: [root.marginLeft, root.marginTop, root.marginRight, root.marginBottom],
      defaultStyle: { fontSize: root.baseFontSize, font: 'Roboto' },
      ...(registration.pageDefaults?.styles
        ? { styles: structuredClone(registration.pageDefaults.styles) as TDocumentDefinitions['styles'] }
        : {}),
      content,
      ...this.headerAndFooter(root, variables),
    };

    return {
      definition,
      source: chosen ? chosen.source : 'built_in',
      templateId: chosen?.templateId ?? null,
      templateVersion: chosen?.templateVersion ?? null,
      language,
      requestedTemplateMissing,
    };
  }

  private async renderBlock(
    registration: AnyRegistration,
    blockName: string,
    candidate: { templateId: string | null; templateVersion: number | null } | null,
    render: () => unknown,
  ): Promise<Content> {
    try {
      return (await render()) as Content;
    } catch (error) {
      rethrowIfModuleDisabled(error);
      this.log('[document_templates] a block failed to render', {
        documentType: registration.code,
        templateId: candidate?.templateId ?? null,
        templateVersion: candidate?.templateVersion ?? null,
        blockName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new HttpError(503, ERROR_CODES.DOCUMENT_RENDER_FAILED, 'The document could not be produced.', {
        documentType: registration.code,
        blockName,
      });
    }
  }

  /** Repeating header and footer — only when they have something to say. */
  private headerAndFooter(
    root: ReturnType<typeof resolveRootProps>,
    variables: MergeFieldValues,
  ): Partial<Pick<TDocumentDefinitions, 'header' | 'footer'>> {
    const fontSize = Math.max(6, root.baseFontSize - 2);
    const margin: [number, number, number, number] = [root.marginLeft, 12, root.marginRight, 0];
    const text = (template: string, page: number, pages: number): string =>
      interpolateMergeFields(template, { ...variables, page: String(page), pages: String(pages) });
    const out: Partial<Pick<TDocumentDefinitions, 'header' | 'footer'>> = {};
    if (root.headerText.trim() !== '') {
      const headerText = root.headerText;
      out.header = (page: number, pages: number): Content => ({
        text: text(headerText, page, pages),
        fontSize,
        color: '#475569',
        margin,
      });
    }
    if (root.footerText.trim() !== '' || root.showPageNumbers) {
      const footerText = root.footerText;
      const numbers = root.showPageNumbers ? root.pageNumberFormat : '';
      out.footer = (page: number, pages: number): Content => ({
        columns: [
          { text: footerText.trim() === '' ? '' : text(footerText, page, pages), width: '*' },
          { text: numbers === '' ? '' : text(numbers, page, pages), width: 'auto', alignment: 'right' },
        ],
        fontSize,
        color: '#475569',
        margin,
      });
    }
    return out;
  }
}
