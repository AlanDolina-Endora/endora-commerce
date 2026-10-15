import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { draftEditRateLimitKey } from './routes.customer.js';

/**
 * The draft-edit rate limit's key (security review W3).
 *
 * The key used to embed the raw `:id`, so one authenticated customer could
 * mint a fresh bucket per request by varying a path segment the route would
 * refuse anyway. Only a well-formed uuid enters the key now; anything else
 * shares one bucket per caller.
 */

const CUSTOMER = '00000000-0000-4000-8000-0000000000c1';
const REQUEST_A = '00000000-0000-4000-8000-0000000000a1';
const REQUEST_B = '00000000-0000-4000-8000-0000000000b2';

function request(id: string | undefined, actor?: unknown, ip = '203.0.113.7'): FastifyRequest {
  return { actor, ip, params: id === undefined ? {} : { id } } as unknown as FastifyRequest;
}

const customer = { kind: 'customer', customerAccountId: CUSTOMER };

describe('draftEditRateLimitKey (W3)', () => {
  it('keys a well-formed request id per caller and per request', () => {
    expect(draftEditRateLimitKey(request(REQUEST_A, customer))).toBe(
      `quote-request-draft-edit:${CUSTOMER}:${REQUEST_A}`,
    );
    expect(draftEditRateLimitKey(request(REQUEST_B, customer))).not.toBe(
      draftEditRateLimitKey(request(REQUEST_A, customer)),
    );
  });

  it('folds every malformed id into one bucket per caller, never echoing the segment', () => {
    const keys = new Set(
      ['x', 'x'.repeat(5000), 'not-a-uuid', `${REQUEST_A}x`, '', '../../etc'].map((id) =>
        draftEditRateLimitKey(request(id, customer)),
      ),
    );
    expect([...keys]).toEqual([`quote-request-draft-edit:${CUSTOMER}`]);
    expect(draftEditRateLimitKey(request(undefined, customer))).toBe(
      `quote-request-draft-edit:${CUSTOMER}`,
    );
  });

  it('keys a caller that is not a customer on its address', () => {
    expect(draftEditRateLimitKey(request('junk', undefined, '198.51.100.9'))).toBe(
      'quote-request-draft-edit:198.51.100.9',
    );
  });
});
