import { describe, expect, it } from 'vitest';
import { LlmProviderError } from '@endora-commerce/llm-client';
import { providerFailureToken } from './provider-error-map.js';

/** Feature 151, T024 — `contracts/page-builder-translation-api.md` §3. */
describe('providerFailureToken', () => {
  it.each([
    [new LlmProviderError('openai', 'http', 'x', 401), 'credentials_rejected'],
    [new LlmProviderError('anthropic', 'http', 'x', 403), 'credentials_rejected'],
    [new LlmProviderError('google', 'http', 'x', 429), 'rate_limited'],
    [new LlmProviderError('openai', 'http', 'x', 500), 'unavailable'],
    [new LlmProviderError('openai', 'http', 'x', 404), 'unavailable'],
    [new LlmProviderError('deepseek', 'network', 'x'), 'unavailable'],
    [new LlmProviderError('openai_compatible', 'network', 'x', undefined, true), 'timeout'],
    [new LlmProviderError('openai', 'malformed', 'x'), 'malformed'],
  ] as const)('%s → %s', (error, token) => {
    expect(providerFailureToken(error)).toBe(token);
  });
});
