import { align, bool, color, num, str } from '../props.js';
import type { ComparisonBlockRenderer } from '../types.js';

/**
 * `comparisons.ComparisonHeader` — the title, the export date, the display
 * mode and whose prices the table shows (`contracts/comparison-document.md` §3).
 */
export const comparisonHeaderBlock: ComparisonBlockRenderer = {
  name: 'comparisons.ComparisonHeader',
  moduleId: 'comparisons',
  render({ props, data, language, interpolate }) {
    const stack: Record<string, unknown>[] = [
      {
        text: interpolate(str(props, 'title', 'Product comparison')),
        fontSize: num(props, 'titleSize', 16, 8, 36),
        bold: true,
        color: color(props, 'titleColor', '#111827'),
      },
    ];
    if (bool(props, 'showDate', true)) {
      const date = new Intl.DateTimeFormat(language, { dateStyle: 'long' }).format(new Date(data.generatedAt));
      const label = str(props, 'dateLabel', 'Date:');
      stack.push({ text: label.trim() === '' ? date : `${interpolate(label)} ${date}`, color: '#475569', fontSize: 9 });
    }
    if (bool(props, 'showDisplayMode', true)) {
      const key = {
        all: 'modeLabelAll',
        common: 'modeLabelCommon',
        differences: 'modeLabelDifferences',
      }[data.view.displayMode];
      const fallback = {
        all: 'All attributes',
        common: 'Common attributes only',
        differences: 'Differences only',
      }[data.view.displayMode];
      stack.push({ text: interpolate(str(props, key, fallback)), italics: true, color: '#555555', fontSize: 9 });
    }
    if (bool(props, 'showPricedFor', true)) {
      const text =
        data.view.pricedFor === 'organization'
          ? str(props, 'pricedForOrganizationText', 'Prices for your organisation.')
          : str(props, 'pricedForChannelText', 'Catalogue prices.');
      if (text.trim() !== '') stack.push({ text: interpolate(text), color: '#475569', fontSize: 9 });
    }
    return {
      stack,
      alignment: align(props, 'align', 'left'),
      margin: [0, 0, 0, num(props, 'marginBottom', 12, 0, 144)],
    };
  },
};
