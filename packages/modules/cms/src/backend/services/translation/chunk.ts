/**
 * Feature 151 (research R8) — split the segments of one request into the
 * provider calls that carry them. Order is preserved; a segment longer than the
 * character bound travels alone rather than being cut.
 */
export function chunkSegments<T extends { text: string }>(
  segments: readonly T[],
  bounds: { maxCharacters: number; maxSegments: number },
): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let size = 0;
  for (const segment of segments) {
    const length = segment.text.length;
    if (current.length > 0 && (size + length > bounds.maxCharacters || current.length >= bounds.maxSegments)) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(segment);
    size += length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
