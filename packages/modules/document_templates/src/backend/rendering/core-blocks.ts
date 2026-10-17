import type { CoreBlockName, DocumentRenderContext } from '@endora-commerce/contracts';
import { align, bool, color, num, oneOf, str, type Props } from './props.js';

/**
 * The six general-purpose blocks the facility owns
 * (`specs/152-compare-pdf-template/data-model.md` §4.1). A document type
 * offers them only if it opts in (`coreBlocks`); the comparison does, invoices
 * do not.
 *
 * Each answers one pdfmake content node from untrusted props: numbers are
 * clamped to the editor's ranges, colours must be hex, and an image is an
 * assets-library id already inlined by `embed-asset-images.ts`.
 */

export interface CoreBlockInput {
  readonly props: Props;
  readonly interpolate: (text: string) => string;
  /** Asset id → `data:` URI, for the images this render loaded. */
  readonly images: ReadonlyMap<string, string>;
  readonly context: DocumentRenderContext;
}

type CoreBlockRenderer = (input: CoreBlockInput) => Record<string, unknown>;

const HEADING_SIZES: Record<number, number> = { 1: 20, 2: 16, 3: 13 };

function margins(props: Props, top: number, bottom: number): [number, number, number, number] {
  return [0, num(props, 'marginTop', top, 0, 144), 0, num(props, 'marginBottom', bottom, 0, 144)];
}

export const CORE_BLOCK_RENDERERS: Record<CoreBlockName, CoreBlockRenderer> = {
  'document_templates.Heading': ({ props, interpolate }) => {
    const rawLevel = num(props, 'level', 1);
    const level = rawLevel === 2 || rawLevel === 3 ? rawLevel : 1;
    return {
      text: interpolate(str(props, 'text', '')),
      fontSize: HEADING_SIZES[level],
      bold: true,
      color: color(props, 'color', '#111827'),
      alignment: align(props, 'align', 'left'),
      margin: margins(props, 0, 8),
    };
  },

  'document_templates.Text': ({ props, interpolate }) => ({
    text: interpolate(str(props, 'text', '')),
    fontSize: num(props, 'fontSize', 10, 6, 36),
    color: color(props, 'color', '#111827'),
    bold: bool(props, 'bold', false),
    italics: bool(props, 'italics', false),
    alignment: align(props, 'align', 'left'),
    margin: margins(props, 0, 6),
  }),

  'document_templates.Image': ({ props, images, context }) => {
    const raw = props['assetId'];
    const assetId = typeof raw === 'string' ? raw.trim() : '';
    const dataUri = assetId ? images.get(assetId) : undefined;
    if (!dataUri) return { text: '' };
    const width = num(props, 'width', 120, 8, Math.max(8, context.pageWidth));
    const maxHeight = num(props, 'maxHeight', 80, 8, 600);
    return {
      image: dataUri,
      fit: [width, maxHeight],
      alignment: align(props, 'align', 'left'),
      margin: [0, 0, 0, num(props, 'marginBottom', 8, 0, 144)],
    };
  },

  'document_templates.Spacer': ({ props }) => ({
    text: '',
    margin: [0, 0, 0, num(props, 'height', 16, 0, 400)],
  }),

  'document_templates.Divider': ({ props, context }) => {
    const widthPercent = num(props, 'widthPercent', 100, 1, 100);
    const thickness = num(props, 'thickness', 1, 0.25, 10);
    const marginY = num(props, 'marginY', 8, 0, 144);
    const dashed = oneOf(props, 'style', ['solid', 'dashed'] as const, 'solid') === 'dashed';
    return {
      canvas: [
        {
          type: 'line',
          x1: 0,
          y1: 0,
          x2: Math.round((context.pageWidth * widthPercent) / 100),
          y2: 0,
          lineWidth: thickness,
          lineColor: color(props, 'color', '#cbd5e1'),
          ...(dashed ? { dash: { length: 4 } } : {}),
        },
      ],
      margin: [0, marginY, 0, marginY],
    };
  },

  'document_templates.PageBreak': () => ({ text: '', pageBreak: 'after' }),
};
