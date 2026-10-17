import { decodeHtml } from './html-codec.js';
import type { Extraction, Location, ValuePath } from './extract.js';
import { samePlaceholders, unescapeText } from './placeholders.js';
import { decodeInline, nodeAt, type TiptapNode } from './tiptap-inline-codec.js';

/**
 * Feature 151 (research R6–R7) — put the model's answers back.
 *
 * Works on a deep copy and writes only the locations `extract` produced, so
 * every other value of the document is byte-identical after a JSON round trip
 * (guarantees G1 and G7). A location whose answer is missing or fails
 * validation — a lost `{{…}}` placeholder, a lost or invented tag — keeps its
 * original wording and is counted as untranslated (FR-020).
 */

export interface InjectionResult {
  data: unknown;
  translated: number;
  untranslated: number;
}

const FORGED_TAG = /<\/?\d+\/?>|<br\/>/;

function get(root: unknown, path: ValuePath): unknown {
  let value = root;
  for (const part of path) value = (value as Record<string | number, unknown> | undefined)?.[part];
  return value;
}

function set(root: unknown, path: ValuePath, next: unknown): void {
  const parent = get(root, path.slice(0, -1)) as Record<string | number, unknown>;
  parent[path[path.length - 1]!] = next;
}

/** Plain translated text, or `null` when it is unusable. */
function plainText(source: string, translated: string): string | null {
  if (translated.trim() === '' || FORGED_TAG.test(translated)) return null;
  if (!samePlaceholders(source, translated)) return null;
  return unescapeText(translated);
}

function apply(copy: unknown, location: Location, source: string, translated: string): boolean {
  if (!samePlaceholders(source, translated) || translated.trim() === '') return false;
  switch (location.kind) {
    case 'plain': {
      const text = plainText(source, translated);
      const current = get(copy, location.leaf);
      if (text === null || typeof current !== 'string') return false;
      const [start, end] = location.range ?? [0, current.length];
      set(copy, location.leaf, current.slice(0, start) + text + current.slice(end));
      return true;
    }
    case 'html': {
      const html = decodeHtml(translated, location.tags);
      if (html === null) return false;
      set(copy, location.leaf, html);
      return true;
    }
    case 'inline': {
      const content = decodeInline(translated, location.encoded);
      const node = nodeAt(get(copy, location.leaf) as TiptapNode, location.node);
      if (content === null || !node) return false;
      node.content = content;
      return true;
    }
    case 'run': {
      const text = plainText(source, translated);
      const node = nodeAt(get(copy, location.leaf) as TiptapNode, location.node);
      const child = node?.content?.[location.child];
      if (text === null || !node || !child || child.type !== 'text') return false;
      const value = child.text ?? '';
      const [start, end] = location.range;
      const parts: TiptapNode[] = [];
      const withMarks = (t: string): TiptapNode => ({ ...child, text: t });
      if (start > 0) parts.push(withMarks(value.slice(0, start)));
      parts.push(withMarks(text));
      if (end < value.length) parts.push(withMarks(value.slice(end)));
      node.content!.splice(location.child, 1, ...parts);
      return true;
    }
  }
}

export function inject(
  data: unknown,
  extraction: Pick<Extraction, 'segments' | 'locations'>,
  translations: ReadonlyMap<string, string>,
): InjectionResult {
  const copy = structuredClone(data);
  const sources = new Map(extraction.segments.map((segment) => [segment.id, segment.text]));
  let translated = 0;
  let untranslated = 0;
  for (const location of extraction.locations) {
    const answer = translations.get(location.segmentId);
    const source = sources.get(location.segmentId) ?? '';
    if (answer !== undefined && apply(copy, location, source, answer)) translated += 1;
    else untranslated += 1;
  }
  return { data: copy, translated, untranslated };
}
