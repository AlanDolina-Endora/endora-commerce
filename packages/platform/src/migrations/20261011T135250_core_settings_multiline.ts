import { Migration } from '@mikro-orm/migrations';

/**
 * Settings multi-line flag (`specs/144-seo-search-engine-robots/`, FR-004).
 *
 * Adds a non-null `multiline` boolean column (default false) to `settings`.
 * When true the generic admin Settings screen edits the value in a multi-line
 * field that keeps line breaks; the stored value is an ordinary `string`
 * either way. The column is manifest-driven presentation, kept in step with
 * the owning module's declaration by `ManifestReconciler` on every boot, as
 * `hidden` and `enum_options` are.
 *
 * Purely additive: a constant default is a catalogue-only change in
 * PostgreSQL, so no row is rewritten, and every existing row reads `false` —
 * the single-line field it had before. Nothing changes for an instance until
 * a manifest declares the flag. `down` loses only what the next boot restores.
 *
 * Registration is a regeneration: run
 * `pnpm --filter backend run composer:generate` and commit the result. An
 * unregistered migration does not run, and the round-trip guard fails the
 * build for it.
 *
 * This stamp orders this migration against its own module's migrations and
 * against nothing else. It references no table another module owns.
 */
export class Migration20261011T135250CoreSettingsMultiline extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "settings" add column "multiline" boolean not null default false;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "settings" drop column "multiline";`);
  }
}
