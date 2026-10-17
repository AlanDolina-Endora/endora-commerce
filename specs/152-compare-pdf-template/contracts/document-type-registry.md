# Contract: document types, blocks and the render port

**Normative for**: `document_templates` (host of the facility) and every module contributing a document
type — in this feature `comparisons`; later `quote_requests` (research R-22).
**Types live in**: `packages/contracts/src/document-templates.ts` (Principle II — before any route).
**Container names**: `documentTypeRegistry` (ungated contribution registry), `documentRenderPort`
(gated port). Owner of both: `document_templates`.

## 1. Vocabulary

- **Document type code** — `<moduleId>.<snake_name>`, regex `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$`,
  ≤ 120 chars. The owner segment MUST be the registering module's id. Permanent: persisted in
  `document_templates.document_type`.
- **Core block** — a block owned by `document_templates`, offered to every document type.
- **Host block** — a block owned by the module that registers the document type, offered only to the
  types that list it.

## 2. `DocumentTypeRegistration<TData>`

```ts
export interface DocumentTypeRegistration<TData = unknown> {
  /** `<moduleId>.<snake_name>` — permanent. */
  readonly code: string;
  /** The registering module. While it is not present, the type is invisible and unrenderable. */
  readonly moduleId: string;
  /** Module-relative i18n keys, resolved in `moduleId`'s namespace. */
  readonly labelKey: string;
  readonly descriptionKey?: string;

  /** Host blocks this type offers, in palette order. Each name MUST be declared in `moduleId`'s
   *  manifest `blocks` with `contexts` containing `'document'`. */
  readonly blocks: readonly DocumentBlockRenderer<TData>[];

  /** Merge fields beyond the core ones (§5). Keys: `^[a-z][A-Za-z0-9]*$`. */
  readonly variables?: readonly { readonly key: string; readonly labelKey: string }[];
  resolveVariables?(data: TData, context: DocumentRenderContext): Readonly<Record<string, string | null>>;

  /** The built-in layout: per-language trees (at least `en-US`, and `pl-PL` for first-party types).
   *  MUST validate against `documentTemplateContentSchema`. Returned fresh on every call. */
  defaultContent(): DocumentTemplateContent;

  /** Sample data for the editor canvas and the preview. JSON-serialisable; MUST contain no real
   *  customer, organisation or product data. */
  sampleData(language: string): TData;

  /** Orientation when the root prop is `'auto'`. Defaults to `'portrait'`. */
  suggestOrientation?(data: TData): 'portrait' | 'landscape';
}

export interface DocumentBlockRenderer<TData = unknown> {
  /** `<moduleId>.<LocalName>`, `blockNameRe`, owner segment = registration `moduleId`. */
  readonly name: string;
  /**
   * One pdfmake content node (typed `unknown` here: `contracts` acquires no pdfmake dependency).
   * `props` are the stored props merged over the manifest's `defaultProps`; untrusted — coerce.
   * MAY be async (images). MUST NOT read anything but its arguments and the host's own services.
   */
  render(input: {
    readonly props: Readonly<Record<string, unknown>>;
    readonly data: TData;
    readonly language: string;
    readonly context: DocumentRenderContext;
    /** Interpolates `{{key}}` with the render's merge fields (§5). */
    readonly interpolate: (text: string) => string;
  }): unknown | Promise<unknown>;
}

export interface DocumentRenderContext {
  readonly documentType: string;
  readonly language: string;          // the tree's language actually used
  readonly salesChannelId: string | null;
  readonly preview: boolean;          // true for the admin preview with sample data
  readonly pageWidth: number;         // usable width in pt after margins and orientation
}
```

## 3. `DocumentTypeRegistryPort` (`documentTypeRegistry`)

```ts
export interface DocumentTypeRegistryPort {
  register(registration: DocumentTypeRegistration): void;
}
```

Rules, each enforced by the registry with a thrown error at boot (a registration bug is a deploy bug):

1. `code`'s owner segment and every host block name's owner segment equal `moduleId`.
2. `moduleId !== 'document_templates'`; core block names are not contributable.
3. A second registration of one `code` from a different object is refused
   (`DocumentTypeConflictError`); the identical object twice is accepted.
4. `defaultContent()` is validated once at registration.

Behaviour:

- **Ungated**, plain `ctx.di.register` in `document_templates` (D-39 contribution registry). A host
  pushes from a **contribution-only** `ctx.onBoot` hook that does **not** probe presence
  (`specs/conventions/module-activation.md` § boot hooks). If `document_templates` is not composed,
  the platform drops the push (`packages/platform/src/kernel/contribution-sinks.ts`).
- Every read (`list`, `find`) filters by `effectiveState.isPresent(registration.moduleId)`, on every
  call — no restart on a flip.
- Host manifest: `nonBindingDependencies: [{ moduleId: 'document_templates', name:
  'documentTypeRegistry', kind: 'contributes-to', reason: '…' }]`.

## 4. `DocumentRenderPort` (`documentRenderPort`)

```ts
export interface DocumentRenderPort {
  render<TData>(input: {
    readonly documentType: string;
    readonly salesChannelId: string | null; // the request's resolved channel; null only for preview
    readonly language: string;              // the reader's language (host-resolved)
    readonly data: TData;
  }): Promise<DocumentRenderResult>;
}

export interface DocumentRenderResult {
  readonly bytes: Uint8Array;               // application/pdf
  readonly source: 'template' | 'built_in';
  readonly templateId: string | null;
  readonly templateVersion: number | null;
  readonly language: string;                // tree language actually used
}
```

- **Gated**: `ctx.di.providePort('documentRenderPort', …)`; a caller with the module off gets
  `ModuleDisabledError` (503). Hosts MUST probe `effectiveState.isPresent('document_templates')`
  **before** resolving and take their own fallback — never `catch` it
  (`specs/conventions/module-composition.md` item 7). Host manifest entry: `kind:
  'degrades-without'`, `name: 'documentRenderPort'`, `whenAbsent` describing the fallback.
- Unknown or absent `documentType` → `DocumentTypeNotAvailableError` (404 `DOCUMENT_TYPE_NOT_AVAILABLE`).
- **Template resolution** (FR-031): active row with `sales_channel_id = salesChannelId` (skipped when
  null) → active row with `sales_channel_id is null` → `defaultContent()`. One read, one snapshot:
  the row is read once and rendered from that object (FR-034).
- **Language** (FR-032): tree keys tried exact → same primary subtag → `en-US` → `en` → first key.
- **Renderable** = a node whose `type` is a core block, or a host block listed by this type's
  registration whose module is present. Others are skipped, props untouched. A tree with zero
  renderable nodes → the next candidate in the resolution order (the built-in layout last).
- **Failure**: a host `render` that throws → `DocumentRenderError` (503 `DOCUMENT_RENDER_FAILED`)
  carrying `{ templateId, version, blockName }` for the log; `ModuleDisabledError` passes through
  untouched. Core image failures never throw (block omitted).

## 5. Merge fields

- Syntax `{{key}}`, key `^[a-z][A-Za-z0-9]*$`, no whitespace inside braces, no nesting, no escaping.
- Core keys: `date` (render date, `Intl.DateTimeFormat(language, { dateStyle: 'long' })`); in root
  `headerText`/`footerText`/`pageNumberFormat` only: `page`, `pages`.
- Host keys: `resolveVariables(data, context)`; `null` → empty string.
- Unknown key → printed verbatim, braces included. Values are plain text (no markup).

## 6. Reserved extension — blocks contributed into another host's type (not built)

For a future invoices adapter (KSeF block, research R-4) the port will gain, additively:

```ts
registerBlock(block: DocumentBlockRenderer & { moduleId: string; documentTypes: readonly string[] }): void;
```

with the invoice registry's rules (own namespace, conflict refused, skipped while its contributor is
absent). Nothing in §2–§5 may be changed in a way that prevents this.

## 7. Tests owed by this contract

- Registry: rules 1–4, presence filter both ways, identical-object idempotence (`document-type-registry.test.ts`).
- Port: resolution order incl. "nothing renderable" fall-through, language chain, skip of absent
  owner's block with props preserved, throw → `DOCUMENT_RENDER_FAILED`, `ModuleDisabledError`
  re-thrown, single-snapshot read, channel-B template never used for channel A, null channel never
  matches a channel row.
- A fixture document type registered by a test-only module, end to end (US5, SC-007).
