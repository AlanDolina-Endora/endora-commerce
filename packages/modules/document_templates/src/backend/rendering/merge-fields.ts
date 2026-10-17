/**
 * Merge fields — `{{key}}` placeholders in a template's texts
 * (`specs/152-compare-pdf-template/contracts/document-type-registry.md` §5).
 *
 * Plain text in, plain text out. A key the document knows is replaced by its
 * value, or by nothing when it has none (FR-023); a key nobody declared — a
 * typo, or an invoice's own `{{var seller.x}}` syntax, which its blocks
 * interpolate themselves — is printed literally, so a mistake is visible on the
 * page instead of silently disappearing. A value is inserted once and never
 * re-read, so no value can smuggle in another placeholder.
 */

const MERGE_FIELD_RE = /\{\{\s*([a-z][A-Za-z0-9]*)\s*\}\}/g;

export type MergeFieldValues = Readonly<Record<string, string | null | undefined>>;

export function interpolateMergeFields(text: string, values: MergeFieldValues): string {
  if (typeof text !== 'string') return '';
  return text.replace(MERGE_FIELD_RE, (match, key: string) =>
    Object.hasOwn(values, key) ? (values[key] ?? '') : match,
  );
}

/** The distinct keys a text uses, in order of first appearance. */
export function mergeFieldKeysIn(text: string): string[] {
  const keys: string[] = [];
  for (const match of text.matchAll(MERGE_FIELD_RE)) {
    const key = match[1] as string;
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}
