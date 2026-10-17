import { Migration } from '@mikro-orm/migrations';

/**
 * The document-template facility's storage (`specs/152-compare-pdf-template/`,
 * `data-model.md` §1–§2).
 *
 * `document_templates` holds one row per operator-designed template: its
 * document type (opaque here, matched only against registrations), its scope —
 * all sales channels (`null`) or one — whether it is the default of that scope,
 * a version for optimistic concurrency, and the per-language Page Builder
 * content. The partial unique index is the "at most one default per type and
 * scope" rule held by the schema (FR-005); the global scope is keyed as the
 * all-zero uuid so `null` takes part in it. A channel's templates go with the
 * channel (`on delete cascade` to the kernel-owned `sales_channels`).
 *
 * `document_template_imports` records that a document type's templates were
 * imported from a former host-owned location — the invoice templates — so the
 * import happens once per installation and never resurrects a template an
 * operator deleted afterwards (FR-082, research R-24). No row is seeded and no
 * other module's table is read or written here: the import runs at runtime,
 * through the host's own reader.
 */
export class Migration20261017T071754DocumentTemplatesInit extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "document_templates" (
        "id" uuid not null,
        "document_type" varchar(120) not null,
        "name" varchar(200) not null,
        "sales_channel_id" uuid null,
        "content" jsonb not null,
        "is_default" boolean not null default false,
        "version" integer not null default 1,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "document_templates_pkey" primary key ("id"),
        constraint "document_templates_document_type_chk"
          check ("document_type" ~ '^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$'),
        constraint "document_templates_sales_channel_id_fkey"
          foreign key ("sales_channel_id") references "sales_channels" ("id") on delete cascade
      );
    `);
    this.addSql(
      `create index "document_templates_type_scope_idx" on "document_templates" ("document_type", "sales_channel_id");`,
    );
    this.addSql(`
      create unique index "document_templates_one_default_per_scope_uq"
        on "document_templates" (
          "document_type",
          coalesce("sales_channel_id", '00000000-0000-0000-0000-000000000000'::uuid)
        )
        where "is_default";
    `);
    this.addSql(`
      create table "document_template_imports" (
        "document_type" varchar(120) not null,
        "source" varchar(120) not null,
        "imported_count" integer not null,
        "skipped_count" integer not null,
        "report" jsonb not null,
        "imported_at" timestamptz not null,
        constraint "document_template_imports_pkey" primary key ("document_type", "source")
      );
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "document_template_imports";`);
    this.addSql(`drop table if exists "document_templates";`);
  }
}
