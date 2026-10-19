import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { StorefrontApiError } from '../lib/api/client';
import { cartActionFailure } from '../lib/cart-action-failure';

/**
 * Issue #249 (1) — the product page's cart and one-click actions answer in the
 * shopper's language.
 *
 * Their fallbacks were literals — two written in Polish and three in English —
 * so a failure read in whichever language its line happened to be written in.
 * The add-to-cart button's label was a Polish literal too. The literals the
 * page must no longer carry are listed in the last `describe` below.
 */

describe('cartActionFailure', () => {
  it('words the fallback in the request\'s language', () => {
    const failure = new TypeError('fetch failed');

    expect(cartActionFailure(failure, 'en-US', 'product.addToCartFailed')).toBe(
      'Could not add the product to the cart.',
    );
    expect(cartActionFailure(failure, 'pl-PL', 'product.addToCartFailed')).toBe(
      'Nie udało się dodać produktu do koszyka.',
    );
    expect(cartActionFailure(failure, 'en-US', 'product.oneClickFailed')).toBe(
      'Could not place the order.',
    );
    expect(cartActionFailure(failure, 'pl-PL', 'product.oneClickFailed')).toBe(
      'Nie udało się złożyć zamówienia.',
    );
  });

  it('keeps the backend\'s refusal, unchanged, when there is one', () => {
    const refusal = new StorefrontApiError(409, 'OUT_OF_STOCK', 'Only 2 left in stock.');

    expect(cartActionFailure(refusal, 'pl-PL', 'product.addToCartFailed')).toBe(refusal.message);
  });
});

describe('cartActionFailure on a store the shopper may not use (`specs/154-sales-channel-access/`)', () => {
  it('words a channel refusal in the shopper\'s language, whatever the backend answered in', () => {
    const notPermitted = new StorefrontApiError(403, 'SALES_CHANNEL_NOT_PERMITTED', 'x');
    const signIn = new StorefrontApiError(403, 'SALES_CHANNEL_SIGN_IN_REQUIRED', 'x');

    expect(cartActionFailure(notPermitted, 'pl-PL', 'product.addToCartFailed')).toBe(
      'To konto nie ma dostępu do tego sklepu.',
    );
    expect(cartActionFailure(notPermitted, 'en-US', 'product.oneClickFailed')).toBe(
      'This account does not have access to this store.',
    );
    expect(cartActionFailure(signIn, 'en-US', 'product.addToCartFailed')).toBe(
      'This store is available to signed-in customers only. Please sign in.',
    );
    expect(cartActionFailure(signIn, 'pl-PL', 'product.addToCartFailed')).toBe(
      'Ten sklep jest dostępny tylko dla zalogowanych klientów. Zaloguj się.',
    );
  });
});

describe('the product page', () => {
  const source = readFileSync(
    resolve(import.meta.dirname, '../app/(catalog)/p/[slug]/page.tsx'),
    'utf8',
  );

  it.each([
    'Dodaj do koszyka',
    'Nie udało się dodać produktu do koszyka.',
    'Could not add to cart.',
    'Could not place the order.',
  ])('carries no hard-coded %j', (literal) => {
    expect(source).not.toContain(literal);
  });
});

describe('cartActionFailure without a readable locale', () => {
  it('answers in the catalogue default rather than throwing', () => {
    expect(cartActionFailure(new Error('boom'), undefined, 'product.addToCartFailed')).toBe(
      'Could not add the product to the cart.',
    );
  });
});
