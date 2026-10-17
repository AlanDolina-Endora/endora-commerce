import { z } from 'zod';
import { blockCategoryKeyRe, blockNameRe } from './cms.js';
import { uuidSchema } from './common.js';

/**
 * Document templates — operator-designed Page Builder layouts for the PDF
 * documents the platform produces (`specs/152-compare-pdf-template/`).
 *
 * The facility is owned by the `document_templates` module. A **document type**
 * is contributed by the module that owns the document's data — `comparisons`
 * (the storefront comparison PDF) and `invoices` (the invoice PDF) in feature
 * 152 — through the `documentTypeRegistry` contribution registry, and a host
 * produces a document through the gated `documentRenderPort`, handing over its
 * own data. The facility stores templates opaquely and never interprets a
 * host's data (Constitution XIV).
 *
 * Normative: `specs/152-compare-pdf-template/contracts/document-type-registry.md`
 * (registry, port, hooks) and `contracts/document-templates-api.md` (admin HTTP).
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** `<moduleId>.<snake_name>` — permanent, persisted in `document_templates.document_type`. */
export const documentTypeCodeRe = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
export const documentTypeCodeSchema = z.string().max(120).regex(documentTypeCodeRe);

/** A language key of a template's content: `pl`, `pl-PL`, `en-US`. */
export const documentLanguageRe = /^[a-z]{2,3}(-[A-Z]{2})?$/;

/** A merge-field key, written `{{key}}` in a text. */
export const mergeFieldKeyRe = /^[a-z][A-Za-z0-9]*$/;

/** The general-purpose blocks the facility owns; a document type opts into them. */
export const CORE_BLOCK_NAMES = [
  'document_templates.Heading',
  'document_templates.Text',
  'document_templates.Image',
  'document_templates.Spacer',
  'document_templates.Divider',
  'document_templates.PageBreak',
] as const;
export type CoreBlockName = (typeof CORE_BLOCK_NAMES)[number];

/** Limits a saved template is held to (research R-20). The legacy import bypasses them. */
export const DOCUMENT_TEMPLATE_LIMITS = {
  maxNodesPerLanguage: 200,
  maxLanguages: 10,
  maxStringLength: 5_000,
  maxCoreImagesPerLanguage: 20,
  maxContentBytes: 512 * 1024,
} as const;

/** Whether a person may pick a template for an individual document (owner Q2). */
export const documentSelectionSchema = z.enum(['default_only', 'per_document']);
export type DocumentSelection = z.infer<typeof documentSelectionSchema>;

/** Which core blocks a document type offers. */
export const documentCoreBlocksSchema = z.union([
  z.literal('all'),
  z.literal('none'),
  z.array(z.enum(CORE_BLOCK_NAMES)),
]);
export type DocumentCoreBlocks = 'all' | 'none' | readonly CoreBlockName[];

// ---------------------------------------------------------------------------
// Content — the per-language Page Builder envelope (data-model.md §3)
// ---------------------------------------------------------------------------

const pageMarginSchema = z.number().min(0).max(144);

/**
 * Root props of one language's tree. Every key optional: the type's
 * `pageDefaults` fill what is absent. Unknown keys are kept (Puck may store
 * its own root props), the documented ones are range-checked.
 */
export const documentRootPropsSchema = z
  .object({
    pageSize: z.enum(['A4', 'LETTER']).optional(),
    orientation: z.enum(['auto', 'portrait', 'landscape']).optional(),
    marginTop: pageMarginSchema.optional(),
    marginRight: pageMarginSchema.optional(),
    marginBottom: pageMarginSchema.optional(),
    marginLeft: pageMarginSchema.optional(),
    baseFontSize: z.number().min(6).max(18).optional(),
    headerText: z.string().max(500).optional(),
    footerText: z.string().max(500).optional(),
    showPageNumbers: z.boolean().optional(),
    pageNumberFormat: z.string().max(50).optional(),
  })
  .passthrough();
export type DocumentRootProps = z.infer<typeof documentRootPropsSchema>;

/** The complete root props a render uses after `pageDefaults` were applied. */
export interface ResolvedDocumentRootProps {
  readonly pageSize: 'A4' | 'LETTER';
  readonly orientation: 'auto' | 'portrait' | 'landscape';
  readonly marginTop: number;
  readonly marginRight: number;
  readonly marginBottom: number;
  readonly marginLeft: number;
  readonly baseFontSize: number;
  readonly headerText: string;
  readonly footerText: string;
  readonly showPageNumbers: boolean;
  readonly pageNumberFormat: string;
}

/** The generic page defaults (data-model.md §3.1). */
export const GENERIC_DOCUMENT_PAGE_DEFAULTS: ResolvedDocumentRootProps = {
  pageSize: 'A4',
  orientation: 'auto',
  marginTop: 40,
  marginRight: 32,
  marginBottom: 40,
  marginLeft: 32,
  baseFontSize: 10,
  headerText: '',
  footerText: '',
  showPageNumbers: false,
  pageNumberFormat: '{{page}} / {{pages}}',
};

function longestStringViolation(value: unknown, limit: number, depth = 0): boolean {
  if (depth > 32) return true;
  if (typeof value === 'string') return value.length > limit;
  if (Array.isArray(value)) return value.some((item) => longestStringViolation(item, limit, depth + 1));
  if (value !== null && typeof value === 'object') {
    return Object.values(value).some((item) => longestStringViolation(item, limit, depth + 1));
  }
  return false;
}

/** One placed block. Props are kept as entered; the facility never interprets them. */
export const documentTemplateNodeSchema = z
  .object({
    type: z.string().regex(blockNameRe),
    props: z.record(z.string(), z.unknown()).default({}),
  })
  .passthrough()
  .superRefine((node, ctx) => {
    if (longestStringViolation(node.props, DOCUMENT_TEMPLATE_LIMITS.maxStringLength)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['props'],
        message: `A text in this block is longer than ${DOCUMENT_TEMPLATE_LIMITS.maxStringLength} characters.`,
        params: { limit: 'maxStringLength' },
      });
    }
  });
export type DocumentTemplateNode = z.infer<typeof documentTemplateNodeSchema>;

/** One language's Puck tree. */
export const documentTemplateTreeSchema = z
  .object({
    root: z
      .object({ props: documentRootPropsSchema.default({}) })
      .passthrough()
      .default({ props: {} }),
    content: z.array(documentTemplateNodeSchema).max(DOCUMENT_TEMPLATE_LIMITS.maxNodesPerLanguage),
    zones: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()
  .superRefine((tree, ctx) => {
    if (tree.zones && Object.keys(tree.zones).length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['zones'],
        message: 'Nested layouts are not supported in document templates.',
      });
    }
    const images = tree.content.filter((node) => node.type === 'document_templates.Image').length;
    if (images > DOCUMENT_TEMPLATE_LIMITS.maxCoreImagesPerLanguage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content'],
        message: `A template may place at most ${DOCUMENT_TEMPLATE_LIMITS.maxCoreImagesPerLanguage} images per language.`,
        params: { limit: 'maxCoreImagesPerLanguage' },
      });
    }
  });
export type DocumentTemplateTree = z.infer<typeof documentTemplateTreeSchema>;

/** `{ schemaVersion: 1, languages: { <lang>: <tree> } }`. */
export const documentTemplateContentSchema = z
  .object({
    schemaVersion: z.literal(1),
    languages: z.record(z.string().regex(documentLanguageRe), documentTemplateTreeSchema),
  })
  .superRefine((content, ctx) => {
    const count = Object.keys(content.languages).length;
    if (count < 1 || count > DOCUMENT_TEMPLATE_LIMITS.maxLanguages) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['languages'],
        message: `A template holds 1 to ${DOCUMENT_TEMPLATE_LIMITS.maxLanguages} languages.`,
        params: { limit: 'maxLanguages' },
      });
    }
    if (documentContentByteSize(content) > DOCUMENT_TEMPLATE_LIMITS.maxContentBytes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: `A template's content may not exceed ${DOCUMENT_TEMPLATE_LIMITS.maxContentBytes / 1024} KiB.`,
        params: { limit: 'maxContentBytes' },
      });
    }
  });
export type DocumentTemplateContent = z.infer<typeof documentTemplateContentSchema>;

/** Serialized UTF-8 size of a content envelope, the measure of the 512 KiB limit. */
export function documentContentByteSize(content: unknown): number {
  // Counted by hand: this package compiles with neither the DOM nor the Node
  // library, so `TextEncoder` and `Buffer` are both out of reach.
  const text = JSON.stringify(content) ?? '';
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Document types — what a host registers (document-type-registry.md §2)
// ---------------------------------------------------------------------------

/** Where a template is applied when a document is produced. */
export interface DocumentRenderContext {
  readonly documentType: string;
  /** The tree language actually used. */
  readonly language: string;
  readonly salesChannelId: string | null;
  readonly preview: boolean;
  /** Usable width in points after margins and orientation. */
  readonly pageWidth: number;
}

/** One configurable field of a block, as the builder descriptor serves it. */
export const documentFieldDescriptorSchema = z.object({
  type: z.enum([
    'text',
    'textarea',
    'number',
    'select',
    'radio',
    'color',
    'array',
    'object',
    'external',
    'uuid',
    'richtext',
  ]),
  label: z.string().optional(),
  required: z.boolean().optional(),
  options: z
    .array(z.object({ label: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) }))
    .optional(),
  refKind: z.string().optional(),
});
export type DocumentFieldDescriptor = z.infer<typeof documentFieldDescriptorSchema>;

/** A host block's renderer. */
export interface DocumentBlockRenderer<TData = unknown, TPrepared = unknown> {
  /** `blockNameRe`; the owner segment is `moduleId`. */
  readonly name: string;
  /** Presence-filtered by this id on every call. */
  readonly moduleId: string;
  /** Label and fields when no present manifest declares the block's fields (contributed blocks). */
  describe?(): {
    readonly label: string;
    readonly fields: Readonly<Record<string, DocumentFieldDescriptor>>;
  };
  /** One pdfmake content node. `props` are untrusted stored props over declared `defaultProps`. */
  render(input: {
    readonly props: Readonly<Record<string, unknown>>;
    readonly data: TData;
    readonly prepared: TPrepared;
    readonly language: string;
    readonly context: DocumentRenderContext;
    readonly interpolate: (text: string) => string;
  }): unknown;
}

/** A former host-owned template, read by the host for the one-time import (research R-24). */
export const legacyTemplateRecordSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  salesChannelId: uuidSchema.nullable(),
  languages: z.record(z.string(), z.unknown()),
  isDefault: z.boolean(),
  version: z.number().int().positive(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export interface LegacyTemplateRecord {
  readonly id: string;
  readonly name: string;
  readonly salesChannelId: string | null;
  readonly languages: Readonly<Record<string, unknown>>;
  readonly isDefault: boolean;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Root-prop defaults merged under stored root props, plus non-editable pdfmake styles. */
export type DocumentPageDefaults = Partial<ResolvedDocumentRootProps> & {
  readonly styles?: Readonly<Record<string, unknown>>;
};

export interface DocumentTypeRegistration<TData = unknown, TPrepared = unknown> {
  readonly code: string;
  readonly moduleId: string;
  /** Module-relative i18n key. */
  readonly labelKey: string;
  readonly descriptionKey?: string;

  /** The type's blocks at this moment — called per read and per render. */
  blocks(): readonly DocumentBlockRenderer<TData, TPrepared>[];
  readonly coreBlocks: DocumentCoreBlocks;

  readonly selection: DocumentSelection;
  /** Languages a template may hold; absent = every active content language. */
  readonly languages?: readonly string[];

  readonly variables?: readonly { readonly key: string; readonly labelKey: string }[];
  resolveVariables?(
    data: TData,
    context: DocumentRenderContext,
  ): Readonly<Record<string, string | null>>;

  /** The built-in layout, per language. A fresh object per call. */
  defaultContent(): DocumentTemplateContent;
  /** Code layout used when no candidate tree renders anything. */
  renderBuiltIn?(data: TData, prepared: TPrepared, context: DocumentRenderContext): unknown[];

  readonly pageDefaults?: DocumentPageDefaults;
  suggestOrientation?(data: TData): 'portrait' | 'landscape';

  /** Per-render precomputation handed to every block. */
  prepareRender?(
    data: TData,
    input: { readonly placedBlocks: ReadonlySet<string> | null; readonly preview: boolean },
  ): Promise<TPrepared>;

  /** Fictitious, JSON-serialisable sample for the editor and the preview. */
  sampleData(language: string): TData;

  /** One-time import of templates from a former host-owned location. */
  readonly legacyImport?: {
    readonly source: string;
    read(): Promise<readonly LegacyTemplateRecord[]>;
    /** Runs before the import commits; a throw rolls the import back. */
    afterImport?(): Promise<void>;
  };
}

/** Container name: `documentTypeRegistry`. Owner: `document_templates`. Ungated. */
export interface DocumentTypeRegistryPort {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a registry holds types of different data shapes.
  register(registration: DocumentTypeRegistration<any, any>): void;
}

// ---------------------------------------------------------------------------
// Rendering (document-type-registry.md §4)
// ---------------------------------------------------------------------------

export interface DocumentRenderInput<TData = unknown> {
  readonly documentType: string;
  /** The document's channel; `null` only for previews and channel-less documents. */
  readonly salesChannelId: string | null;
  readonly language: string;
  readonly data: TData;
  /** Only for `selection: 'per_document'` types. */
  readonly templateId?: string;
  /** An unsaved canvas (the admin preview). Facility-internal. */
  readonly tree?: unknown;
  /** Render as a preview (enrichments may be skipped by the type). */
  readonly preview?: boolean;
}

export interface DocumentRenderResult {
  readonly bytes: Uint8Array;
  readonly source: 'explicit' | 'default' | 'built_in' | 'canvas';
  readonly templateId: string | null;
  readonly templateVersion: number | null;
  readonly language: string;
  readonly requestedTemplateMissing: boolean;
}

/** Container name: `documentRenderPort`. Owner: `document_templates`. Gated. */
export interface DocumentRenderPort {
  render<TData>(input: DocumentRenderInput<TData>): Promise<DocumentRenderResult>;
}

// ---------------------------------------------------------------------------
// Admin API DTOs (document-templates-api.md)
// ---------------------------------------------------------------------------

export const documentTypeSummarySchema = z.object({
  code: documentTypeCodeSchema,
  moduleId: z.string(),
  labelKey: z.string(),
  descriptionKey: z.string().optional(),
  selection: documentSelectionSchema,
  templateCount: z.number().int().nonnegative(),
});
export type DocumentTypeSummary = z.infer<typeof documentTypeSummarySchema>;

export const documentVariableSchema = z.object({
  key: z.string().regex(mergeFieldKeyRe),
  labelKey: z.string(),
  ownerModule: z.string(),
  scope: z.enum(['body', 'headerFooter']),
});
export type DocumentVariable = z.infer<typeof documentVariableSchema>;

export const documentTypeDetailSchema = documentTypeSummarySchema.extend({
  /** `null` = every active content language. */
  languages: z.array(z.string()).nullable(),
  variables: z.array(documentVariableSchema),
  sample: z.unknown(),
  builtInContent: documentTemplateContentSchema,
  pageDefaults: documentRootPropsSchema,
});
export type DocumentTypeDetail = z.infer<typeof documentTypeDetailSchema>;

export const documentBuilderComponentSchema = z.object({
  name: z.string().regex(blockNameRe),
  ownerModule: z.string(),
  /** Plain label, when the block is described by its renderer rather than declared. */
  label: z.string().optional(),
  labelKey: z.string().optional(),
  descriptionKey: z.string().optional(),
  category: z.string().regex(blockCategoryKeyRe).optional(),
  fields: z.record(z.string(), documentFieldDescriptorSchema),
  defaultProps: z.record(z.string(), z.unknown()).optional(),
  weight: z.number().int().optional(),
});
export type DocumentBuilderComponent = z.infer<typeof documentBuilderComponentSchema>;

export const documentBuilderCategorySchema = z.object({
  key: z.string().regex(blockCategoryKeyRe),
  titleKey: z.string(),
  ownerModule: z.string(),
  weight: z.number().int().optional(),
});
export type DocumentBuilderCategory = z.infer<typeof documentBuilderCategorySchema>;

/** Route 3 — the Page Builder descriptor of one document type: exactly its palette. */
export const documentBuilderConfigSchema = z.object({
  schemaVersion: z.literal(1),
  components: z.array(documentBuilderComponentSchema),
  categories: z.array(documentBuilderCategorySchema),
  rootFields: z.record(z.string(), documentFieldDescriptorSchema),
});
export type DocumentBuilderConfig = z.infer<typeof documentBuilderConfigSchema>;

export const documentTemplateSummarySchema = z.object({
  id: uuidSchema,
  documentType: documentTypeCodeSchema,
  name: z.string(),
  salesChannelId: uuidSchema.nullable(),
  salesChannelName: z.string().nullable(),
  languages: z.array(z.string()),
  isDefault: z.boolean(),
  version: z.number().int().positive(),
  updatedAt: z.string().datetime(),
});
export type DocumentTemplateSummary = z.infer<typeof documentTemplateSummarySchema>;

export const documentTemplateDetailSchema = documentTemplateSummarySchema.extend({
  /** Kept as stored: an imported legacy template may exceed the save-time limits. */
  content: z.object({ schemaVersion: z.literal(1), languages: z.record(z.string(), z.unknown()) }),
});
export type DocumentTemplateDetail = z.infer<typeof documentTemplateDetailSchema>;

export const documentTemplateListQuerySchema = z.object({
  type: documentTypeCodeSchema,
  /** `<uuid>` or `global` — one scope. */
  salesChannelId: z.union([uuidSchema, z.literal('global')]).optional(),
  /** Global ∪ this channel — the per-document picker (research R-23). */
  applicableToChannel: uuidSchema.optional(),
});
export type DocumentTemplateListQuery = z.infer<typeof documentTemplateListQuerySchema>;

export const createDocumentTemplateBodySchema = z.object({
  documentType: documentTypeCodeSchema,
  name: z.string().trim().min(1).max(200),
  salesChannelId: uuidSchema.nullable(),
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('built_in') }),
    z.object({ kind: z.literal('template'), templateId: uuidSchema }),
  ]),
  setDefault: z.boolean().default(false),
});
export type CreateDocumentTemplateBody = z.infer<typeof createDocumentTemplateBodySchema>;

export const renameDocumentTemplateBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  expectedVersion: z.number().int(),
});
export type RenameDocumentTemplateBody = z.infer<typeof renameDocumentTemplateBodySchema>;

export const saveDocumentTemplateContentBodySchema = z.object({
  tree: z.unknown(),
  expectedVersion: z.number().int(),
});
export type SaveDocumentTemplateContentBody = z.infer<typeof saveDocumentTemplateContentBodySchema>;

export const versionedBodySchema = z.object({ expectedVersion: z.number().int() });
export type VersionedBody = z.infer<typeof versionedBodySchema>;

export const deleteDocumentTemplateBodySchema = versionedBodySchema.extend({
  confirmDefault: z.boolean().default(false),
});
export type DeleteDocumentTemplateBody = z.infer<typeof deleteDocumentTemplateBodySchema>;

export const previewDocumentBodySchema = z.object({
  documentType: documentTypeCodeSchema,
  language: z.string().regex(documentLanguageRe),
  tree: z.unknown(),
});
export type PreviewDocumentBody = z.infer<typeof previewDocumentBodySchema>;
