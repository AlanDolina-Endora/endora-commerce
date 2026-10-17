import type { ModuleContext } from '@endora-commerce/platform/kernel';
import { DocumentTemplateImport } from './entities/document-template-import.entity.js';
import { DocumentTemplate } from './entities/document-template.entity.js';

/**
 * `document_templates` — the document-template facility
 * (`specs/152-compare-pdf-template/`). Composition is filled in by the tasks
 * that follow the scaffold.
 */
export function registerModule(_ctx: ModuleContext): void {
  // Composed below as the facility's services land.
}

/** The module's persisted entity classes (D-168). */
export const entities = [DocumentTemplate, DocumentTemplateImport];
