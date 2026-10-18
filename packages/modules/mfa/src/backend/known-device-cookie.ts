// `request.unsignCookie` and `reply.setCookie` are `@fastify/cookie`'s
// augmentation; the type-only import loads it and emits nothing.
import type {} from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  ADMIN_KNOWN_DEVICE_COOKIE_NAME,
  ADMIN_KNOWN_DEVICE_MAX_AGE_SECONDS,
  CUSTOMER_KNOWN_DEVICE_COOKIE_NAME,
  CUSTOMER_KNOWN_DEVICE_MAX_AGE_SECONDS,
} from '@endora-commerce/contracts';

/**
 * The known-device cookies of the two authentication throttles — the
 * administrator one and the customer one: read them verified, set them signed.
 *
 * The signature is the server's cookie secret, the one `@fastify/cookie` was
 * registered with, so nobody who has not completed a sign-in can write a value
 * this file will return. What the value means, and when it stops being
 * honoured, is the owning throttle's to say — `admin_users`' or
 * `customer_accounts'`.
 *
 * `admin_users`, `organizations` and `mfa` each carry a file like this one:
 * each issues a session, and a module may not import another module's sources.
 */

/** Which surface's cookie: the administrator's or the customer's. */
export type KnownDeviceSurface = 'admin' | 'customer';

const COOKIE: Record<KnownDeviceSurface, { name: string; maxAge: number }> = {
  admin: { name: ADMIN_KNOWN_DEVICE_COOKIE_NAME, maxAge: ADMIN_KNOWN_DEVICE_MAX_AGE_SECONDS },
  customer: {
    name: CUSTOMER_KNOWN_DEVICE_COOKIE_NAME,
    maxAge: CUSTOMER_KNOWN_DEVICE_MAX_AGE_SECONDS,
  },
};

/** The cookie's value when its signature verifies; otherwise nothing. */
export function readKnownDevice(
  request: FastifyRequest,
  surface: KnownDeviceSurface = 'admin',
): string | undefined {
  const raw = (request as { cookies?: Record<string, string | undefined> }).cookies?.[
    COOKIE[surface].name
  ];
  if (!raw) return undefined;
  const unsigned = request.unsignCookie(raw);
  return unsigned.valid && unsigned.value ? unsigned.value : undefined;
}

/**
 * Remember this device after a completed sign-in. `value` is what the
 * surface's throttle port's `issueKnownDevice` answered; `null` sets nothing.
 */
export function rememberKnownDevice(
  reply: FastifyReply,
  value: string | null,
  surface: KnownDeviceSurface = 'admin',
): void {
  if (value === null) return;
  reply.setCookie(COOKIE[surface].name, value, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    maxAge: COOKIE[surface].maxAge,
    signed: true,
  });
}
