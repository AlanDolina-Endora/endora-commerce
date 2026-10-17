import { describe, expect, it } from 'vitest';
import { escapeText, placeholdersOf, samePlaceholders, unescapeText } from './placeholders.js';

/** Feature 151, T017 — `{{…}}` placeholders and the escaping that keeps tag syntax unforgeable. */
describe('placeholders', () => {
  it('lists every {{…}} token, repeats included', () => {
    expect(placeholdersOf('Hi {{customer.firstName}}, {{ shop }} and {{customer.firstName}}')).toEqual([
      '{{customer.firstName}}',
      '{{ shop }}',
      '{{customer.firstName}}',
    ]);
    expect(placeholdersOf('no tokens {single} here')).toEqual([]);
  });

  it('compares as a multiset, order free', () => {
    expect(samePlaceholders('{{a}} x {{b}}', '{{b}} y {{a}}')).toBe(true);
    expect(samePlaceholders('{{a}} {{a}}', '{{a}}')).toBe(false);
    expect(samePlaceholders('{{a}}', '{{ a }}')).toBe(false);
    expect(samePlaceholders('plain', 'plain translated')).toBe(true);
  });
});

describe('escapeText / unescapeText', () => {
  it('round-trips <, > and &', () => {
    const source = 'a < b && c > d &lt; literal';
    const escaped = escapeText(source);
    expect(escaped).not.toMatch(/[<>]/);
    expect(unescapeText(escaped)).toBe(source);
  });
});
