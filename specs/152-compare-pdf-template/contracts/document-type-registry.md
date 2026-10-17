# Contract: document types, their blocks, and the render port

**Normative for**: `document_templates` (host of the facility) and every module contributing a document
type — in this feature `comparisons` and `invoices`; later `quote_requests` (research R-22).
**Types live in**: `packages/contracts/src/document-templates.ts` (Principle II — before any route).
**Container names**: `documentTypeRegistry` (ungated contribution registry), `documentRenderPort`
(gated port). Owner of both: `document_templates`.

## 1. Vocabulary

- **Document type code** — `<moduleId>.<snake_name>`, `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$`, ≤ 120
  chars; owner segment = the registering module. Permanent (persisted).
- **Core block** — owned by `document_templates`: `document_templates.{Heading,Text,Image,Spacer,
  Divider,PageBreak}`. Offered only to types that opt in.
- **Type block** — a block the type offers: the host's own, or one another module contributes to the
  host's type through a host-owned seam (invoices' `invoicePdfBlockRegistry`). **A type's palette is
  exactly its type blocks plus the core blocks it opts into** (owner Q1).

## 2. `DocumentTypeRegistration<TData>`

```ts
export type CoreBlockName =
  'document_templates.Heading' | 'document_templates.Text' | 'document_templates.Image' |
  'document_templates.Spacer' | 'document_templates.Divider' | 'document_templates.PageBreak';

export interface DocumentTypeRegistration<TData = unknown, TPrepared = unknown> {
  readonly code: string;
  readonly moduleId: string;
  readonly labelKey: string;                 // module-relative i18n key
  readonly descriptionKey?: string;

  /** The type's blocks at this moment (called per read/render — contributors come and go). */
  blocks(): readonly DocumentBlockRenderer<TData, TPrepared>[];
  /** Which core blocks the type offers. */
  readonly coreBlocks: 'all' | 'none' | readonly CoreBlockName[];

  /** Per-document selection (owner Q2). */
  readonly selection: 'default_only' | 'per_document';
  /** Languages a template of this type may hold; absent = every active content language. */
  readonly languages?: readonly string[];

  readonly variables?: readonly { readonly key: string; readonly labelKey: string }[];
  resolveVariables?(data: TData, context: DocumentRenderContext): Readonly<Record<string, string | null>>;

  /** Built-in layout tree, per language. Validated at registration. Fresh object per call. */
  defaultContent(): DocumentTemplateContent;
  /** Code layout used when no candidate tree renders anything. Absent = an empty document is refused. */
  renderBuiltIn?(data: TData, prepared: TPrepared, context: DocumentRenderContext): unknown[];

  /** Root-prop defaults merged under stored root props, plus non-editable pdfmake styles. */
  readonly pageDefaults?: Partial<DocumentRootProps> & { readonly styles?: Readonly<Record<string, unknown>> };
  suggestOrientation?(data: TData): 'portrait' | 'landscape';

  /** Per-render precomputation handed to every block (images, contributor data, flags). */
  prepareRender?(data: TData, input: { readonly placedBlocks: ReadonlySet<string> | null;
                                       readonly preview: boolean }): Promise<TPrepared>;

  sampleData(language: string): TData;      // JSON-serialisable, fictitious

  /** One-time import of templates from a former host-owned location (research R-24). */
  readonly legacyImport?: {
    readonly source: string;                 // e.g. 'invoice_templates'
    read(): Promise<readonly LegacyTemplateRecord[]>;
    afterImport?(): Promise<void>;           // runs before the import commits; a throw rolls it back
  };
}

export interface DocumentBlockRenderer<TData = unknown, TPrepared = unknown> {
  readonly name: string;                     // blockNameRe; owner segment = moduleId
  readonly moduleId: string;                 // presence-filtered by this id on every call
  /** Label + fields when no present manifest declares `name` (contributed invoice blocks). */
  describe?(): { readonly label: string; readonly fields: Readonly<Record<string, unknown>> };
  render(input: {
    readonly props: Readonly<Record<string, unknown>>;  // stored props over declared defaultProps; untrusted
    readonly data: TData;
    readonly prepared: TPrepared;
    readonly language: string;
    readonly context: DocumentRenderContext;
    readonly interpolate: (text: string) => string;
  }): unknown | Promise<unknown>;            // one pdfmake content node
}

export interface DocumentRenderContext {
  readonly documentType: string;
  readonly language: string;                 // tree language actually used
  readonly salesChannelId: string | null;
  readonly preview: boolean;
  readonly pageWidth: number;                // usable pt after margins and orientation
}

export interface LegacyTemplateRecord {
  readonly id: string; readonly name: string; readonly salesChannelId: string | null;
  readonly languages: Readonly<Record<string, unknown>>;
  readonly isDefault: boolean; readonly version: number;
  readonly createdAt: Date; readonly updatedAt: Date;
}
```

## 3. `DocumentTypeRegistryPort` (`documentTypeRegistry`)

```ts
export interface DocumentTypeRegistryPort { register(registration: DocumentTypeRegistration): void; }
```

Refused at registration (boot error): `code` owner ≠ `moduleId`; `moduleId === 'document_templates'`; a
second, different registration for one `code`; an invalid `defaultContent()`; `coreBlocks` naming a
non-core block. Refused **per call** of `blocks()` (block dropped, logged once): a block whose owner
segment ≠ its `moduleId`, a core block name, two blocks with one name.

Ungated `ctx.di.register`; hosts push from a **contribution-only** boot hook without a presence probe;
an uncomposed facility drops the push (`packages/platform/src/kernel/contribution-sinks.ts`). Reads
filter types by `effectiveState.isPresent(moduleId)` and blocks by their own `moduleId`, on every call.

## 4. `DocumentRenderPort` (`documentRenderPort`)

```ts
export interface DocumentRenderPort {
  render<TData>(input: {
    readonly documentType: string;
    readonly salesChannelId: string | null;  // the document's channel; null only for previews
    readonly language: string;
    readonly data: TData;
    readonly templateId?: string;            // only for selection: 'per_document'
    readonly tree?: unknown;                 // admin preview of an unsaved canvas (facility-internal)
  }): Promise<DocumentRenderResult>;
}

export interface DocumentRenderResult {
  readonly bytes: Uint8Array;
  readonly source: 'explicit' | 'default' | 'built_in';
  readonly templateId: string | null;
  readonly templateVersion: number | null;
  readonly language: string;
  readonly requestedTemplateMissing: boolean;
}
```

- **Gated**. Hosts that degrade probe `effectiveState.isPresent('document_templates')` first and never
  `catch` `ModuleDisabledError` (`module-composition.md` item 7). Hosts that bind (invoices, research
  R-27) resolve it directly.
- Before anything: `ensureImported(documentType)` (research R-24).
- **Explicit template** (`templateId`): type `default_only` → `DOCUMENT_TEMPLATE_NOT_SELECTABLE`; row of
  another type, or scoped to a channel ≠ `salesChannelId` → `DOCUMENT_TEMPLATE_NOT_SELECTABLE`; missing →
  fall through to default resolution with `requestedTemplateMissing: true`.
- **Default resolution** (FR-031): default of `salesChannelId` (skipped when null) → global default →
  `defaultContent()` → `renderBuiltIn()`. A candidate whose chosen-language tree has zero renderable
  nodes is skipped. One row read, rendered from that object (FR-034).
- **Language**: exact → same primary subtag → `en-US` → `en` → first key.
- **Renderable node**: its `type` is in the type's palette (§1) and its owner is present. Others are
  skipped; stored props untouched.
- **Page**: `pageDefaults` ← stored root props; `orientation: 'auto'` → `suggestOrientation(data)`, else
  `'portrait'`; header/footer only when non-empty; no pdfmake `info` unless the type sets it.
- **Failure**: a block `render` throwing → `DOCUMENT_RENDER_FAILED` (503) with `{ templateId, version,
  blockName }` logged; `ModuleDisabledError` re-thrown untouched. A type that must never fail on an
  enrichment absorbs it in its own `prepareRender` (invoices, research R-17).
- pdfmake URL policy: deny all. Fonts: bundled Roboto.

## 5. Merge fields

`{{key}}`, key `^[a-z][A-Za-z0-9]*$`. Core: `date`; in root header/footer/page-number format: `page`,
`pages`. Host: `resolveVariables`. Known-but-null → empty; unknown → verbatim. Plain text.

## 6. Import execution context

`ensureImported` runs the `document_template.import` Command under `enterSystemScope('document
templates legacy import', …)` at boot and `withSystemScope('document templates legacy import', …)` when
triggered lazily inside a request — the actor is the system, never the buyer or administrator whose
request happened to trigger it (Principle XIII, D-285).

## 7. Tests owed

- Registry: every refusal of §3; presence filter of types and of individual blocks both ways.
- Port: explicit-template rules (not selectable / wrong type / wrong channel / missing → fallback);
  default resolution incl. nothing-renderable fall-through to `renderBuiltIn`; language chain; skip of
  absent-owner blocks with props preserved; palette restriction (a block of another type is skipped at
  render and refused at save); failure policy; single snapshot; channel-B never used for A.
- Import: once (marker), concurrent runs, deleted template not resurrected, unknown channel skipped and
  reported, `afterImport` failure rolls back and retries, system actor in the audit row.
- A fixture type with `selection: 'per_document'` registered by a test-only module (US6, SC-007).
