import type { LightMyRequestResponse } from 'fastify';

/**
 * The browser-binding cookie a federated sign-in's `start` set, as the cookie
 * jar the matching `callback` has to present. The callback refuses a request
 * without it, exactly as a browser that did not start the transaction is
 * refused.
 */
export function oauthBinding(start: LightMyRequestResponse): Record<string, string> {
  const cookie = start.cookies.find((c) => c.name === 'b2b_oauth_binding');
  if (!cookie) throw new Error(`start set no binding cookie (status ${start.statusCode})`);
  return { b2b_oauth_binding: cookie.value };
}
