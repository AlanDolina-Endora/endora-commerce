import { Migration } from '@mikro-orm/migrations';

/**
 * Feature 146 (US1, research R1) — the reference price of a quote request line.
 *
 * Three nullable columns on `quote_request_items`: the net unit price the
 * request's owner would have paid for the line on the request's channel when it
 * was captured (or the cart line's unit price on conversion), its currency and
 * the capture time. A line with all three `null` has no stored reference and is
 * shown with the current price instead.
 *
 * The check constraint holds them all-or-none, so a reference can never be read
 * without its currency or its capture time. No backfill: an existing line simply
 * has no stored reference.
 */
export class Migration20261014T115049QuoteRequestsItemReferencePrice extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      'alter table "quote_request_items" ' +
        'add column "reference_unit_price" numeric(12,2) null, ' +
        'add column "reference_currency" varchar(3) null, ' +
        'add column "reference_captured_at" timestamptz null;',
    );
    this.addSql(
      'alter table "quote_request_items" add constraint "quote_request_items_reference_all_or_none" check (' +
        '("reference_unit_price" is null and "reference_currency" is null and "reference_captured_at" is null) or ' +
        '("reference_unit_price" is not null and "reference_currency" is not null and "reference_captured_at" is not null));',
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      'alter table "quote_request_items" drop constraint if exists "quote_request_items_reference_all_or_none";',
    );
    this.addSql(
      'alter table "quote_request_items" ' +
        'drop column if exists "reference_captured_at", ' +
        'drop column if exists "reference_currency", ' +
        'drop column if exists "reference_unit_price";',
    );
  }
}
