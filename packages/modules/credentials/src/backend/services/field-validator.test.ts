import { randomBytes } from 'crypto';
import { describe, expect, it } from 'vitest';
import { isCredentialEndpointField, type FieldDefinition } from '@endora-commerce/contracts';
import {
  buildPersistableValues,
  maskSecrets,
} from './field-validator.js';
import { llmConfigurationType } from '../types/llm.type.js';
import { emailAdapterConfigurationType } from '../types/email-adapter.type.js';
import {
  decryptSecretValue,
  isSecretEnvelope,
} from './secret-value-codec.js';

/**
 * Feature 058 US1 (T017) — field validation + secret masking derived purely
 * from a type descriptor (no DB). Asserts required/kind/select enforcement,
 * write-only secret preservation, and that masking never emits a secret value.
 */
const KEY = randomBytes(32).toString('base64');
const anthropic = llmConfigurationType.providers.find((p) => p.code === 'anthropic')!;
const smtp = emailAdapterConfigurationType.providers.find((p) => p.code === 'smtp')!;

describe('buildPersistableValues [unit]', () => {
  it('encrypts a required secret and keeps plain fields', () => {
    const { values, errors } = buildPersistableValues({
      fields: anthropic.fields,
      submitted: { apiKey: 'sk-live', model: 'claude-opus-4-8' },
      existing: {},
      secretEncryptionKey: KEY,
    });
    expect(errors).toEqual([]);
    expect(isSecretEnvelope(values['apiKey'])).toBe(true);
    expect(decryptSecretValue(values['apiKey'], KEY)).toBe('sk-live');
    expect(values['model']).toBe('claude-opus-4-8');
  });

  it('flags a missing required field (secret and non-secret)', () => {
    const { errors } = buildPersistableValues({
      fields: anthropic.fields,
      submitted: {},
      existing: {},
      secretEncryptionKey: KEY,
    });
    const keys = errors.map((e) => e.field).sort();
    expect(keys).toEqual(['apiKey', 'model']);
  });

  it('preserves an existing secret when the field is blank / [redacted] on update', () => {
    const existing = buildPersistableValues({
      fields: anthropic.fields,
      submitted: { apiKey: 'sk-first', model: 'm1' },
      existing: {},
      secretEncryptionKey: KEY,
    }).values;

    const updated = buildPersistableValues({
      fields: anthropic.fields,
      submitted: { apiKey: '[redacted]', model: 'm2' },
      existing,
      secretEncryptionKey: KEY,
    });
    expect(updated.errors).toEqual([]);
    // The secret envelope is carried over verbatim (not re-encrypted / cleared).
    expect(updated.values['apiKey']).toBe(existing['apiKey']);
    expect(updated.values['model']).toBe('m2');
  });

  it('re-encrypts a secret when a new non-empty value is submitted', () => {
    const existing = { apiKey: 'legacy', model: 'm1' };
    const updated = buildPersistableValues({
      fields: anthropic.fields,
      submitted: { apiKey: 'sk-new' },
      existing,
      secretEncryptionKey: KEY,
    });
    expect(isSecretEnvelope(updated.values['apiKey'])).toBe(true);
    expect(decryptSecretValue(updated.values['apiKey'], KEY)).toBe('sk-new');
    // Absent non-secret keeps existing.
    expect(updated.values['model']).toBe('m1');
  });

  it('validates kinds: number and boolean', () => {
    const bad = buildPersistableValues({
      fields: smtp.fields,
      submitted: { host: 'mail', port: 'not-a-number', secure: 'yes' },
      existing: {},
      secretEncryptionKey: KEY,
    });
    const badKeys = bad.errors.map((e) => e.field).sort();
    expect(badKeys).toContain('port');
    expect(badKeys).toContain('secure');

    const good = buildPersistableValues({
      fields: smtp.fields,
      submitted: { host: 'mail', port: 587, secure: true },
      existing: {},
      secretEncryptionKey: KEY,
    });
    expect(good.errors).toEqual([]);
    expect(good.values['port']).toBe(587);
    expect(good.values['secure']).toBe(true);
  });

  it('enforces select options', () => {
    const fields: FieldDefinition[] = [
      {
        key: 'tier',
        label: 'Tier',
        kind: 'select',
        required: true,
        secret: false,
        options: [
          { value: 'gold', label: 'Gold' },
          { value: 'silver', label: 'Silver' },
        ],
      },
    ];
    expect(
      buildPersistableValues({ fields, submitted: { tier: 'platinum' }, existing: {}, secretEncryptionKey: KEY }).errors,
    ).toHaveLength(1);
    expect(
      buildPersistableValues({ fields, submitted: { tier: 'gold' }, existing: {}, secretEncryptionKey: KEY }).errors,
    ).toEqual([]);
  });
});

describe('maskSecrets [unit]', () => {
  it('never emits a secret value; exposes isSet instead', () => {
    const { values } = buildPersistableValues({
      fields: anthropic.fields,
      submitted: { apiKey: 'sk-live', model: 'claude-opus-4-8' },
      existing: {},
      secretEncryptionKey: KEY,
    });
    const masked = maskSecrets(values, anthropic.fields);
    const apiKeyDto = masked.find((f) => f.key === 'apiKey')!;
    expect(apiKeyDto.secret).toBe(true);
    expect(apiKeyDto.isSet).toBe(true);
    expect('value' in apiKeyDto).toBe(false);
    // No serialization of the masked DTO leaks the plaintext or envelope.
    expect(JSON.stringify(masked)).not.toContain('sk-live');

    const modelDto = masked.find((f) => f.key === 'model')!;
    expect(modelDto.secret).toBe(false);
    expect(modelDto.value).toBe('claude-opus-4-8');
  });
});

/** Feature 151, FR-007 / research R21 — `format: 'url'`. */
describe('buildPersistableValues — url format [unit]', () => {
  const compatible = llmConfigurationType.providers.find((p) => p.code === 'openai_compatible')!;
  const deepseek = llmConfigurationType.providers.find((p) => p.code === 'deepseek')!;
  const run = (fields: FieldDefinition[], baseUrl: unknown) =>
    buildPersistableValues({
      fields,
      submitted: { apiKey: 'k', model: 'm', ...(baseUrl === undefined ? {} : { baseUrl }) },
      existing: {},
      secretEncryptionKey: KEY,
    });

  it.each(['https://openrouter.ai/api/v1', 'http://localhost:11434/v1', 'https://api.deepseek.com'])(
    'accepts %s',
    (url) => {
      const { values, errors } = run(compatible.fields, url);
      expect(errors).toEqual([]);
      expect(values['baseUrl']).toBe(url);
    },
  );

  it.each(['ftp://llm.example', 'api.deepseek.com', 'not a url', 'javascript:alert(1)'])(
    'refuses %s',
    (url) => {
      expect(run(deepseek.fields, url).errors).toEqual([
        { field: 'baseUrl', message: 'must be an absolute http or https URL' },
      ]);
    },
  );

  it('accepts an optional url left blank or absent', () => {
    expect(run(deepseek.fields, '').errors).toEqual([]);
    expect(run(deepseek.fields, undefined).errors).toEqual([]);
  });

  it('requires the Base URL of an OpenAI-compatible configuration', () => {
    expect(run(compatible.fields, undefined).errors).toEqual([{ field: 'baseUrl', message: 'is required' }]);
    expect(run(compatible.fields, '').errors).toEqual([{ field: 'baseUrl', message: 'is required' }]);
  });
});

/**
 * A stored secret goes wherever the record's endpoint says. When an update
 * changes the endpoint — an LLM Base URL, an SMTP host — every stored secret
 * of the record has to be re-entered in the same request; it is never carried
 * over to the new endpoint.
 */
describe('buildPersistableValues — a changed endpoint [unit]', () => {
  const openai = llmConfigurationType.providers.find((p) => p.code === 'openai')!;
  const stored = (fields: FieldDefinition[], submitted: Record<string, unknown>) =>
    buildPersistableValues({ fields, submitted, existing: {}, secretEncryptionKey: KEY }).values;

  it('asks for the API key again when the Base URL changes', () => {
    const existing = stored(openai.fields, {
      apiKey: 'sk-first',
      model: 'gpt-5',
      baseUrl: 'https://api.openai.com/v1',
    });

    const result = buildPersistableValues({
      fields: openai.fields,
      submitted: { baseUrl: 'https://llm.example.net/v1' },
      existing,
      secretEncryptionKey: KEY,
    });

    expect(result.errors).toEqual([]);
    expect(result.secretsToReenter).toEqual([
      { field: 'apiKey', label: 'API Key', endpoints: ['Base URL'] },
    ]);
    expect(result.values['apiKey']).toBeUndefined();
  });

  it('treats setting, clearing and replacing an optional Base URL alike', () => {
    const withUrl = stored(openai.fields, {
      apiKey: 'sk-first',
      model: 'gpt-5',
      baseUrl: 'https://api.openai.com/v1',
    });
    const withoutUrl = stored(openai.fields, { apiKey: 'sk-first', model: 'gpt-5' });

    for (const [existing, baseUrl] of [
      [withUrl, ''],
      [withoutUrl, 'https://llm.example.net/v1'],
    ] as const) {
      const result = buildPersistableValues({
        fields: openai.fields,
        submitted: { baseUrl },
        existing,
        secretEncryptionKey: KEY,
      });
      expect(result.secretsToReenter.map((s) => s.field)).toEqual(['apiKey']);
    }
  });

  it('accepts the change when the secret is re-entered in the same request', () => {
    const existing = stored(openai.fields, {
      apiKey: 'sk-first',
      model: 'gpt-5',
      baseUrl: 'https://api.openai.com/v1',
    });

    const result = buildPersistableValues({
      fields: openai.fields,
      submitted: { baseUrl: 'https://llm.example.net/v1', apiKey: 'sk-for-the-new-endpoint' },
      existing,
      secretEncryptionKey: KEY,
    });

    expect(result.errors).toEqual([]);
    expect(result.secretsToReenter).toEqual([]);
    expect(decryptSecretValue(result.values['apiKey'], KEY)).toBe('sk-for-the-new-endpoint');
  });

  it('keeps the stored secret while the endpoint is unchanged, even resent with other whitespace', () => {
    const existing = stored(openai.fields, {
      apiKey: 'sk-first',
      model: 'gpt-5',
      baseUrl: 'https://api.openai.com/v1',
    });

    const result = buildPersistableValues({
      fields: openai.fields,
      submitted: { baseUrl: ' https://api.openai.com/v1 ', model: 'gpt-5-mini', apiKey: '[redacted]' },
      existing,
      secretEncryptionKey: KEY,
    });

    expect(result.secretsToReenter).toEqual([]);
    expect(result.values['apiKey']).toBe(existing['apiKey']);
  });

  it('asks for the SMTP password again when the host changes', () => {
    const existing = stored(smtp.fields, {
      host: 'smtp.example.com',
      port: 587,
      username: 'mailer',
      password: 'smtp-secret',
    });

    const moved = buildPersistableValues({
      fields: smtp.fields,
      submitted: { host: 'smtp.example.org' },
      existing,
      secretEncryptionKey: KEY,
    });
    expect(moved.secretsToReenter).toEqual([
      { field: 'password', label: 'Password', endpoints: ['Host'] },
    ]);

    const samePlace = buildPersistableValues({
      fields: smtp.fields,
      submitted: { port: 465, secure: true },
      existing,
      secretEncryptionKey: KEY,
    });
    expect(samePlace.secretsToReenter).toEqual([]);
  });

  it('has nothing to ask for when no secret is stored', () => {
    const existing = stored(smtp.fields, { host: 'smtp.example.com', port: 25 });
    const result = buildPersistableValues({
      fields: smtp.fields,
      submitted: { host: 'smtp.example.org' },
      existing,
      secretEncryptionKey: KEY,
    });
    expect(result.secretsToReenter).toEqual([]);
  });
});

describe('isCredentialEndpointField [unit]', () => {
  it('names the fields that say where every shipped type sends its secrets', () => {
    const endpoints = [llmConfigurationType, emailAdapterConfigurationType].flatMap((type) =>
      type.providers.map(
        (p) => `${type.code}/${p.code}: ${p.fields.filter(isCredentialEndpointField).map((f) => f.key).join(',')}`,
      ),
    );
    expect(endpoints).toEqual([
      'llm/openai: baseUrl',
      'llm/google: baseUrl',
      'llm/anthropic: baseUrl',
      'llm/deepseek: baseUrl',
      'llm/openai_compatible: baseUrl',
      'email_adapter/smtp: host',
      'email_adapter/amazon_ses: ',
      'email_adapter/sendgrid: ',
    ]);
  });

  it('reads an explicit declaration before the url format', () => {
    const base: FieldDefinition = { key: 'k', label: 'K', kind: 'string', required: false, secret: false };
    expect(isCredentialEndpointField({ ...base, format: 'url' })).toBe(true);
    expect(isCredentialEndpointField({ ...base, format: 'url', endpoint: false })).toBe(false);
    expect(isCredentialEndpointField({ ...base, endpoint: true })).toBe(true);
    expect(isCredentialEndpointField(base)).toBe(false);
  });
});
