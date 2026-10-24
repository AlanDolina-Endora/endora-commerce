import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { DraftLine, strings } from '../../components/rfq/RfqDraftView';

/**
 * Review 2, finding 1 (release 0.108.0) — the draft line's proposed-price
 * placeholder wrote the catalogue snapshot with `toFixed(2)`, which rounds the
 * binary double: a resolver price of 9.0450 is the double 9.04499…, so the
 * placeholder offered 9.04 where the product page shows 9,05. It is rounded
 * half-up on its decimal digits (`roundAmountHalfUp`; worked examples §10.16).
 */
describe('DraftLine — the proposed-price placeholder', () => {
  it.each([
    [9.045, '9.05'],
    [1.005, '1.01'],
    [12, '12.00'],
  ])('shows %s as %s', (amount, shown) => {
    const html = renderToString(
      <DraftLine
        line={{ productId: 'p', slug: 'p', name: 'P', unitPrice: { amount, currency: 'PLN' }, proposedUnitPrice: null, quantity: 1 }}
        t={strings(false)}
        locale="en-US"
        minimum={null}
        proposalsAllowed
        onQty={(): void => undefined}
        onProposedPrice={(): void => undefined}
        onRemove={(): void => undefined}
      />,
    );
    expect(html).toContain(`placeholder="${shown}"`);
  });
});
