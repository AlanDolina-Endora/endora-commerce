import { bool, num, str } from '../props.js';
import { quoteDocumentTexts } from '../texts.js';
import type { QuoteBlockRenderer } from './types.js';

/** `quote_requests.QuoteNotes` — the quote's header note under an editable label. */
export const quoteNotesBlock: QuoteBlockRenderer = {
  name: 'quote_requests.QuoteNotes',
  moduleId: 'quote_requests',
  render({ props, data, language, interpolate }) {
    const note = (data.quote.headerNote ?? '').trim();
    const margin = [0, 0, 0, num(props, 'marginBottom', 12, 0, 144)];
    if (note === '' && !bool(props, 'showWhenEmpty', false)) return { text: '', margin };
    const label = interpolate(str(props, 'label', quoteDocumentTexts(language).notes));
    return {
      stack: [
        ...(label.trim() !== '' ? [{ text: label, bold: true, margin: [0, 0, 0, 2] }] : []),
        { text: note, italics: bool(props, 'italics', false) },
      ],
      margin,
    };
  },
};
