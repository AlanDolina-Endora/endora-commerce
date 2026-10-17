/**
 * Feature 151 — an HTML string prop (`format: 'html'`, the Accordion's and the
 * Tabs' item content). Every tag becomes an ordered self-closing `<n/>`
 * placeholder kept on the server, so markup and link targets never reach the
 * model. The translation must return the placeholders **in the source order**:
 * a self-closing placeholder carries no pairing, so order is the only thing
 * that keeps `<strong>` before `</strong>`, and a reordered answer is refused
 * (the text keeps its original wording) rather than repaired.
 */

const TAG_RE = /<[^<>]*>/g;

export interface EncodedHtml {
  text: string;
  tags: string[];
}

function escapeStray(text: string): string {
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function encodeHtml(html: string): EncodedHtml {
  const tags: string[] = [];
  let text = '';
  let last = 0;
  for (const match of html.matchAll(TAG_RE)) {
    text += escapeStray(html.slice(last, match.index));
    text += `<${tags.push(match[0]) - 1}/>`;
    last = match.index + match[0].length;
  }
  text += escapeStray(html.slice(last));
  return { text, tags };
}

/** The translated HTML, or `null` when the placeholders are not exactly `0…n-1` in order. */
export function decodeHtml(translated: string, tags: readonly string[]): string | null {
  let expected = 0;
  let out = '';
  let last = 0;
  for (const match of translated.matchAll(/<(\d+)\/>/g)) {
    const between = translated.slice(last, match.index);
    if (/[<>]/.test(between)) return null;
    if (Number(match[1]) !== expected) return null;
    out += between + tags[expected];
    expected += 1;
    last = match.index + match[0].length;
  }
  const tail = translated.slice(last);
  if (/[<>]/.test(tail) || expected !== tags.length) return null;
  return out + tail;
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/** What a reader sees of `html` — tags dropped, the common entities decoded. */
export function visibleHtmlText(html: string): string {
  return html.replace(TAG_RE, '').replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity] ?? entity);
}
