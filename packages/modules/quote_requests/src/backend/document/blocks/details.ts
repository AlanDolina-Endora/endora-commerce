import { num, str } from '../props.js';
import { quoteDocumentTexts } from '../texts.js';
import type { QuoteBlockRenderer } from './types.js';

/**
 * `quote_requests.QuoteDetails` — the quote's custom fields a customer may
 * see, with a value, as label–value pairs. Fields whose definition is
 * internal never reach the document data (the data builder filters them).
 */
export const quoteDetailsBlock: QuoteBlockRenderer = {
  name: 'quote_requests.QuoteDetails',
  moduleId: 'quote_requests',
  render({ props, data, language, interpolate }) {
    const margin = [0, 0, 0, num(props, 'marginBottom', 12, 0, 144)];
    const details = data.details.filter((detail) => detail.value.trim() !== '');
    if (details.length === 0) return { text: '', margin };
    const heading = interpolate(str(props, 'heading', quoteDocumentTexts(language).details));
    const title = heading.trim() !== '' ? [{ text: heading, bold: true, margin: [0, 0, 0, 2] }] : [];
    if (str(props, 'layout', 'table') === 'list') {
      return { stack: [...title, ...details.map((d) => ({ text: `${d.label}: ${d.value}` }))], margin };
    }
    return {
      stack: [
        ...title,
        {
          table: { widths: ['auto', '*'], body: details.map((d) => [{ text: d.label, bold: true }, { text: d.value }]) },
          layout: 'noBorders',
        },
      ],
      margin,
    };
  },
};
