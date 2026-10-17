import { align, bool, num, str } from '../props.js';
import type { ComparisonBlockRenderer } from '../types.js';

/**
 * `comparisons.ComparisonShareLink` — the comparison's share page, as text and
 * optionally as a QR code (pdfmake's own `qr`). Nothing at all when the
 * channel has no storefront address configured (FR-012).
 */
export const comparisonShareLinkBlock: ComparisonBlockRenderer = {
  name: 'comparisons.ComparisonShareLink',
  moduleId: 'comparisons',
  render({ props, data, interpolate }) {
    const url = data.shareUrl;
    if (!url) return { text: '' };
    const stack: Record<string, unknown>[] = [];
    const label = str(props, 'label', 'View this comparison online:');
    if (label.trim() !== '') stack.push({ text: interpolate(label), fontSize: 9, color: '#475569' });
    if (bool(props, 'showUrl', true)) stack.push({ text: url, link: url, color: '#1d4ed8', fontSize: 9 });
    if (bool(props, 'showQr', false)) stack.push({ qr: url, fit: num(props, 'qrSize', 80, 40, 200), margin: [0, 4, 0, 0] });
    return { stack, alignment: align(props, 'align', 'left'), margin: [0, 8, 0, 8] };
  },
};
