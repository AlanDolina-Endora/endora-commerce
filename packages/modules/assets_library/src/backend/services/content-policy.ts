// What the library accepts and how it serves it.
//
// The file route answers on the API's own origin, which is the origin the
// admin session cookie belongs to. Anything a browser would *render and run*
// as a document there — HTML, XHTML, generic XML (stylesheets), JavaScript —
// is therefore refused at upload, and the route never serves a stored type
// inline unless it is on a short list of media a browser only displays.
//
// SVG is the one document format the library keeps: shops use it for logos
// and icons. It is stored as `image/svg+xml` and always served under a
// `sandbox` Content-Security-Policy, which runs no script when an SVG is
// opened directly and changes nothing when it is embedded through `<img>`.

/** File-name extensions a browser or an operating system treats as a runnable document. */
const ACTIVE_EXTENSIONS = new Set([
  'html',
  'htm',
  'xhtml',
  'xht',
  'shtml',
  'mht',
  'mhtml',
  'hta',
  'xml',
  'xsl',
  'xslt',
  'js',
  'mjs',
  'cjs',
]);

const SVG_EXTENSIONS = new Set(['svg']);

export const SVG_MIME = 'image/svg+xml';

/** `Text/HTML; charset=utf-8` → `text/html`. */
export function mimeEssence(mime: string): string {
  return (mime.split(';')[0] ?? '').trim().toLowerCase();
}

/**
 * The extension as a file system would save it: trailing dots and spaces are
 * dropped first, so `page.html.` is `html`.
 */
export function fileExtension(filename: string): string {
  const name = filename.trim().replace(/[.\s]+$/u, '');
  const m = name.toLowerCase().match(/\.([^./\\]+)$/);
  return m ? m[1]! : '';
}

export function isSvg(file: { filename: string; mimeType: string }): boolean {
  return mimeEssence(file.mimeType) === SVG_MIME || SVG_EXTENSIONS.has(fileExtension(file.filename));
}

function isActiveMime(mime: string): boolean {
  const m = mimeEssence(mime);
  return (
    m === 'text/html' ||
    m === 'text/xml' ||
    m === 'application/xml' ||
    m === 'text/xsl' ||
    m.endsWith('+xml') ||
    m.includes('javascript') ||
    m.includes('ecmascript')
  );
}

/**
 * A document a browser would render and run, judged by its type and by its
 * name — either is enough. SVG is not counted here; see `isSvg`.
 */
export function isActiveDocument(file: { filename: string; mimeType: string }): boolean {
  if (ACTIVE_EXTENSIONS.has(fileExtension(file.filename))) return true;
  if (mimeEssence(file.mimeType) === SVG_MIME) return false;
  return isActiveMime(file.mimeType);
}

/** Raster image types a browser only displays. */
const INLINE_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/pjpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/apng',
  SVG_MIME,
]);

const PDF_MIME = 'application/pdf';

/**
 * The policy every response of the file route carries. `sandbox` puts the
 * document in an opaque origin with scripts disabled.
 */
export const SANDBOX_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/**
 * PDFs keep the same `default-src` but no `sandbox`: browsers refuse to start
 * their built-in PDF viewer inside a sandboxed document, and a PDF's own
 * scripting runs inside that viewer, not on the page's origin.
 */
export const PDF_CSP = "default-src 'none'; style-src 'unsafe-inline'";

export interface ServingPolicy {
  /** Whether the stored type may be shown in the browser (otherwise downloaded). */
  inline: boolean;
  contentSecurityPolicy: string;
}

export function servingPolicyFor(mimeType: string): ServingPolicy {
  const m = mimeEssence(mimeType);
  if (m === PDF_MIME) return { inline: true, contentSecurityPolicy: PDF_CSP };
  const inline =
    INLINE_IMAGE_TYPES.has(m) ||
    (m.startsWith('video/') && !m.includes('xml')) ||
    (m.startsWith('audio/') && !m.includes('xml')) ||
    m === 'text/plain';
  return { inline, contentSecurityPolicy: SANDBOX_CSP };
}
