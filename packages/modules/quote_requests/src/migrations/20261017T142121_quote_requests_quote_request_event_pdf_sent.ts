import { Migration } from '@mikro-orm/migrations';

/**
 * Feature 153 (owner answer Q4, `specs/153-quote-request-pdf-template/data-model.md` §1a)
 * — a quote request's history records that its PDF was e-mailed: the event
 * type check gains `pdf-sent`.
 *
 * `down()` restores the eleven values the workflow migration created, and fails
 * while a `pdf-sent` row exists — as narrowing any check must.
 */
const BEFORE = `'created','submitted','modified','approved','canceled','expired',
  'completed','customer-accepted-revision','customer-rejected-revision',
  're-submitted','note-added'`;

export class Migration20261017T142121QuoteRequestsQuoteRequestEventPdfSent extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "quote_request_events" drop constraint "qre_event_type_check";`);
    this.addSql(
      `alter table "quote_request_events" add constraint "qre_event_type_check" check ("event_type" in (${BEFORE}, 'pdf-sent'));`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "quote_request_events" drop constraint "qre_event_type_check";`);
    this.addSql(
      `alter table "quote_request_events" add constraint "qre_event_type_check" check ("event_type" in (${BEFORE}));`,
    );
  }
}
