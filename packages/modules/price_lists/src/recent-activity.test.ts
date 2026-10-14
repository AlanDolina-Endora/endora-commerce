import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { recentActivity } from './manifest.js';

/**
 * The bulk add (feature 145) is an audited write like the roster replace beside
 * it, so the dashboard's recent activity must be able to show it — declared in
 * the manifest, with a verb in both shipped bundles.
 */

function bundle(language: 'en' | 'pl'): Record<string, string> {
  const url = new URL(`../i18n/${language}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as Record<string, string>;
}

describe('price_lists recent activity', () => {
  it('declares price_list.products_add beside price_list.products_replace', () => {
    const actions = recentActivity.entries.map((e) => e.action);
    expect(actions).toContain('price_list.products_replace');
    expect(actions).toContain('price_list.products_add');
    const entry = recentActivity.entries.find((e) => e.action === 'price_list.products_add');
    expect(entry?.labelKey).toBe('activity.verb.price_list.products_add');
  });

  it.each(['en', 'pl'] as const)('has a %s verb for every declared entry', (language) => {
    const messages = bundle(language);
    for (const entry of recentActivity.entries) {
      expect(messages[entry.labelKey], entry.labelKey).toBeTruthy();
    }
  });
});
