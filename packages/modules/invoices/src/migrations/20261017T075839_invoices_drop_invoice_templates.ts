import { Migration } from '@mikro-orm/migrations';

/**
 * Drops `invoice_templates` (`specs/152-compare-pdf-template/`, owner answer P2).
 *
 * Invoice PDF layouts moved onto the `document_templates` facility: the
 * invoice document type's built-in layout replaced the seeded "generic"
 * template, and an operator designs further invoice templates in *Document
 * templates*. Nobody had custom invoice templates, so nothing is carried over —
 * the owner ruled the import out — and the table, which only this module ever
 * wrote, goes with its entity, service and routes.
 *
 * `down` recreates the empty table with the shape the module's first migration
 * gave it (the generic row the old code seeded at boot is not restored: that
 * code is gone).
 */
export class Migration20261017T075839InvoicesDropInvoiceTemplates extends Migration {
  override async up(): Promise<void> {
    this.addSql(`drop table if exists "invoice_templates";`);
  }

  override async down(): Promise<void> {
    this.addSql(`
      create table if not exists "invoice_templates" (
        "id" uuid not null,
        "code" varchar(180) not null,
        "name" varchar(200) not null,
        "sales_channel_id" uuid null,
        "content" jsonb not null,
        "languages" jsonb not null,
        "active" boolean not null default true,
        "is_system" boolean not null default false,
        "version" int not null default 1,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        constraint "invoice_templates_pkey" primary key ("id")
      );
    `);
    this.addSql(`create index if not exists "invoice_templates_code_idx" on "invoice_templates" ("code");`);
    this.addSql(
      `create index if not exists "invoice_templates_sales_channel_idx" on "invoice_templates" ("sales_channel_id");`,
    );
    this.addSql(
      `create unique index if not exists "invoice_templates_active_scope_uq" on "invoice_templates" ` +
        `(coalesce("sales_channel_id", '00000000-0000-0000-0000-000000000000')) where "active";`,
    );
  }
}
