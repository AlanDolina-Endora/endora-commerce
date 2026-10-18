/**
 * A customer session whose account may no longer act — blocked, deleted or gone
 * — is not a signed-in customer.
 *
 * Blocking and deleting an account revoke its sessions, but that is a step each
 * write has to remember, and a session row can outlive one that forgot. The
 * request hook already reads the account behind every customer session (to bind
 * its organisation), so the same read decides whether the session binds a
 * customer at all; `requireCustomer` then answers such a request 401, as the
 * admin guard answers a session of an account that is no longer active.
 *
 * An impersonation session is an administrator's, and is bound as before.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE_NAME } from '@endora-commerce/contracts';
import { authPlugin, type CustomerSessionAccount } from './plugin.js';
import { createRequireCustomer } from './require-customer.js';
import type { SessionService } from './services/session-service.js';

const accounts: Record<string, CustomerSessionAccount> = {
  active: { organizationId: 'org-1', active: true },
  blocked: { organizationId: 'org-1', active: false },
  deleted: { organizationId: 'org-1', active: false },
};

function sessionFor(kind: 'customer' | 'impersonation', customerAccountId: string) {
  return {
    kind,
    session: {
      id: `s-${kind}-${customerAccountId}`,
      customerAccountId,
      impersonatorAdminUserId: kind === 'impersonation' ? 'admin-1' : null,
    },
  };
}

describe('auth plugin — the account behind a customer session', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    // What `@fastify/cookie` contributes to this plugin: `request.cookies`.
    app.decorateRequest('cookies', null as never);
    app.addHook('onRequest', async (request) => {
      const header = request.headers.cookie ?? '';
      (request as unknown as { cookies: Record<string, string> }).cookies = Object.fromEntries(
        header
          .split(';')
          .map((pair) => pair.trim())
          .filter((pair) => pair.includes('='))
          .map((pair) => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)]),
      );
    });
    await app.register(authPlugin, {
      sessionService: {
        loadSession: async (cookieValue: string) => {
          const [kind, id] = cookieValue.split('.') as ['customer' | 'impersonation', string];
          return sessionFor(kind, id);
        },
        touchLastSeen: async () => undefined,
      } as unknown as SessionService,
      customerAccountResolver: async (id) => accounts[id] ?? null,
    });
    const requireCustomer = createRequireCustomer();
    app.get('/customer', { preHandler: requireCustomer }, async (request) => request.actor);
    app.get('/open', async (request) => request.actor);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const ask = (url: string, cookie: string) =>
    app.inject({ method: 'GET', url, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } });

  it('admits the session of an active account, bound to its organisation', async () => {
    const res = await ask('/customer', 'customer.active');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ kind: 'customer', organizationId: 'org-1' });
  });

  it.each(['blocked', 'deleted', 'missing'])(
    'refuses the session of a %s account with 401',
    async (id) => {
      const res = await ask('/customer', `customer.${id}`);
      expect(res.statusCode).toBe(401);
      // And it is nobody on an open route, rather than a customer.
      expect((await ask('/open', `customer.${id}`)).json()).toEqual({ kind: 'anonymous' });
    },
  );

  it('still binds an impersonation session', async () => {
    const res = await ask('/customer', 'impersonation.blocked');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ kind: 'customer', impersonatorAdminUserId: 'admin-1' });
  });
});
