// `request.unsignCookie` and `reply.setCookie` are `@fastify/cookie`'s
// augmentation; the type-only import loads it and emits nothing.
import type {} from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  CUSTOMER_KNOWN_DEVICE_COOKIE_NAME,
  CUSTOMER_KNOWN_DEVICE_MAX_AGE_SECONDS,
} from '@endora-commerce/contracts';

/**
 * The known-device cookie of the customer authentication throttle: read it
 * verified, set it signed.
 *
 * The signature is the server's cookie secret, the one `@fastify/cookie` was
 * registered with, so nobody who has not completed a sign-in can write a value
 * this file will return. What the value means, and when it stops being
 * honoured, is `customer_accounts`' throttle's to say.
 *
 * `organizations` and `mfa` each carry a file like this one: both complete a
 * customer sign-in, and a module may not import another module's sources.
 */

/** The cookie's value when its signature verifies; otherwise nothing. */
export function readCustomerKnownDevice(request: FastifyRequest): string | undefined {
  const raw = (request as { cookies?: Record<string, string | undefined> }).cookies?.[
    CUSTOMER_KNOWN_DEVICE_COOKIE_NAME
  ];
  if (!raw) return undefined;
  const unsigned = request.unsignCookie(raw);
  return unsigned.valid && unsigned.value ? unsigned.value : undefined;
}

/**
 * Remember this device after a completed sign-in. `value` is what the login
 * answered as `knownDevice`; `null` sets nothing.
 */
export function rememberCustomerKnownDevice(reply: FastifyReply, value: string | null): void {
  if (value === null) return;
  reply.setCookie(CUSTOMER_KNOWN_DEVICE_COOKIE_NAME, value, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    maxAge: CUSTOMER_KNOWN_DEVICE_MAX_AGE_SECONDS,
    signed: true,
  });
}
