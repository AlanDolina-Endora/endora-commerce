import type { CSSProperties, ReactElement } from 'react';
import type { ComponentConfig, Config } from '@puckeditor/core';
import { createColorField } from '@endora-commerce/page-builder-core';
import { createImageAssetField } from '@endora-commerce/page-builder-admin';
import { itemsTableEditor } from './items-table/index.js';

/**
 * The canvas half of the six general-purpose document blocks
 * (`specs/152-compare-pdf-template/data-model.md` §4.1). The PDF is drawn on
 * the server by `document_templates`' engine; these renderers approximate it
 * on the canvas so an operator sees what a block holds. Fields and default
 * props are the manifest declaration's (served by the builder descriptor);
 * the entries below override the editor of a field where a better one exists
 * (a colour picker, the assets library) — `editorConfigFromDescriptor`'s rule.
 */

type Props = Record<string, unknown>;

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const flag = (v: unknown, fallback: boolean): boolean => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : fallback);
const align = (v: unknown): CSSProperties['textAlign'] => (v === 'center' || v === 'right' ? v : 'left');

const ALIGN_OPTIONS = [
  { label: 'Left', value: 'left' },
  { label: 'Centre', value: 'center' },
  { label: 'Right', value: 'right' },
];

const BOOL_OPTIONS = [
  { label: 'Yes', value: true },
  { label: 'No', value: false },
];

function Heading(props: Props): ReactElement {
  const level = num(props['level'], 1);
  const size = level === 3 ? 13 : level === 2 ? 16 : 20;
  return (
    <div
      style={{
        fontSize: size,
        fontWeight: 700,
        color: str(props['color'], '#111827'),
        textAlign: align(props['align']),
        margin: `${num(props['marginTop'], 0)}px 0 ${num(props['marginBottom'], 8)}px`,
      }}
    >
      {str(props['text'])}
    </div>
  );
}

function Text(props: Props): ReactElement {
  return (
    <p
      style={{
        whiteSpace: 'pre-wrap',
        fontSize: num(props['fontSize'], 10) + 2,
        color: str(props['color'], '#111827'),
        fontWeight: flag(props['bold'], false) ? 700 : 400,
        fontStyle: flag(props['italics'], false) ? 'italic' : 'normal',
        textAlign: align(props['align']),
        margin: `${num(props['marginTop'], 0)}px 0 ${num(props['marginBottom'], 6)}px`,
      }}
    >
      {str(props['text'])}
    </p>
  );
}

function Image(props: Props): ReactElement {
  const assetId = str(props['assetId']).trim();
  const width = num(props['width'], 120);
  const height = num(props['maxHeight'], 80);
  return (
    <div style={{ textAlign: align(props['align']), marginBottom: num(props['marginBottom'], 8) }}>
      <div
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width,
          height,
          border: '1px dashed #94a3b8',
          background: '#f8fafc',
          color: '#475569',
          fontSize: 11,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {assetId ? `${width} × ${height}` : '—'}
      </div>
    </div>
  );
}

function Spacer(props: Props): ReactElement {
  return <div aria-hidden="true" style={{ height: num(props['height'], 16) }} />;
}

function Divider(props: Props): ReactElement {
  const marginY = num(props['marginY'], 8);
  return (
    <div style={{ margin: `${marginY}px 0` }}>
      <div
        style={{
          width: `${Math.min(100, Math.max(1, num(props['widthPercent'], 100)))}%`,
          borderTop: `${num(props['thickness'], 1)}px ${props['style'] === 'dashed' ? 'dashed' : 'solid'} ${str(props['color'], '#cbd5e1')}`,
        }}
      />
    </div>
  );
}

function PageBreak(): ReactElement {
  return (
    <hr style={{ border: 0, borderTop: '2px dotted #94a3b8', margin: '12px 0' }} />
  );
}

/**
 * The six core blocks' canvas configs, and the Line items table's. `Config`-typed so the block-name estate
 * counts them as rendered; label, category, fields and defaults are composed
 * in by the editor from the served descriptor.
 */
export const coreBlockCanvas: Config = {
  components: {
    'document_templates.Heading': {
      render: Heading,
      fields: {
        color: createColorField({ label: 'Colour' }),
        level: { type: 'select', label: 'Level', options: [{ label: 'H1', value: 1 }, { label: 'H2', value: 2 }, { label: 'H3', value: 3 }] },
        align: { type: 'select', label: 'Alignment', options: ALIGN_OPTIONS },
      },
    } as ComponentConfig,
    'document_templates.Text': {
      render: Text,
      fields: {
        color: createColorField({ label: 'Colour' }),
        bold: { type: 'radio', label: 'Bold', options: BOOL_OPTIONS },
        italics: { type: 'radio', label: 'Italics', options: BOOL_OPTIONS },
        align: { type: 'select', label: 'Alignment', options: ALIGN_OPTIONS },
      },
    } as ComponentConfig,
    'document_templates.Image': {
      render: Image,
      fields: {
        assetId: createImageAssetField('Image'),
        align: { type: 'select', label: 'Alignment', options: ALIGN_OPTIONS },
      },
    } as ComponentConfig,
    'document_templates.Spacer': { render: Spacer } as ComponentConfig,
    'document_templates.Divider': {
      render: Divider,
      fields: { color: createColorField({ label: 'Colour' }) },
    } as ComponentConfig,
    'document_templates.PageBreak': { render: PageBreak } as ComponentConfig,
    // Feature 153 — the Line items table: its canvas and the editors of its
    // columns, detail row, totals and grouping.
    'document_templates.ItemsTable': itemsTableEditor,
  },
};
