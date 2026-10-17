import type { DocumentTypeRegistration, DocumentTypeRegistryPort } from '@endora-commerce/contracts';
import type { BackendServerHandle } from '../../helpers/test-server.js';

/**
 * A test-only document type (`specs/152-compare-pdf-template/` US6, T064,
 * SC-007): the shape the quote-request PDF will take — per-document template
 * selection, one block of its own, one core block — registered by a test
 * through the public registry and touching no file of the facility.
 *
 * It is registered **under `quote_requests`' id** because the registry answers
 * a type only while its module is present, and an id no manifest declares is
 * never present. That module is the type's future owner, so the off-state cases
 * switch it off and on.
 */
export const FIXTURE_DOCUMENT_TYPE = 'quote_requests.fixture_note';
export const FIXTURE_BLOCK = 'quote_requests.FixtureNote';

export interface FixtureNoteData {
  readonly title: string;
}

export function fixtureDocumentType(): DocumentTypeRegistration<FixtureNoteData> {
  return {
    code: FIXTURE_DOCUMENT_TYPE,
    moduleId: 'quote_requests',
    labelKey: 'documentTypes.fixtureNote.label',
    blocks: () => [
      {
        name: FIXTURE_BLOCK,
        moduleId: 'quote_requests',
        describe: () => ({ label: 'Fixture note', fields: { caption: { type: 'text', label: 'Caption' } } }),
        render: ({ props, data, interpolate }) => ({
          text: `${interpolate(String(props['caption'] ?? 'Note'))}: ${data.title}`,
        }),
      },
    ],
    coreBlocks: ['document_templates.Text'],
    selection: 'per_document',
    languages: ['en-US', 'pl-PL'],
    variables: [{ key: 'title', labelKey: 'documentTypes.fixtureNote.variables.title' }],
    resolveVariables: (data) => ({ title: data.title }),
    defaultContent: () => ({
      schemaVersion: 1,
      languages: {
        'en-US': {
          root: { props: {} },
          content: [{ type: FIXTURE_BLOCK, props: { id: 'n', caption: 'Built-in note' } }],
        },
      },
    }),
    sampleData: () => ({ title: 'Sample note' }),
  };
}

/** Register the fixture type into a composed server's registry (idempotent per registration object). */
const registered = new WeakMap<object, DocumentTypeRegistration<FixtureNoteData>>();
export function registerFixtureDocumentType(h: BackendServerHandle): void {
  const registry = h.container.resolve('documentTypeRegistry') as DocumentTypeRegistryPort;
  let registration = registered.get(registry);
  if (!registration) {
    registration = fixtureDocumentType();
    registered.set(registry, registration);
  }
  registry.register(registration);
}
