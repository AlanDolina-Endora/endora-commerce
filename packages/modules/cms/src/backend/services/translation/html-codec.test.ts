import { describe, expect, it } from 'vitest';
import { decodeHtml, encodeHtml, visibleHtmlText } from './html-codec.js';

/**
 * Feature 151 — an HTML string prop (Accordion and Tabs item content). Every tag
 * becomes an ordered `<n/>` placeholder kept on the server, so markup and link
 * targets never reach the model and come back exactly as they were.
 */
describe('html codec', () => {
  const source = '<p>Witaj <a href="https://x.example/a">w sklepie</a> {{shop}}</p><p>Drugi &amp; trzeci</p>';

  it('replaces every tag with an ordered placeholder', () => {
    const { text, tags } = encodeHtml(source);
    expect(text).toBe('<0/>Witaj <1/>w sklepie<2/> {{shop}}<3/><4/>Drugi &amp; trzeci<5/>');
    expect(text).not.toContain('x.example');
    expect(tags[1]).toBe('<a href="https://x.example/a">');
  });

  it('restores the tags', () => {
    const { tags } = encodeHtml(source);
    expect(decodeHtml('<0/>Welcome <1/>to the shop<2/> {{shop}}<3/><4/>Second &amp; third<5/>', tags)).toBe(
      '<p>Welcome <a href="https://x.example/a">to the shop</a> {{shop}}</p><p>Second &amp; third</p>',
    );
  });

  it.each([
    ['reordered', '<1/>a<0/>b<2/><3/><4/>c<5/>'],
    ['missing', '<0/>a<1/>b<2/><3/>c<5/>'],
    ['duplicated', '<0/>a<1/>b<1/><2/><3/><4/>c<5/>'],
    ['a raw tag', '<0/>a<1/>b<2/><3/><4/><b>c</b><5/>'],
  ])('rejects a %s placeholder sequence', (_label, translated) => {
    expect(decodeHtml(translated, encodeHtml(source).tags)).toBeNull();
  });

  it('escapes a stray angle bracket in text', () => {
    expect(encodeHtml('a < b').text).toBe('a &lt; b');
  });

  it('exposes the visible text for selection matching', () => {
    expect(visibleHtmlText(source)).toBe('Witaj w sklepie {{shop}}Drugi & trzeci');
  });
});
