/**
 * Whitelist sanitizer for EmailRichText HTML.
 * Allows only tags safe for email clients; preserves {{var}}/{{if}}/{{for}} text.
 */

const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'a',
  'ul',
  'ol',
  'li',
  'span',
  'h1',
  'h2',
  'h3',
  'img',
]);

const EMAIL_IMG_STYLE = 'display:block;border:0;outline:none;max-width:100%;height:auto;';

function attrValue(attrs: string, name: string): string {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = re.exec(attrs);
  return match?.[2] ?? match?.[3] ?? match?.[4] ?? '';
}

/** A tag at the current position: `<name ...>` or `</name ...>`. Sticky, so it never skips ahead. */
const TAG_AT = /<\/?([a-zA-Z0-9]+)(\s[^>]*)?>/y;

function rebuildTag(full: string, tag: string, attrs: string): string {
  const name = tag.toLowerCase();
  if (!ALLOWED_TAGS.has(name)) return '';
  if (full.startsWith('</')) return `</${name}>`;
  if (name === 'br') return '<br />';

  if (name === 'a') {
    const href = sanitizeHref(attrValue(attrs, 'href'));
    if (!href) return '';
    return `<a href="${escapeAttr(href)}" target="_blank" rel="noreferrer">`;
  }

  if (name === 'img') {
    const src = sanitizeImgSrc(attrValue(attrs, 'src'));
    if (!src) return '';
    const alt = attrValue(attrs, 'alt');
    const widthRaw = attrValue(attrs, 'width').replace(/[^\d]/g, '');
    const width = widthRaw ? ` width="${widthRaw}"` : '';
    return (
      `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"${width} ` +
      `style="${EMAIL_IMG_STYLE}" />`
    );
  }

  return `<${name}>`;
}

/**
 * One left-to-right pass: every `<` either starts a tag, which is rebuilt from the allowlist or
 * dropped, or is written out as `&lt;`. Removing a tag can therefore never join the text around
 * it into a new tag — the output holds no `<` the allowlist did not write.
 */
function stripTags(html: string): string {
  let out = '';
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    TAG_AT.lastIndex = lt;
    const match = TAG_AT.exec(html);
    if (match) {
      out += rebuildTag(match[0], match[1]!, match[2] ?? '');
      i = lt + match[0].length;
    } else {
      out += '&lt;';
      i = lt + 1;
    }
  }
  return out;
}

function sanitizeHref(href: string): string {
  const trimmed = href.trim();
  if (!trimmed) return '';
  // Allow directive markers and relative/absolute http(s) links.
  if (trimmed.includes('{{')) return trimmed;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:')) return '';
  if (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('mailto:') ||
    trimmed.startsWith('/')
  ) {
    return trimmed;
  }
  return '';
}

/** Image src: http(s), host-relative paths, or directive markers — not javascript/data. */
function sanitizeImgSrc(src: string): string {
  const trimmed = src.trim();
  if (!trimmed) return '';
  if (trimmed.includes('{{')) return trimmed;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:')) return '';
  if (lower.startsWith('http://') || lower.startsWith('https://') || trimmed.startsWith('/')) {
    return trimmed;
  }
  return '';
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Returns sanitized HTML fragment safe to embed in an email table cell. */
export function sanitizeEmailHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';
  // Drop comments and script/style blocks with their content first. This only removes text;
  // stripTags below is what guarantees no tag outside the allowlist survives.
  let out = html
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  out = stripTags(out);
  // Collapse empty paragraphs left by stripping.
  out = out.replace(/<p>\s*<\/p>/g, '');
  return out.trim();
}

/** Strip tags for plain-text alternative (keeps directive markers). */
export function emailHtmlToPlainText(html: string): string {
  return sanitizeEmailHtml(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<img\b[^>]*\balt="([^"]*)"[^>]*>/gi, (_, alt: string) => (alt ? `[${alt}]` : ''))
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
