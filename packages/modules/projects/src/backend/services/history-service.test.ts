import { describe, expect, it } from 'vitest';
import { auditedTexts, decodeHistoryCursor, encodeHistoryCursor, visibleAuditState } from './history-service.js';

/**
 * The pure halves of a Project's history (FR-028, FR-036): which audited keys
 * hold a text whose tokens are resolved, the custom-field values a reader
 * without `custom_fields:read` is not served, and the opaque cursor.
 */
describe('project history helpers', () => {
  it('serves custom-field values only to a reader who may read them; the rest of the state is untouched', () => {
    const state = { title: 'A', customFieldValues: { budget: 100 } };
    expect(visibleAuditState(state, true)).toBe(state);
    expect(visibleAuditState(state, false)).toEqual({ title: 'A' });
    expect(visibleAuditState({ title: 'A' }, false)).toEqual({ title: 'A' });
    expect(visibleAuditState(null, false)).toBeNull();
    expect(visibleAuditState(['x'], false)).toEqual(['x']);
  });

  it('reads the description of a state as its text, and nothing else', () => {
    expect(auditedTexts({ description: 'See [[task:00000000-0000-4000-8000-000000000001]]', title: 'x' })).toEqual([
      'See [[task:00000000-0000-4000-8000-000000000001]]',
    ]);
    expect(auditedTexts({ descriptionLength: 3 })).toEqual([]);
    expect(auditedTexts(null)).toEqual([]);
  });

  it('round-trips its own cursor and refuses one it did not issue — 400', () => {
    expect(decodeHistoryCursor(encodeHistoryCursor(150))).toBe(150);
    expect(decodeHistoryCursor(undefined)).toBe(0);
    expect(() => decodeHistoryCursor('not-ours')).toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => decodeHistoryCursor(encodeHistoryCursor(-1))).toThrow();
  });
});
