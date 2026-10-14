import { Migration } from '@mikro-orm/migrations';

/**
 * Feature 146 (US4, data-model §5–§6) — the per-organization and per-account
 * price-negotiation lock.
 *
 * - `quote_request_org_policies` — one row per organization; no row means
 *   "members may propose prices" (the default).
 * - `quote_request_account_policies` — one row per customer account;
 *   `price_proposals_allowed` is `null` for "as organization", so a reset keeps
 *   the row and the audit before/after is always a value.
 *
 * Both foreign keys point at tables of binding `dependencies` this module
 * already declares (`organizations`, `customer_accounts`).
 */
export class Migration20261014T115053QuoteRequestsNegotiationPolicies extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "quote_request_org_policies" (
        "organization_id" uuid not null,
        "price_proposals_allowed" boolean not null default true,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "quote_request_org_policies_pkey" primary key ("organization_id"),
        -- The cascade removes this POLICY ROW ONLY when its organization is
        -- deleted. It never reaches a quote request: no quote request table
        -- references this one (threat model T14).
        constraint "quote_request_org_policies_organization_fk"
          foreign key ("organization_id") references "organizations" ("id") on delete cascade
      );
    `);
    this.addSql(`
      create table "quote_request_account_policies" (
        "customer_account_id" uuid not null,
        "price_proposals_allowed" boolean null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "quote_request_account_policies_pkey" primary key ("customer_account_id"),
        -- The cascade removes this POLICY ROW ONLY when its customer account is
        -- deleted. It never reaches a quote request: no quote request table
        -- references this one (threat model T14).
        constraint "quote_request_account_policies_customer_account_fk"
          foreign key ("customer_account_id") references "customer_accounts" ("id") on delete cascade
      );
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "quote_request_account_policies";');
    this.addSql('drop table if exists "quote_request_org_policies";');
  }
}
