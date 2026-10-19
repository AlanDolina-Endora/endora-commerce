import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `specs/156-asset-stable-url/` owner ruling S5 — the module is named to the
 * operator the same way everywhere: the sidebar entry, the page title and the
 * command palette all say "Media library" ("Biblioteka mediów").
 */

function bundle(language: string): Record<string, string> {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), `../packages/modules/assets_library/i18n/${language}.json`), 'utf8'),
  ) as Record<string, string>;
}

describe('assets_library — one operator-facing name', () => {
  it.each([
    ['en', 'Media library'],
    ['pl', 'Biblioteka mediów'],
  ])('%s: sidebar, page title and palette say %s', (language, name) => {
    const b = bundle(language);
    expect(b['nav.assetsLibrary.label']).toBe(name);
    expect(b['page.title']).toBe(name);
    expect(b['actions.openLibrary.label']).toBe(name);
  });
});
