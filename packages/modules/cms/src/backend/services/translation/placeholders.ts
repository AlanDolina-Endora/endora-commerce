/**
 * Feature 151 (research R7) — what must survive a translation verbatim, and the
 * escaping that keeps the inline-tag syntax of `tiptap-inline-codec.ts` from
 * being forged by content.
 */

const PLACEHOLDER_RE = /\{\{[^{}]{1,128}\}\}/g;

/** Every `{{…}}` token in `text`, in order, repeats included. */
export function placeholdersOf(text: string): string[] {
  return text.match(PLACEHOLDER_RE) ?? [];
}

/** `true` when both texts carry the same multiset of `{{…}}` tokens. */
export function samePlaceholders(source: string, translated: string): boolean {
  const a = placeholdersOf(source).sort();
  const b = placeholdersOf(translated).sort();
  return a.length === b.length && a.every((token, index) => token === b[index]);
}

/** Escape `&`, `<`, `>` so a text can sit beside inline tags without being read as one. */
export function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Inverse of {@link escapeText}. */
export function unescapeText(text: string): string {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
