import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { manifest } from '../manifest.js';

/**
 * What `cms` declares for the command palette (Principle XVI).
 *
 * Under `backend/` rather than beside `manifest.ts`: only the manifest is
 * published at the package's root subpath, and `manifests:generate` refuses a
 * sibling file there.
 */
const LANGUAGES = ['en', 'pl'] as const;

function bundle(language: (typeof LANGUAGES)[number]): Record<string, string> {
  return JSON.parse(
    readFileSync(new URL(`../../i18n/${language}.json`, import.meta.url), 'utf8'),
  ) as Record<string, string>;
}

const NAVIGATION_ENTRIES = [
  {
    id: 'open-pages',
    targetRoute: '/cms/pages',
    icon: 'Newspaper',
    weight: 131,
    key: 'openPages',
    en: 'CMS Pages',
    pl: 'Strony CMS',
    keywords: ['pages', 'strony'],
  },
  {
    id: 'open-blocks',
    targetRoute: '/cms/blocks',
    icon: 'Newspaper',
    weight: 132,
    key: 'openBlocks',
    en: 'CMS Blocks',
    pl: 'Bloki CMS',
    keywords: ['blocks', 'bloki'],
  },
  {
    id: 'open-templates',
    targetRoute: '/cms/templates',
    icon: 'Newspaper',
    weight: 133,
    key: 'openTemplates',
    en: 'CMS Templates',
    pl: 'Szablony CMS',
    keywords: ['templates', 'szablony'],
  },
  {
    id: 'open-hooks',
    targetRoute: '/cms/hooks',
    icon: 'Webhook',
    weight: 134,
    key: 'openHooks',
    en: 'CMS Hooks',
    pl: 'Hooki CMS',
    keywords: ['hooks', 'hooki'],
  },
] as const;

describe('cms manifest — command palette', () => {
  const actions = manifest.actions ?? [];

  it('keeps the new-page shortcut exactly as it was', () => {
    expect(actions.find((a) => a.id === 'new-page')).toEqual({
      id: 'new-page',
      labelKey: 'actions.newPage.label',
      descriptionKey: 'actions.newPage.description',
      icon: 'FileText',
      targetRoute: '/cms/pages/new',
      requiredPermission: 'cms.write',
      keywords: ['page', 'new', 'create', 'strona', 'nowa', 'utwórz'],
      weight: 130,
    });
  });

  it('declares one navigation entry per list screen, right after new-page', () => {
    expect(actions.map((a) => a.id)).toEqual([
      'new-page',
      ...NAVIGATION_ENTRIES.map((e) => e.id),
    ]);
  });

  for (const entry of NAVIGATION_ENTRIES) {
    describe(entry.id, () => {
      const action = actions.find((a) => a.id === entry.id);

      it('opens its list screen under the read code that screen enforces', () => {
        expect(action).toMatchObject({
          targetRoute: entry.targetRoute,
          requiredPermission: 'cms.read',
          icon: entry.icon,
          weight: entry.weight,
          labelKey: `actions.${entry.key}.label`,
          descriptionKey: `actions.${entry.key}.description`,
        });
      });

      it('is found by an English and a Polish word', () => {
        expect(action?.keywords).toEqual(expect.arrayContaining(['cms', ...entry.keywords]));
      });

      it('has a label matching the sidebar and a description in both languages', () => {
        for (const language of LANGUAGES) {
          const messages = bundle(language);
          expect(messages[`actions.${entry.key}.label`]).toBe(entry[language]);
          expect(messages[`actions.${entry.key}.description`]).toMatch(/\S/);
        }
      });
    });
  }
});
