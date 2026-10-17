import { Entity, PrimaryKey, Property } from '@mikro-orm/core';
import { GlobalEntity } from '@endora-commerce/platform/tenancy';

/**
 * The record that one document type's templates were imported from a former
 * host-owned location (`data-model.md` §2, research R-24). The primary key is
 * what makes the import happen once per installation: the marker, not the
 * rows, decides — so a template an operator deleted after the import never
 * comes back.
 */
@GlobalEntity()
@Entity({ tableName: 'document_template_imports' })
export class DocumentTemplateImport {
  @PrimaryKey({ type: 'string', length: 120 })
  documentType!: string;

  @PrimaryKey({ type: 'string', length: 120 })
  source!: string;

  @Property({ type: 'integer' })
  importedCount!: number;

  @Property({ type: 'integer' })
  skippedCount!: number;

  @Property({ type: 'json' })
  report!: Record<string, unknown>;

  @Property({ type: 'datetime' })
  importedAt!: Date;
}
