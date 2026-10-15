import { describe, expect, it } from 'vitest';
import {
  listingCurrencyQuerySchema,
  listingPriceChannelContext,
  resolveListingCurrency,
} from './price-lists.js';

/**
 * Issue #249 (3) — a catalogue read is priced in the currency the shopper
 * selected, when the sales channel offers it.
 *
 * The storefront's currency switcher stored the choice in a cookie that no
 * catalogue read carried, and the catalogue had no way to be told: every
 * listing price, ordering and price range was the channel's default currency.
 * The listing price ports have taken an optional `currencyCode` all along; what
 * was missing is a request parameter and the one rule that turns it into that
 * argument, which `catalog` and `search` both apply.
 */

const CHANNEL = { id: 'chan-1', defaultCurrency: 'PLN', currencies: ['PLN', 'EUR'] };

describe('listingCurrencyQuerySchema — the `?currency=` a catalogue read accepts', () => {
  it('accepts a three-letter code in any case and answers it in upper case', () => {
    expect(listingCurrencyQuerySchema.parse('eur')).toBe('EUR');
    expect(listingCurrencyQuerySchema.parse('EUR')).toBe('EUR');
  });

  it.each(['', 'EU', 'EURO', 'E1R', 'EUR '])('refuses %j', (value) => {
    expect(listingCurrencyQuerySchema.safeParse(value).success).toBe(false);
  });
});

describe('resolveListingCurrency — which currency the read is priced in', () => {
  it('is the requested currency when the channel offers it', () => {
    expect(resolveListingCurrency('EUR', CHANNEL)).toBe('EUR');
  });

  it('is the channel default when nothing was requested', () => {
    expect(resolveListingCurrency(undefined, CHANNEL)).toBe('PLN');
  });

  it('is the channel default when the channel does not offer the requested one', () => {
    // A stale cookie, or a channel that dropped a currency since the shopper
    // chose it: the page still renders, in the currency the channel prices in.
    expect(resolveListingCurrency('USD', CHANNEL)).toBe('PLN');
  });

  it('compares codes without regard to case', () => {
    expect(
      resolveListingCurrency('eur', { ...CHANNEL, defaultCurrency: 'pln', currencies: ['pln', 'eur'] }),
    ).toBe('EUR');
  });
});

describe('listingPriceChannelContext — the channel half of a listing price context', () => {
  it('names a currency other than the channel default', () => {
    expect(listingPriceChannelContext(CHANNEL, 'EUR')).toEqual({
      salesChannel: { id: 'chan-1', defaultCurrency: 'PLN' },
      currencyCode: 'EUR',
    });
  });

  it('leaves the default currency implicit, so a default read asks exactly what it asked before', () => {
    expect(listingPriceChannelContext(CHANNEL, 'PLN')).toEqual({
      salesChannel: { id: 'chan-1', defaultCurrency: 'PLN' },
    });
    expect(listingPriceChannelContext(CHANNEL, undefined)).toEqual({
      salesChannel: { id: 'chan-1', defaultCurrency: 'PLN' },
    });
  });
});
