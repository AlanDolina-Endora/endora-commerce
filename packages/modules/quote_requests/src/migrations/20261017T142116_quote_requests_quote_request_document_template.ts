import { Migration } from '@mikro-orm/migrations';

/**
 * Feature 153 (owner answer Q2, `specs/153-quote-request-pdf-template/data-model.md` §1)
 * — the PDF template remembered for a quote request.
 *
 * Nullable, no default, no backfill and no index: it is read only with its row.
 * **No foreign key**, deliberately: the template lives in `document_templates`'
 * table, and a quote must survive its template's deletion — a stale id falls
 * back to the default at render and is never cleared by a cascade.
 */
export class Migration20261017T142116QuoteRequestsQuoteRequestDocumentTemplate extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "quote_requests" add column "document_template_id" uuid null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "quote_requests" drop column "document_template_id";`);
  }
}
