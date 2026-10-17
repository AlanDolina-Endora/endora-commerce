import {
  CORE_BLOCK_NAMES,
  blockNameRe,
  documentCoreBlocksSchema,
  documentLanguageRe,
  documentTemplateContentSchema,
  documentTypeCodeRe,
  mergeFieldKeyRe,
  type CoreBlockName,
  type DocumentBlockRenderer,
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
    const builtIn = documentTemplateContentSchema.safeParse(registration.defaultContent());
    if (!builtIn.success) {
      throw new DocumentTypeRegistrationError(
        code,
        `its built-in layout is invalid: ${builtIn.error.issues.map((issue) => issue.message).join('; ')}`,
      );
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
      } else if (CORE.has(name)) {
        refusal = 'it is a core block name';
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

  /**
   * The names a template of this type may place — exactly its blocks plus the
   * core blocks it opts into (owner Q1). The descriptor, the editor, save-time
   * validation (FR-019) and the renderer all derive from this one list.
   */
  palette(code: string): Set<string> {
    return new Set([...this.blocks(code).map((block) => block.name), ...this.coreBlocks(code)]);
  }

  private refuseOnce(code: string, name: string, moduleId: string, reason: string): void {
    const key = `${code}\u0000${name}\u0000${moduleId}\u0000${reason}`;
    if (this.loggedRefusals.has(key)) return;
    this.loggedRefusals.add(key);
    this.log('[document_templates] a contributed document block was refused', {
      documentType: code,
      block: name,
      moduleId,
      reason,
    });
  }
}
