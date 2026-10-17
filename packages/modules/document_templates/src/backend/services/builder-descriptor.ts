import type {
  DocumentBuilderCategory,
  DocumentBuilderComponent,
  DocumentBuilderConfig,
  DocumentFieldDescriptor,
} from '@endora-commerce/contracts';
import type { DocumentTypeRegistry } from '../registry/document-type-registry.js';
import type { BlockDeclarations } from './block-declarations.js';

/**
 * The Page Builder descriptor of **one** document type
 * (`specs/152-compare-pdf-template/contracts/document-templates-api.md` route 3).
 *
 * Its components are exactly the type's palette (owner Q1): the type's own and
 * contributed blocks, then the Line items table when the type declares a line
 * collection (feature 153), then the core blocks it opts into. Each is described by
 * its declaring module's manifest — label key, category, default props and
 * fields — and, where no present manifest declares the block's fields, by the
 * renderer's own `describe()`, which is how a block another module contributes
 * to invoices (`ksef.InvoiceSection`) and invoices' own blocks are described.
 *
 * Categories are folded over the modules that own a component in them only, so
 * `cms`' `layout` section never names the document palette's.
 */

const PAGE_ROOT_FIELDS: Readonly<Record<string, DocumentFieldDescriptor>> = {
  pageSize: {
    type: 'select',
    label: 'Page size',
    options: [
      { label: 'A4', value: 'A4' },
      { label: 'Letter', value: 'LETTER' },
    ],
  },
  orientation: {
    type: 'select',
    label: 'Orientation',
    options: [
      { label: 'Automatic', value: 'auto' },
      { label: 'Portrait', value: 'portrait' },
      { label: 'Landscape', value: 'landscape' },
    ],
  },
  marginTop: { type: 'number', label: 'Margin top (pt)' },
  marginRight: { type: 'number', label: 'Margin right (pt)' },
  marginBottom: { type: 'number', label: 'Margin bottom (pt)' },
  marginLeft: { type: 'number', label: 'Margin left (pt)' },
  baseFontSize: { type: 'number', label: 'Base font size' },
  headerText: { type: 'textarea', label: 'Header text' },
  footerText: { type: 'textarea', label: 'Footer text' },
  showPageNumbers: {
    type: 'radio',
    label: 'Page numbers',
    options: [
      { label: 'Yes', value: true },
      { label: 'No', value: false },
    ],
  },
  pageNumberFormat: { type: 'text', label: 'Page number format' },
};

export function buildDocumentBuilderConfig(
  code: string,
  registry: DocumentTypeRegistry,
  declarations: BlockDeclarations,
): DocumentBuilderConfig {
  const components: DocumentBuilderComponent[] = [];
  const describe = (name: string, ownerModule: string, fallback?: { label: string; fields: Readonly<Record<string, DocumentFieldDescriptor>> }): DocumentBuilderComponent => {
    const declared = declarations.find(name);
    const declaredFields = declared?.fields ?? {};
    const fields =
      Object.keys(declaredFields).length > 0
        ? (declaredFields as Record<string, DocumentFieldDescriptor>)
        : { ...(fallback?.fields ?? {}) };
    return {
      name,
      ownerModule,
      ...(fallback?.label !== undefined ? { label: fallback.label } : {}),
      ...(declared?.labelKey !== undefined ? { labelKey: declared.labelKey } : {}),
      ...(declared?.descriptionKey !== undefined ? { descriptionKey: declared.descriptionKey } : {}),
      ...(declared?.category !== undefined ? { category: declared.category } : {}),
      ...(declared?.defaultProps !== undefined ? { defaultProps: { ...declared.defaultProps } } : {}),
      ...(declared?.weight !== undefined ? { weight: declared.weight } : {}),
      fields,
    };
  };

  for (const block of registry.blocks(code)) {
    components.push(describe(block.name, block.moduleId, block.describe?.()));
  }
  // Feature 153 — the facility's data-bound blocks, offered iff the type declares a collection.
  for (const name of registry.collectionBlocks(code)) {
    components.push(describe(name, 'document_templates'));
  }
  for (const name of registry.coreBlocks(code)) {
    components.push(describe(name, 'document_templates'));
  }

  const categories: DocumentBuilderCategory[] = [];
  const keys = [...new Set(components.map((c) => c.category).filter((k): k is string => k !== undefined))];
  const declared = declarations.categories();
  for (const key of keys) {
    const owners = new Set(components.filter((c) => c.category === key).map((c) => c.ownerModule));
    const candidates = declared
      .filter((category) => category.key === key && owners.has(category.ownerModule))
      .sort(
        (a, b) =>
          (a.weight ?? Number.MAX_SAFE_INTEGER) - (b.weight ?? Number.MAX_SAFE_INTEGER) ||
          a.ownerModule.localeCompare(b.ownerModule),
      );
    const winner = candidates[0];
    if (!winner) continue;
    categories.push({
      key,
      titleKey: winner.titleKey,
      ownerModule: winner.ownerModule,
      ...(winner.weight !== undefined ? { weight: winner.weight } : {}),
    });
  }

  return { schemaVersion: 1, components, categories, rootFields: { ...PAGE_ROOT_FIELDS } };
}
