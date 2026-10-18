import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed, TTL-bounded tokens for the newsletter public surface (feature 048,
 * research R5/R10). One helper mints/verifies all four token purposes so the
 * confirm/unsubscribe/open/click links share a single HMAC secret and format.
 *
 * Token format: `base64url(payloadJson).base64url(hmacSha256(payloadJson))`.
 * The payload always carries `{ p: purpose, exp: epochSeconds, ...claims }`.
 */
export type NewsletterTokenPurpose = 'confirm' | 'unsubscribe' | 'open' | 'click';

export interface NewsletterTokenClaims {
  /** Subscriber id (confirm/unsubscribe) or send-record id (open/click). */
  id: string;
  /** Optional link id for click tracking. */
  linkId?: string;
  /**
   * Digest of a click link's destination ({@link clickDestinationHash}), signed
   * into the token when the link is minted. The click tracker redirects to the
   * `?u=` destination only when it hashes to this value.
   */
  urlHash?: string;
}

interface TokenPayload extends NewsletterTokenClaims {
  p: NewsletterTokenPurpose;
  exp: number;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * The digest a click token binds its destination with: SHA-256 of the exact
 * URL string, truncated to 128 bits and base64url-encoded. Truncation is safe
 * because the token's HMAC is what makes the value unforgeable; the digest only
 * has to make two destinations distinguishable.
 */
export function clickDestinationHash(url: string): string {
  return b64urlEncode(createHash('sha256').update(url, 'utf8').digest().subarray(0, 16));
}

/** Constant-time check that `url` is the destination bound by `urlHash`. */
export function matchesClickDestination(url: string, urlHash: string): boolean {
  const a = Buffer.from(clickDestinationHash(url));
  const b = Buffer.from(urlHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export class NewsletterTokenHelper {
  constructor(private readonly secret: string) {
    if (!secret) {
      throw new Error('[newsletter] token secret must be a non-empty string');
    }
  }

  private sign(payloadJson: string): string {
    return b64urlEncode(createHmac('sha256', this.secret).update(payloadJson).digest());
  }

  /**
   * Mint a token. `ttlSeconds` bounds validity; `nowSeconds` is injectable for
   * deterministic tests (defaults to the current time).
   */
  mint(
    purpose: NewsletterTokenPurpose,
    claims: NewsletterTokenClaims,
    ttlSeconds: number,
    nowSeconds: number = Math.floor(Date.now() / 1000),
  ): string {
    const payload: TokenPayload = {
      p: purpose,
      exp: nowSeconds + ttlSeconds,
      id: claims.id,
      ...(claims.linkId !== undefined ? { linkId: claims.linkId } : {}),
      ...(claims.urlHash !== undefined ? { urlHash: claims.urlHash } : {}),
    };
    const payloadJson = JSON.stringify(payload);
    const body = b64urlEncode(Buffer.from(payloadJson, 'utf8'));
    return `${body}.${this.sign(payloadJson)}`;
  }

  /**
   * Verify a token against the expected purpose. Returns the claims on success,
   * or `null` when the signature is invalid, the purpose mismatches, the token
   * is malformed, or it has expired.
   */
  verify(
    token: string,
    purpose: NewsletterTokenPurpose,
    nowSeconds: number = Math.floor(Date.now() / 1000),
  ): NewsletterTokenClaims | null {
    const dot = token.indexOf('.');
    if (dot <= 0) return null;
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);

    let payloadJson: string;
    try {
      payloadJson = b64urlDecode(body).toString('utf8');
    } catch {
      return null;
    }

    const expectedSig = this.sign(payloadJson);
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    let payload: TokenPayload;
    try {
      payload = JSON.parse(payloadJson) as TokenPayload;
    } catch {
      return null;
    }
    if (payload.p !== purpose) return null;
    if (typeof payload.exp !== 'number' || payload.exp < nowSeconds) return null;
    if (typeof payload.id !== 'string' || payload.id.length === 0) return null;

    return {
      id: payload.id,
      ...(payload.linkId !== undefined ? { linkId: payload.linkId } : {}),
      ...(typeof payload.urlHash === 'string' ? { urlHash: payload.urlHash } : {}),
    };
  }
}
