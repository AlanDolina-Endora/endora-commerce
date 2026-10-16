import { Migration } from '@mikro-orm/migrations';

/**
 * Feature 148 — price list matrix entries (`price_list_matrix_entries`).
 *
 * One row prices a *selection* of products — a product, a category, an
 * attribute value, a category and an attribute value, or every product — for
 * an optional organization and a quantity window, at a fixed unit price or a
 * percentage off the reference price. Shape rules are CHECK constraints here
 * and Zod refinements in `@endora-commerce/contracts` (data-model §1, §3), so
 * a row the API would refuse cannot be written by any other path either.
 *
 * Foreign keys cascade: deleting the price list, or purging the product,
 * category or organization an entry names, removes the entry (spec FR-025). A
 * soft deletion leaves the row in place for the operator to decide on. The
 * attribute is addressed by key and has no foreign key — the key is what
 * `products.attribute_values` is keyed by, and its definition lives in a module
 * this one does not depend on (data-model §4).
 *
 * The FKs into `products`, `categories` and `organizations` are covered by the
 * existing `catalog` and `organizations` entries in this module's manifest
 * `dependencies`.
 */
export class Migration20261016T131148PriceListsPriceMatrixEntries extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "price_list_matrix_entries" (
      "id" uuid not null,
      "price_list_id" uuid not null,
      "product_id" uuid null,
      "category_id" uuid null,
      "attribute_key" varchar(64) null,
      "attribute_value" varchar(255) null,
      "organization_id" uuid null,
      "min_quantity" integer not null,
      "max_quantity" integer null,
      "price_type" varchar(16) not null,
      "amount" numeric(14,4) null,
      "currency_code" char(3) null,
      "discount_percent" numeric(5,2) null,
      "created_at" timestamptz not null,
      "updated_at" timestamptz not null,
      constraint "price_list_matrix_entries_pkey" primary key ("id"),
      constraint "price_list_matrix_entries_price_list_id_foreign"
        foreign key ("price_list_id") references "price_lists" ("id") on delete cascade,
      constraint "price_list_matrix_entries_product_id_foreign"
        foreign key ("product_id") references "products" ("id") on delete cascade,
      constraint "price_list_matrix_entries_category_id_foreign"
        foreign key ("category_id") references "categories" ("id") on delete cascade,
      constraint "price_list_matrix_entries_organization_id_foreign"
        foreign key ("organization_id") references "organizations" ("id") on delete cascade,
      constraint "price_list_matrix_entries_min_quantity_check" check ("min_quantity" >= 1),
      constraint "price_list_matrix_entries_max_quantity_check"
        check ("max_quantity" is null or "max_quantity" >= "min_quantity"),
      constraint "price_list_matrix_entries_attribute_pair_check"
        check (("attribute_key" is null) = ("attribute_value" is null)),
      constraint "price_list_matrix_entries_product_alone_check"
        check ("product_id" is null or ("category_id" is null and "attribute_key" is null)),
      constraint "price_list_matrix_entries_product_organization_check"
        check ("product_id" is null or "organization_id" is not null),
      constraint "price_list_matrix_entries_price_type_check"
        check ("price_type" in ('fixed', 'discount_percent')),
      constraint "price_list_matrix_entries_price_check" check (
        ("price_type" = 'fixed'
           and "amount" is not null and "amount" >= 0 and "currency_code" is not null
           and "discount_percent" is null
           and ("product_id" is not null or "category_id" is not null or "attribute_key" is not null))
        or
        ("price_type" = 'discount_percent'
           and "discount_percent" > 0 and "discount_percent" <= 100
           and "amount" is null and "currency_code" is null)
      )
    );`);
    this.addSql(
      `create index if not exists "price_list_matrix_entries_list_product_idx" on "price_list_matrix_entries" ("price_list_id", "product_id");`,
    );
    this.addSql(
      `create index if not exists "price_list_matrix_entries_list_org_idx" on "price_list_matrix_entries" ("price_list_id", "organization_id");`,
    );
    this.addSql(
      `create index if not exists "price_list_matrix_entries_product_idx" on "price_list_matrix_entries" ("product_id") where "product_id" is not null;`,
    );
    this.addSql(
      `create index if not exists "price_list_matrix_entries_category_idx" on "price_list_matrix_entries" ("category_id") where "category_id" is not null;`,
    );
    this.addSql(
      `create index if not exists "price_list_matrix_entries_organization_idx" on "price_list_matrix_entries" ("organization_id") where "organization_id" is not null;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "price_list_matrix_entries" cascade;`);
  }
}
