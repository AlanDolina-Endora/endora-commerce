import { describe, expect, it } from 'vitest';
import { chunkSegments } from './chunk.js';

/** Feature 151, T019 — bounded chunks, order preserved. */
const seg = (id: string, length: number) => ({ id, text: 'x'.repeat(length) });

describe('chunkSegments', () => {
  it('respects the character bound and keeps order', () => {
    const chunks = chunkSegments([seg('s1', 40), seg('s2', 40), seg('s3', 40)], { maxCharacters: 100, maxSegments: 10 });
    expect(chunks.map((c) => c.map((s) => s.id))).toEqual([['s1', 's2'], ['s3']]);
  });

  it('respects the segment bound', () => {
    const chunks = chunkSegments([seg('a', 1), seg('b', 1), seg('c', 1)], { maxCharacters: 100, maxSegments: 2 });
    expect(chunks.map((c) => c.length)).toEqual([2, 1]);
  });

  it('puts an over-long segment in a chunk of its own', () => {
    const chunks = chunkSegments([seg('a', 10), seg('b', 500), seg('c', 10)], { maxCharacters: 100, maxSegments: 10 });
    expect(chunks.map((c) => c.map((s) => s.id))).toEqual([['a'], ['b'], ['c']]);
  });

  it('returns no chunk for no segment', () => {
    expect(chunkSegments([], { maxCharacters: 100, maxSegments: 10 })).toEqual([]);
  });
});
