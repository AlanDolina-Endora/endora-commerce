import path from 'node:path';
import { createRequire } from 'node:module';
import type { TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces.js';

/**
 * The one seam this module has onto pdfmake's server-side singleton.
 *
 * pdfmake's font dictionary and URL policy are process-global, and every
 * renderer in the platform (`comparisons`' fixed layout, this engine) sets them
 * to the same values: the bundled Roboto family, which covers Polish, and a
 * deny-all URL policy — images are inlined as `data:` URIs before a render, so
 * no document can make the server open a socket.
 */

interface PdfMakeOutput {
  getBuffer(): Promise<Buffer>;
}
interface PdfMakeSingleton {
  setFonts(fonts: TFontDictionary): void;
  setUrlAccessPolicy(policy: ((url: string) => boolean) | undefined): void;
  createPdf(definition: TDocumentDefinitions): PdfMakeOutput;
}

const requireFromHere = createRequire(import.meta.url);
const pdfMake = requireFromHere('pdfmake') as PdfMakeSingleton;

let configured = false;

function configure(): void {
  if (configured) return;
  const fontsDir = requireFromHere
    .resolve('pdfmake/package.json')
    .replace(/package\.json$/, `fonts${path.sep}Roboto${path.sep}`);
  pdfMake.setFonts({
    Roboto: {
      normal: `${fontsDir}Roboto-Regular.ttf`,
      bold: `${fontsDir}Roboto-Medium.ttf`,
      italics: `${fontsDir}Roboto-Italic.ttf`,
      bolditalics: `${fontsDir}Roboto-MediumItalic.ttf`,
    },
  });
  pdfMake.setUrlAccessPolicy(() => false);
  configured = true;
}

/** The PDF bytes of a document definition. */
export async function pdfBytes(definition: TDocumentDefinitions): Promise<Uint8Array> {
  configure();
  const buffer = await pdfMake.createPdf(definition).getBuffer();
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}
