import { describe, expect, it } from 'vitest';
import { escapeLikePattern, isUuid } from './like-pattern.js';

describe('escapeLikePattern', () => {
  it('escapes the three LIKE metacharacters for ESCAPE backslash', () => {
    expect(escapeLikePattern('100%')).toBe('100\\%');
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
    expect(escapeLikePattern('c:\\dir')).toBe('c:\\\\dir');
    expect(escapeLikePattern('%_\\')).toBe('\\%\\_\\\\');
  });

  it('leaves every other character alone', () => {
    expect(escapeLikePattern('ZAM/2026/0042 Łódź')).toBe('ZAM/2026/0042 Łódź');
  });
});

describe('isUuid', () => {
  it('is true for a UUID in any case', () => {
    expect(isUuid('0b8f6a3e-6a1f-4c1e-9d5b-1e2f3a4b5c6d')).toBe(true);
    expect(isUuid('0B8F6A3E-6A1F-4C1E-9D5B-1E2F3A4B5C6D')).toBe(true);
  });

  it('is false otherwise', () => {
    expect(isUuid('0b8f6a3e-6a1f-4c1e-9d5b')).toBe(false);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(' 0b8f6a3e-6a1f-4c1e-9d5b-1e2f3a4b5c6d')).toBe(false);
  });
});
