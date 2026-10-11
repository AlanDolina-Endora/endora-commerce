import { describe, expect, it } from 'vitest';

import {
  CORE_MODULE_ID,
  PLATFORM_ENTITIES,
  PLATFORM_MIGRATION_ENTRIES,
  mergeByIdentity,
} from './platform-schema.js';
import { configuredMigrationsFrom } from './configured-migrations.js';
import * as migrationsBarrel from '../migrations/index.js';
import { BASELINE_MIGRATIONS } from '../migrations/index.js';

/**
 * Every migration class the `./migrations` barrel publishes, read off the
 * barrel's own exports.
 *
 * The barrel publishes other things beside classes — `BASELINE_MIGRATIONS` and
 * its inventory — so a member is recognised the way a migration is recognised
 * everywhere else: a class whose name carries a stamp and the owning module's
 * segment.
 */
function publishedCoreMigrationNames(): string[] {
  return Object.values(migrationsBarrel as Record<string, unknown>)
    .flatMap((value) => (typeof value === 'function' ? [value.name] : []))
    .filter((name) => /^Migration\d{8}T\d{6}Core/.test(name))
    .sort();
}

/**
 * The platform's own schema is the platform's to supply
 * (`specs/110-instance-repository/` T141).
 *
 * The red proof this file exists for is the one the acceptance criterion
 * measured: an instance supplies `coreEntities: []` and `coreEntries: []`,
 * because it ships no generated registry, and before this it therefore ran none
 * of the platform's migrations and registered none of its entities —
 * so `migrate` died on the first module migration to touch a table
 * `core_foundation_init` creates.
 */
describe('the platform contributes its own schema', () => {
  /**
   * Derived from the barrel's exports rather than counted here (D-100), and
   * rather than from `BASELINE_MIGRATIONS`, which this test read until
   * `specs/144-seo-search-engine-robots/`: that is the frozen historical prefix
   * — it stops at the watermark and never grows — so a set derived from it
   * cannot see a migration written after it, which is every new one. The list in `platform-schema.ts`
   * is hand-written and is the **only** source of the platform's migrations an
   * instance has: it passes `coreEntries: []`, having no generated registry. A
   * class exported by the barrel and missing here therefore runs in this
   * repository, whose registry names it, and on no installed instance — and
   * the first code to read its column fails at boot there.
   * `Migration20261011T135250CoreSettingsMultiline` was that class.
   */
  it('names every migration class the barrel exports, and nothing else', () => {
    const published = publishedCoreMigrationNames();
    // Non-vacuous: the recogniser found the barrel's classes at all.
    expect(published.length).toBeGreaterThan(0);
    expect(PLATFORM_MIGRATION_ENTRIES.map((entry) => entry.cls.name).sort()).toEqual(published);
  });

  it('gives an instance — which supplies no core entry of its own — all of them, in order', () => {
    // What `discoverConfiguredMigrations({ coreEntries: [], manifests: [] })`
    // orders when no package contributes: this list and nothing else.
    // The same merge `discoverConfiguredMigrations` performs, minus the
    // package discovery that reads the environment.
    const ordered = configuredMigrationsFrom({
      coreEntries: mergeByIdentity([], PLATFORM_MIGRATION_ENTRIES, (entry) => entry.cls),
      coreModuleDependencies: new Map(),
      packages: [],
    }).names;
    expect([...ordered].sort()).toEqual(publishedCoreMigrationNames());
    // Past the frozen prefix a module's own migrations run ascending by stamp.
    const open = ordered.filter((name) => !BASELINE_MIGRATIONS.includes(name));
    expect(open).toEqual([...open].sort());
  });

  it('files every one of them under the cross-cutting `core` module', () => {
    for (const entry of PLATFORM_MIGRATION_ENTRIES) {
      expect(entry.moduleId).toBe(CORE_MODULE_ID);
    }
  });

  it('declares no migration twice, by class name', () => {
    const names = PLATFORM_MIGRATION_ENTRIES.map((entry) => entry.cls.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('declares entity classes, each exactly once', () => {
    expect(PLATFORM_ENTITIES.length).toBeGreaterThan(0);
    expect(new Set(PLATFORM_ENTITIES).size).toBe(PLATFORM_ENTITIES.length);
  });
});

describe('mergeByIdentity', () => {
  it('keeps the first array whole and appends only what it does not already hold', () => {
    const a = { n: 1 };
    const b = { n: 2 };
    expect(mergeByIdentity([a], [a, b])).toEqual([a, b]);
  });

  it('compares on the identity a caller names, not on the member', () => {
    // The migration case: two different wrappers around one class. Comparing
    // the wrappers finds no overlap and hands `orderMigrations` a duplicate
    // name, which is how a host that already declares these would have broken.
    class Migration20260101T000000CoreSomething {}
    const host = { moduleId: 'core', cls: Migration20260101T000000CoreSomething };
    const ours = { moduleId: 'core', cls: Migration20260101T000000CoreSomething };
    expect(mergeByIdentity([host], [ours])).toHaveLength(2);
    expect(mergeByIdentity([host], [ours], (entry) => entry.cls)).toEqual([host]);
  });
});
