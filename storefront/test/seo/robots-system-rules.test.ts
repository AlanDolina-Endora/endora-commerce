import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  ROBOTS_SYSTEM_RULES,
  renderRobotsSystemRules,
  robotsSitemapUrl,
} from '../../lib/seo/robots-system-rules';

/**
 * The system-generated `robots.txt` rules say exactly what they said before
 * (`specs/144-seo-search-engine-robots/`, FR-011, FR-019).
 *
 * Until this feature the file was `app/robots.ts`, a structured
 * `MetadataRoute.Robots` object that Next rendered and prerendered at build
 * time. It is now text this storefront renders itself, so that an operator's
 * instructions can follow it and so that the file can answer `503`. The rules
 * did not change in the move, and this is what holds that:
 *
 * `__fixtures__/robots-before.txt` is `curl -s localhost:3000/robots.txt`
 * against a storefront built from the commit **before** the move, with
 * `NEXT_PUBLIC_SITE_URL=http://localhost:3000`. It is evidence, not a
 * snapshot: it is never regenerated from this tree. A deliberate change to the
 * rules edits the fixture by hand, in the same change, and says so.
 */

const ORIGIN_KEYS = ['NEXT_PUBLIC_SITE_URL', 'STOREFRONT_URL'] as const;
const ORIGINAL = ORIGIN_KEYS.map((key) => [key, process.env[key]] as const);

afterEach(() => {
  for (const [key, value] of ORIGINAL) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const BEFORE = readFileSync(
  fileURLToPath(new URL('./__fixtures__/robots-before.txt', import.meta.url)),
  'utf8',
);

describe('the system-generated robots.txt rules', () => {
  it('render byte for byte what Next rendered from the structured object', () => {
    process.env['NEXT_PUBLIC_SITE_URL'] = 'http://localhost:3000';
    expect(renderRobotsSystemRules()).toBe(BEFORE);
  });

  it('render the same lines in the same order — the readable half of the same claim', () => {
    process.env['NEXT_PUBLIC_SITE_URL'] = 'http://localhost:3000';
    expect(renderRobotsSystemRules().split('\n')).toEqual(BEFORE.split('\n'));
  });

  it('are what the fixture is made of, so the comparison is not of two empty strings', () => {
    const lines = BEFORE.split('\n');
    expect(lines[0]).toBe('User-Agent: *');
    expect(lines[1]).toBe('Allow: /');
    expect(lines.filter((line) => line.startsWith('Disallow: '))).toHaveLength(
      ROBOTS_SYSTEM_RULES.disallow.length,
    );
    expect(ROBOTS_SYSTEM_RULES.disallow.length).toBeGreaterThan(20);
    expect(BEFORE.endsWith('Sitemap: http://localhost:3000/sitemap.xml\n')).toBe(true);
    expect(BEFORE).not.toContain('\r');
  });

  it('close no more than the families of pages that must not be indexed — never the whole site', () => {
    expect(ROBOTS_SYSTEM_RULES.userAgent).toBe('*');
    expect(ROBOTS_SYSTEM_RULES.allow).toBe('/');
    expect(ROBOTS_SYSTEM_RULES.disallow).not.toContain('/');
    expect(ROBOTS_SYSTEM_RULES.disallow).not.toContain('');
    for (const prefix of ROBOTS_SYSTEM_RULES.disallow) expect(prefix.startsWith('/')).toBe(true);
  });

  it('name the sitemap at the origin this deployment declares', () => {
    process.env['NEXT_PUBLIC_SITE_URL'] = 'https://shop.example.com';
    expect(robotsSitemapUrl()).toBe('https://shop.example.com/sitemap.xml');
    const rendered = renderRobotsSystemRules();
    expect(rendered.endsWith('\nSitemap: https://shop.example.com/sitemap.xml\n')).toBe(true);
    // Only that line moved.
    expect(rendered.replace('https://shop.example.com', 'http://localhost:3000')).toBe(BEFORE);
  });

  it('end with exactly one line break and leave one blank line before the sitemap', () => {
    const rendered = renderRobotsSystemRules();
    expect(rendered.endsWith('\n')).toBe(true);
    expect(rendered.endsWith('\n\n')).toBe(false);
    expect(rendered).toMatch(/\nDisallow: [^\n]+\n\nSitemap: [^\n]+\n$/);
  });
});
