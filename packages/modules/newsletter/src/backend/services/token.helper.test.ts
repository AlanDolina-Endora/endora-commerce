import { describe, it, expect } from 'vitest';
import { NewsletterTokenHelper, clickDestinationHash, matchesClickDestination } from './token.helper.js';

describe('NewsletterTokenHelper', () => {
  const helper = new NewsletterTokenHelper('test-secret-key');
  const now = 1_700_000_000;

  it('round-trips a token for its purpose', () => {
    const token = helper.mint('confirm', { id: 'sub-1' }, 3600, now);
    const claims = helper.verify(token, 'confirm', now + 10);
    expect(claims).toEqual({ id: 'sub-1' });
  });

  it('preserves the optional linkId for click tracking', () => {
    const token = helper.mint('click', { id: 'rec-1', linkId: 'cta-2' }, 3600, now);
    expect(helper.verify(token, 'click', now)).toEqual({ id: 'rec-1', linkId: 'cta-2' });
  });

  it('carries the destination digest bound to a click link', () => {
    const urlHash = clickDestinationHash('https://shop.test/deal');
    const token = helper.mint('click', { id: 'rec-1', linkId: 'cta-2', urlHash }, 3600, now);
    expect(helper.verify(token, 'click', now)).toEqual({ id: 'rec-1', linkId: 'cta-2', urlHash });
  });

  it('rejects a token whose bound destination digest was changed after signing', () => {
    const token = helper.mint('click', { id: 'rec-1', urlHash: clickDestinationHash('https://shop.test/deal') }, 3600, now);
    const [, sig] = token.split('.');
    const changed = `${Buffer.from(JSON.stringify({ p: 'click', exp: now + 3600, id: 'rec-1', urlHash: clickDestinationHash('https://other.example/') })).toString('base64url')}.${sig}`;
    expect(helper.verify(changed, 'click', now)).toBeNull();
  });

  it('matches a destination only against its own digest', () => {
    const urlHash = clickDestinationHash('https://shop.test/deal');
    expect(matchesClickDestination('https://shop.test/deal', urlHash)).toBe(true);
    expect(matchesClickDestination('https://shop.test/deal?x=1', urlHash)).toBe(false);
    expect(matchesClickDestination('https://other.example/', urlHash)).toBe(false);
    expect(matchesClickDestination('https://shop.test/deal', '')).toBe(false);
  });

  it('rejects a token used for the wrong purpose', () => {
    const token = helper.mint('confirm', { id: 'sub-1' }, 3600, now);
    expect(helper.verify(token, 'unsubscribe', now)).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = helper.mint('confirm', { id: 'sub-1' }, 60, now);
    expect(helper.verify(token, 'confirm', now + 61)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const token = helper.mint('confirm', { id: 'sub-1' }, 3600, now);
    const [, sig] = token.split('.');
    const forged = `${Buffer.from(JSON.stringify({ p: 'confirm', exp: now + 3600, id: 'attacker' })).toString('base64url')}.${sig}`;
    expect(helper.verify(forged, 'confirm', now)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const other = new NewsletterTokenHelper('different-secret');
    const token = other.mint('confirm', { id: 'sub-1' }, 3600, now);
    expect(helper.verify(token, 'confirm', now)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(helper.verify('not-a-token', 'confirm', now)).toBeNull();
    expect(helper.verify('', 'confirm', now)).toBeNull();
    expect(helper.verify('.abc', 'confirm', now)).toBeNull();
  });

  it('throws when constructed without a secret', () => {
    expect(() => new NewsletterTokenHelper('')).toThrow();
  });
});
