import { Migration } from '@mikro-orm/migrations';

/**
 * `push_notification_preferences` — a customer account's account-wide choice of
 * which automatic push categories it wants (`specs/149-pwa-order-status-push/`,
 * data-model §1).
 *
 * One row per account (`customer_account_id` unique). **No row means both
 * categories on**, so nothing is backfilled and nothing is seeded: an existing
 * subscriber keeps receiving order pushes after the upgrade, exactly as before.
 *
 * `organization_id` is stamped from the owning account at every write (the
 * D-187 pattern `push_subscriptions` follows) and is `not null`: a preference
 * always names an account, and every account has an organisation (D-178).
 *
 * No foreign key to `customer_accounts` — the reasoning is
 * `20260830T172022_pwa_organization_attribution.ts`' — so this references no
 * table of another module and needs no manifest edge for its ordering.
 */
export class Migration20261016T172243PwaPushNotificationPreferences extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "push_notification_preferences" (
        "id" uuid not null,
        "customer_account_id" uuid not null,
        "organization_id" uuid not null,
        "order_status_enabled" boolean not null default true,
        "quote_status_enabled" boolean not null default true,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "push_notification_preferences_pkey" primary key ("id")
      );
    `);
    this.addSql(
      `alter table "push_notification_preferences" add constraint "push_notification_preferences_customer_account_id_unique" unique ("customer_account_id");`,
    );
    this.addSql(
      `create index "push_notification_preferences_organization_id_index" on "push_notification_preferences" ("organization_id");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "push_notification_preferences";`);
  }
}
