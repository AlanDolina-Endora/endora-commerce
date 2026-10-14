import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Feature 147 (T011, SC-001) — the saved-views dialogs never fall back to the
 * browser's native prompt, confirm or alert boxes. A source scan rather than a
 * behavioural assertion alone: the component tests spy on the three functions,
 * but only on the paths they drive.
 */

const KIT_COMPONENTS = resolve(__dirname, '../../../packages/admin-kit/src/components');
const SCANNED = ['saved-views', 'modal-dialog'].map((dir) => join(KIT_COMPONENTS, dir));
const NATIVE_DIALOG = /window\.(prompt|confirm|alert)\b|\b(prompt|confirm|alert)\(/;

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe('saved-views dialogs use no native dialog', () => {
  it.each(SCANNED)('%s holds source files and none calls a native dialog', (dir) => {
    const files = filesUnder(dir);
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((file) => NATIVE_DIALOG.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
