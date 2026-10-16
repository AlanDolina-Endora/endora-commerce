import { Migration } from '@mikro-orm/migrations';

/**
 * Saved views on the admin Quote Request list (`specs/147-saved-views/`, US3) —
 * one row per named preset of the list's filters, sort and visible columns,
 * owned by an admin user and optionally shared with every admin who opens the
 * list.
 *
 * No foreign key to `admin_users`: a view outlives its owner's access and its
 * owner, as the order list's views do, and the reference would be a
 * cross-module one. `sort` and `visible_columns` are nullable: `null` means the
 * list's default sort and default-visible columns.
 *
 * The unique expression index is the duplicate-name rule (FR-022) held by the
 * schema: one owner has no two views whose names share `lower(name)`. Names are
 * stored trimmed by the service, so `lower(name)` is the same key the service
 * probes with `lower(btrim(name))`. The index leads with the owner, so it also
 * serves the owner lookup and no separate owner index is created.
 *
 * Switching `quote_requests` off leaves these rows untouched (FR-018).
 */
export class Migration20261014T173236QuoteRequestsQuoteRequestListSavedViews extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "quote_request_list_saved_views" (
        "id" uuid not null,
        "owner_admin_user_id" uuid not null,
        "name" varchar(160) not null,
        "shared" boolean not null default false,
        "filters" jsonb not null default '{}'::jsonb,
        "sort" jsonb null,
        "visible_columns" jsonb null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        constraint "quote_request_list_saved_views_pkey" primary key ("id")
      );
    `);
    this.addSql(
      `create unique index "quote_request_list_saved_views_owner_name_key_uq" on "quote_request_list_saved_views" ("owner_admin_user_id", lower("name"));`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "quote_request_list_saved_views";`);
  }
}
