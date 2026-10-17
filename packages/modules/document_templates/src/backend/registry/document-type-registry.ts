import {
  COLLECTION_BLOCK_NAMES,
  CORE_BLOCK_NAMES,
  DOCUMENT_POSITION_FIELD,
  ITEMS_TABLE_BLOCK_NAME,
  blockNameRe,
  documentCollectionKeyRe,
  documentFieldPathRe,
  isReservedFieldPath,
  itemsTablePropsSchema,
  documentCoreBlocksSchema,
  documentLanguageRe,
  documentTemplateContentSchema,
  documentTypeCodeRe,
  mergeFieldKeyRe,
  type CollectionBlockName,
  type CoreBlockName,
  type DocumentBlockRenderer,
  type DocumentCollectionDeclaration,
  type DocumentFieldDefinition,
  type DocumentTypeRegistration,
  type DocumentTypeRegistryPort,
} from '@endora-commerce/contracts';

/** A registration this registry refuses — a boot error naming the contributor. */
export class DocumentTypeRegistrationError extends Error {
  constructor(code: string, reason: string) {
    super(`documentTypeRegistry: document type "${code}" — ${reason}`);
    this.name = 'DocumentTypeRegistrationError';
  }
}

const CORE = new Set<string>(CORE_BLOCK_NAMES);
const FACILITY_DATA_BLOCKS = new Set<string>(COLLECTION_BLOCK_NAMES);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as below.
type AnyCollection = DocumentCollectionDeclaration<any>;

/** The facility's *Position* label, per primary language subtag (153 contract §1). */
const POSITION_LABELS: Readonly<Record<string, string>> = { en: 'No.', pl: 'Lp.' };

function positionField(language: string): DocumentFieldDefinition {
  const primary = language.split('-')[0]?.toLowerCase() ?? 'en';
  return {
    path: DOCUMENT_POSITION_FIELD,
    label: POSITION_LABELS[primary] ?? POSITION_LABELS['en']!,
    valueKind: 'number',
    group: 'line',
    audience: 'customer',
    defaultFormat: { decimals: 0 },
    defaultAlign: 'right',
  };
}

/** What a collection offers for one language: its fields (position first) and its totals. */
export interface CollectionCatalogue {
  readonly fields: readonly DocumentFieldDefinition[];
  readonly summaryFields: readonly DocumentFieldDefinition[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a registry holds types of different data shapes.
type AnyRegistration = DocumentTypeRegistration<any, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above.
type AnyBlock = DocumentBlockRenderer<any, any>;

/**
 * The document types hosts contribute
 * (`specs/152-compare-pdf-template/contracts/document-type-registry.md` §3).
 *
 * **A contribution registry and a plain `di.register`** — the
 * `adminSearchProviderRegistry` idiom. A host pushes its type from a
 * contribution-only boot hook whatever this module's effective state is, so a
 * `providePort` gate here would stop the backend from starting while document
 * templates are switched off.
 *
 * **The policy it states: a type, and a single contributed block, are
 * answered only while their module is present.** Presence is read on every
 * call, so switching a host off removes its type from every screen and render
 * with no restart and deletes nothing; switching it back on restores it.
 *
 * Two kinds of refusal, on purpose:
 *  - **at registration** (a thrown error, so a boot fails naming the
 *    contributor): a code whose owner segment is not the registering module, a
 *    type registered under this module's own id, a second different
 *    registration for one code, an invalid built-in layout, a `coreBlocks`
 *    naming a non-core block, a language or merge-field key outside its
 *    grammar;
 *  - **per call of `blocks()`** (the block dropped and logged once, the type
 *    kept): a block whose owner segment is not its `moduleId`, a core block
 *    name, two blocks with one name. A host's block list may come from another
 *    module's contributions (invoices' contributed PDF blocks), so one wrong
 *    entry must not cost the document every other block.
 */
export class DocumentTypeRegistry implements DocumentTypeRegistryPort {
  private readonly registrations = new Map<string, AnyRegistration>();
  private readonly loggedRefusals = new Set<string>();

  constructor(
    private readonly isModulePresent: (moduleId: string) => boolean = () => true,
    private readonly log: (message: string, context: Record<string, unknown>) => void = (message, context) =>
      console.warn(message, context),
  ) {}

  register(registration: AnyRegistration): void {
    const { code, moduleId } = registration;
    if (!documentTypeCodeRe.test(code) || code.length > 120) {
      throw new DocumentTypeRegistrationError(code, 'the code is not `<module>.<snake_name>`.');
    }
    if (moduleId === 'document_templates') {
      throw new DocumentTypeRegistrationError(code, 'the facility registers no document type of its own.');
    }
    if (code.slice(0, code.indexOf('.')) !== moduleId) {
      throw new DocumentTypeRegistrationError(code, `its owner segment is not the registering module "${moduleId}".`);
    }
    const existing = this.registrations.get(code);
    if (existing) {
      if (existing === registration) return;
      throw new DocumentTypeRegistrationError(code, 'is already registered by a different registration.');
    }
    if (!documentCoreBlocksSchema.safeParse(registration.coreBlocks).success) {
      throw new DocumentTypeRegistrationError(code, '`coreBlocks` names a block that is not a core block.');
    }
    for (const language of registration.languages ?? []) {
      if (!documentLanguageRe.test(language)) {
        throw new DocumentTypeRegistrationError(code, `language "${language}" is not a language code.`);
      }
    }
    for (const variable of registration.variables ?? []) {
      if (!mergeFieldKeyRe.test(variable.key)) {
        throw new DocumentTypeRegistrationError(code, `merge field "${variable.key}" is not a valid key.`);
      }
    }
    const collectionKeys = new Set<string>();
    for (const collection of registration.collections ?? []) {
      if (!documentCollectionKeyRe.test(collection.key) || collection.key.length > 60) {
        throw new DocumentTypeRegistrationError(code, `collection key "${collection.key}" is not a valid key.`);
      }
      if (collectionKeys.has(collection.key)) {
        throw new DocumentTypeRegistrationError(code, `collection "${collection.key}" is declared twice.`);
      }
      collectionKeys.add(collection.key);
    }
    const builtIn = documentTemplateContentSchema.safeParse(registration.defaultContent());
    if (!builtIn.success) {
      throw new DocumentTypeRegistrationError(
        code,
        `its built-in layout is invalid: ${builtIn.error.issues.map((issue) => issue.message).join('; ')}`,
      );
    }
    for (const [language, tree] of Object.entries(builtIn.data.languages)) {
      for (const node of tree.content) {
        if (node.type !== ITEMS_TABLE_BLOCK_NAME) continue;
        const props = itemsTablePropsSchema.safeParse(node.props);
        if (!props.success) {
          throw new DocumentTypeRegistrationError(
            code,
            `its built-in layout (${language}) places a Line items table with invalid settings: ${props.error.issues
              .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
              .join('; ')}`,
          );
        }
        const wanted = props.data.collection ?? registration.collections?.[0]?.key;
        if (wanted === undefined || !collectionKeys.has(wanted)) {
          throw new DocumentTypeRegistrationError(
            code,
            `its built-in layout (${language}) places a Line items table bound to a collection the type does not declare.`,
          );
        }
      }
    }
    this.registrations.set(code, registration);
  }

  /** The registration of a present type, or `undefined`. */
  get(code: string): AnyRegistration | undefined {
    const registration = this.registrations.get(code);
    return registration && this.isModulePresent(registration.moduleId) ? registration : undefined;
  }

  /** Every present type, in registration order. */
  list(): AnyRegistration[] {
    return [...this.registrations.values()].filter((registration) =>
      this.isModulePresent(registration.moduleId),
    );
  }

  /** The present type's own and contributed blocks at this moment, refusals dropped. */
  blocks(code: string): AnyBlock[] {
    const registration = this.get(code);
    if (!registration) return [];
    const seen = new Set<string>();
    const out: AnyBlock[] = [];
    for (const candidate of registration.blocks()) {
      const name = candidate.name;
      let refusal: string | null = null;
      if (!blockNameRe.test(name) || name.slice(0, name.indexOf('.')) !== candidate.moduleId) {
        refusal = 'its owner segment is not its module';
      } else if (CORE.has(name) || FACILITY_DATA_BLOCKS.has(name)) {
        refusal = 'it is a block name the facility owns';
      } else if (seen.has(name)) {
        refusal = 'a block of that name is already offered';
      }
      if (refusal !== null) {
        this.refuseOnce(code, name, candidate.moduleId, refusal);
        continue;
      }
      seen.add(name);
      if (!this.isModulePresent(candidate.moduleId)) continue;
      out.push(candidate);
    }
    return out;
  }

  /** The core blocks a present type opts into, in the facility's order. */
  coreBlocks(code: string): CoreBlockName[] {
    const registration = this.get(code);
    if (!registration || registration.coreBlocks === 'none') return [];
    if (registration.coreBlocks === 'all') return [...CORE_BLOCK_NAMES];
    const wanted = new Set<string>(registration.coreBlocks);
    return CORE_BLOCK_NAMES.filter((name) => wanted.has(name));
  }

  /** The line collections a present type declares (feature 153). */
  collections(code: string): AnyCollection[] {
    return [...(this.get(code)?.collections ?? [])];
  }

  /** The facility's data-bound blocks a present type is offered: the Line items table iff it declares a collection. */
  collectionBlocks(code: string): CollectionBlockName[] {
    return this.collections(code).length > 0 ? [...COLLECTION_BLOCK_NAMES] : [];
  }

  /**
   * The names a template of this type may place — its blocks, the Line items
   * table when it declares a collection (153), and the core blocks it opts into
   * (owner Q1). The descriptor, the editor, save-time validation (FR-019) and
   * the renderer all derive from this one list.
   */
  palette(code: string): Set<string> {
    return new Set([
      ...this.blocks(code).map((block) => block.name),
      ...this.collectionBlocks(code),
      ...this.coreBlocks(code),
    ]);
  }

  /**
   * One collection's catalogue for a language (153 contract §1): the facility's
   * *Position* first, then the host's fields with the per-call refusals applied
   * — a path outside the grammar, in a reserved family, or offered twice is
   * dropped and logged once. A `fields()` that rejects answers an empty host
   * catalogue for this call (logged): the document still renders and its
   * columns print their empty text.
   */
  async catalogue(code: string, key: string, language: string): Promise<CollectionCatalogue> {
    const collection = this.collections(code).find((candidate) => candidate.key === key);
    if (!collection) return { fields: [], summaryFields: [] };
    const fields = await this.readFields(code, key, 'fields', () => collection.fields(language));
    const summaryFields = collection.summaryFields
      ? await this.readFields(code, key, 'summaryFields', () => collection.summaryFields!(language))
      : [];
    return { fields: [positionField(language), ...fields], summaryFields };
  }

  private async readFields(
    code: string,
    key: string,
    member: 'fields' | 'summaryFields',
    read: () => Promise<readonly DocumentFieldDefinition[]>,
  ): Promise<DocumentFieldDefinition[]> {
    let declared: readonly DocumentFieldDefinition[];
    try {
      declared = await read();
    } catch (error) {
      this.log('[document_templates] a collection catalogue could not be read', {
        documentType: code,
        collection: key,
        member,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
    const seen = new Set<string>();
    const out: DocumentFieldDefinition[] = [];
    for (const field of Array.isArray(declared) ? declared : []) {
      const path = typeof field?.path === 'string' ? field.path : String(field?.path);
      let refusal: string | null = null;
      if (!documentFieldPathRe.test(path)) refusal = 'its path is not a field path';
      else if (isReservedFieldPath(path)) refusal = 'its path is in a reserved family';
      else if (seen.has(path)) refusal = 'a field with that path is already offered';
      if (refusal !== null) {
        this.refuseOnce(code, `${key}:${path}`, member, refusal, 'a collection field was refused');
        continue;
      }
      seen.add(path);
      out.push(field);
    }
    return out;
  }

  private refuseOnce(
    code: string,
    name: string,
    moduleId: string,
    reason: string,
    message = 'a contributed document block was refused',
  ): void {
    const key = `${code}\u0000${name}\u0000${moduleId}\u0000${reason}`;
    if (this.loggedRefusals.has(key)) return;
    this.loggedRefusals.add(key);
    this.log(`[document_templates] ${message}`, {
      documentType: code,
      block: name,
      moduleId,
      reason,
    });
  }
}
