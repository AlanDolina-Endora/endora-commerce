import { escapeText, unescapeText } from './placeholders.js';

/**
 * Feature 151 (research R6, `contracts/block-translatable-declaration.md` §3) —
 * a TipTap document is translated one **textblock** at a time. Its inline
 * content becomes one string in which every marked run is wrapped in a numbered
 * tag (`<0>…</0>`), a hard break is `<br/>` and any other inline node is a
 * self-closing `<n/>`. The table that says what each number stands for — mark
 * lists, link targets, opaque nodes — never leaves the server.
 */

export interface TiptapNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: unknown[];
  text?: string;
  [key: string]: unknown;
}

export type InlineTagEntry =
  | { kind: 'marks'; marks: unknown[] }
  | { kind: 'node'; node: TiptapNode };

export interface EncodedInline {
  text: string;
  table: InlineTagEntry[];
  breaks: number;
}

/** Textblocks whose text is code, and is therefore never translated. */
const VERBATIM_TEXTBLOCKS = new Set(['codeBlock']);

function isTextblock(node: TiptapNode): boolean {
  return (
    Array.isArray(node.content) &&
    node.content.some((child) => child?.type === 'text') &&
    !VERBATIM_TEXTBLOCKS.has(node.type ?? '')
  );
}

/**
 * The child-index paths, from `doc`, of every textblock that carries text, in
 * document order. Containers (lists, quotes, tables) are walked; a code block
 * and an empty paragraph are not segments.
 */
export function textblockPaths(doc: TiptapNode): number[][] {
  const out: number[][] = [];
  const walk = (node: TiptapNode, path: number[]): void => {
    (node.content ?? []).forEach((child, index) => {
      if (!child || typeof child !== 'object') return;
      const childPath = [...path, index];
      if (isTextblock(child)) out.push(childPath);
      else if (!VERBATIM_TEXTBLOCKS.has(child.type ?? '')) walk(child, childPath);
    });
  };
  walk(doc, []);
  return out;
}

export function nodeAt(doc: TiptapNode, path: readonly number[]): TiptapNode | undefined {
  let node: TiptapNode | undefined = doc;
  for (const index of path) node = node?.content?.[index];
  return node;
}

/** Encode one textblock's inline content. */
export function encodeInline(textblock: TiptapNode): EncodedInline {
  const table: InlineTagEntry[] = [];
  let text = '';
  let breaks = 0;
  for (const child of textblock.content ?? []) {
    if (child.type === 'text') {
      const value = escapeText(child.text ?? '');
      if (Array.isArray(child.marks) && child.marks.length > 0) {
        const n = table.push({ kind: 'marks', marks: child.marks }) - 1;
        text += `<${n}>${value}</${n}>`;
      } else {
        text += value;
      }
    } else if (child.type === 'hardBreak') {
      breaks += 1;
      text += '<br/>';
    } else {
      const n = table.push({ kind: 'node', node: child }) - 1;
      text += `<${n}/>`;
    }
  }
  return { text, table, breaks };
}

const TOKEN_RE = /<(\d+)>|<\/(\d+)>|<(\d+)\/>|<br\/>/g;

/**
 * Rebuild a textblock's inline content from a translated string, or `null` when
 * the string does not carry exactly the source's tags: every run tag opened and
 * closed once, never nested; every node tag once; the same number of breaks; no
 * unknown tag and no stray angle bracket.
 */
export function decodeInline(
  translated: string,
  source: Pick<EncodedInline, 'table' | 'breaks'>,
): TiptapNode[] | null {
  const { table, breaks: expectedBreaks } = source;
  const out: TiptapNode[] = [];
  const seen = new Set<number>();
  let open: number | null = null;
  let breaks = 0;
  let last = 0;

  const pushText = (raw: string): boolean => {
    if (/[<>]/.test(raw)) return false;
    const value = unescapeText(raw);
    if (value === '') return true;
    if (open !== null) {
      const entry = table[open] as { kind: 'marks'; marks: unknown[] };
      out.push({ type: 'text', text: value, marks: entry.marks });
    } else {
      out.push({ type: 'text', text: value });
    }
    return true;
  };

  for (const match of translated.matchAll(TOKEN_RE)) {
    if (!pushText(translated.slice(last, match.index))) return null;
    last = match.index + match[0].length;
    if (match[1] !== undefined) {
      const n = Number(match[1]);
      if (open !== null || seen.has(n) || table[n]?.kind !== 'marks') return null;
      seen.add(n);
      open = n;
    } else if (match[2] !== undefined) {
      if (open === null || Number(match[2]) !== open) return null;
      open = null;
    } else if (match[3] !== undefined) {
      const n = Number(match[3]);
      const entry = table[n];
      if (open !== null || seen.has(n) || entry?.kind !== 'node') return null;
      seen.add(n);
      out.push(entry.node);
    } else {
      if (open !== null) return null;
      breaks += 1;
      out.push({ type: 'hardBreak' });
    }
  }
  if (!pushText(translated.slice(last))) return null;
  if (open !== null || seen.size !== table.length || breaks !== expectedBreaks) return null;
  return out;
}
