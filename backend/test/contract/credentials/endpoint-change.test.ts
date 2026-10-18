import { randomBytes } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';

/**
 * A stored secret is only ever sent where it was entered for. `PUT
 * /api/v1/admin/credentials/:code` that changes a field saying where the
 * record's secrets go — an LLM Base URL, an SMTP host — is refused with 422
 * `CREDENTIAL_SECRET_REENTRY_REQUIRED` unless the stored secrets are re-entered
 * in the same request, and the refused request changes nothing.
 */
const ADMIN = { cookies: { b2b_session: 'stub-admin-session' } };

interface FieldDto {
  key: string;
  isSet?: boolean;
  value?: unknown;
}

describe('Credentials — changing an endpoint asks for the secrets again [contract]', () => {
  let h: BackendServerHandle;

  beforeAll(async () => {
    process.env['SETTINGS_SECRET_ENCRYPTION_KEY'] =
      process.env['SETTINGS_SECRET_ENCRYPTION_KEY'] ?? randomBytes(32).toString('base64');
    h = await setupBackendServer();
  });
  afterAll(async () => {
    await teardownBackendServer(h);
  });

  const fieldsOf = async (code: string): Promise<FieldDto[]> => {
    const res = await h.app.inject({ method: 'GET', url: `/api/v1/admin/credentials/${code}`, ...ADMIN });
    expect(res.statusCode).toBe(200);
    return (res.json() as { fields: FieldDto[] }).fields;
  };

  const put = (code: string, values: Record<string, unknown>) =>
    h.app.inject({ method: 'PUT', url: `/api/v1/admin/credentials/${code}`, payload: { values }, ...ADMIN });

  it('refuses a new LLM Base URL without the API key, and keeps the record as it was', async () => {
    const created = await h.app.inject({
      method: 'POST',
      url: '/api/v1/admin/credentials',
      payload: {
        code: 'endpoint-llm',
        name: 'Endpoint LLM',
        typeCode: 'llm',
        providerCode: 'openai',
        values: { apiKey: 'sk-original', model: 'gpt-5', baseUrl: 'https://api.openai.com/v1' },
      },
      ...ADMIN,
    });
    expect(created.statusCode).toBe(201);

    const refused = await put('endpoint-llm', { baseUrl: 'https://llm.example.net/v1' });
    expect(refused.statusCode).toBe(422);
    const error = refused.json().error as { code: string; details: { fields: string[] } };
    expect(error.code).toBe('CREDENTIAL_SECRET_REENTRY_REQUIRED');
    expect(error.details.fields).toEqual(['apiKey']);

    const after = await fieldsOf('endpoint-llm');
    expect(after.find((f) => f.key === 'baseUrl')?.value).toBe('https://api.openai.com/v1');
    expect(after.find((f) => f.key === 'apiKey')?.isSet).toBe(true);
  });

  it('accepts the new Base URL together with a re-entered API key', async () => {
    const res = await put('endpoint-llm', {
      baseUrl: 'https://llm.example.net/v1',
      apiKey: 'sk-for-the-new-endpoint',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('sk-for-the-new-endpoint');
    const after = await fieldsOf('endpoint-llm');
    expect(after.find((f) => f.key === 'baseUrl')?.value).toBe('https://llm.example.net/v1');
  });

  it('still saves an edit that leaves the endpoint alone without the secret', async () => {
    const res = await put('endpoint-llm', { model: 'gpt-5-mini' });
    expect(res.statusCode).toBe(200);
    expect((await fieldsOf('endpoint-llm')).find((f) => f.key === 'apiKey')?.isSet).toBe(true);
  });

  it('refuses a new SMTP host without the password', async () => {
    const created = await h.app.inject({
      method: 'POST',
      url: '/api/v1/admin/credentials',
      payload: {
        code: 'endpoint-smtp',
        name: 'Endpoint SMTP',
        typeCode: 'email_adapter',
        providerCode: 'smtp',
        values: { host: 'smtp.example.com', port: 587, username: 'mailer', password: 'smtp-secret' },
      },
      ...ADMIN,
    });
    expect(created.statusCode).toBe(201);

    const refused = await put('endpoint-smtp', { host: 'smtp.example.org' });
    expect(refused.statusCode).toBe(422);
    expect(refused.json().error.code).toBe('CREDENTIAL_SECRET_REENTRY_REQUIRED');
    expect((await fieldsOf('endpoint-smtp')).find((f) => f.key === 'host')?.value).toBe('smtp.example.com');
  });
});
