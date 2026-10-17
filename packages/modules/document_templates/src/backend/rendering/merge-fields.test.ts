import { describe, expect, it } from 'vitest';
import { interpolateMergeFields, mergeFieldKeysIn } from './merge-fields.js';

/** `contracts/document-type-registry.md` §5 — `{{key}}`, plain text, known-but-empty → empty, unknown → verbatim. */
describe('interpolateMergeFields', () => {
  const values = { date: '17 October 2026', productCount: '3', customerName: null, shareUrl: undefined };

  it('replaces a known key with its value', () => {
    expect(interpolateMergeFields('{{productCount}} products on {{date}}', values)).toBe('3 products on 17 October 2026');
  });
  it('tolerates spaces inside the braces', () => {
    expect(interpolateMergeFields('{{ date }}', values)).toBe('17 October 2026');
  });
  it('prints a known key without a value as empty', () => {
    expect(interpolateMergeFields('For: {{customerName}}|{{shareUrl}}', values)).toBe('For: |');
  });
  it('prints an unknown or misspelled key literally', () => {
    expect(interpolateMergeFields('{{productCnt}} {{Date}} {{var seller.taxId}}', values)).toBe(
      '{{productCnt}} {{Date}} {{var seller.taxId}}',
    );
  });
  it('never evaluates anything — a value is inserted as text, not re-interpolated', () => {
    expect(interpolateMergeFields('{{a}}', { a: '{{b}}', b: 'x' })).toBe('{{b}}');
  });
  it('leaves non-string input as an empty string', () => {
    expect(interpolateMergeFields(undefined as unknown as string, values)).toBe('');
  });
  it('lists the keys a text uses', () => {
    expect(mergeFieldKeysIn('{{a}} {{ b }} {{a}} {{C}}')).toEqual(['a', 'b']);
  });
});

describe('reserved item-level placeholders (153 FR-045)', () => {
  it('{{item.…}} and {{row.number}} print verbatim, even beside known keys', () => {
    const values = { quoteNumber: 'Q-1', item: 'never used', row: 'never used' };
    expect(interpolateMergeFields('{{quoteNumber}} {{item.sku}}', values)).toBe('Q-1 {{item.sku}}');
    expect(interpolateMergeFields('{{item.attributes.colour}}', values)).toBe('{{item.attributes.colour}}');
    expect(interpolateMergeFields('{{ row.number }}', values)).toBe('{{ row.number }}');
  });
});
