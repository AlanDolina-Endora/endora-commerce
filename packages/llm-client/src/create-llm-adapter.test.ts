import { describe, expect, it, vi } from 'vitest';
import { AnthropicAdapter } from './anthropic-adapter.js';
import { createLlmAdapter, defaultBaseUrlFor, LlmConfigurationError } from './create-llm-adapter.js';
import { GoogleAdapter } from './google-adapter.js';
import { OpenAiAdapter } from './openai-adapter.js';

/** Feature 151, research R21 — one factory, used by `prompt_actions` and `cms`. */

function urlOf(adapterFetch: ReturnType<typeof vi.fn>): string {
  return (adapterFetch.mock.calls[0] as [string])[0];
}

const ok = { choices: [{ message: { content: 'x' }, finish_reason: 'stop' }] };
const request = { model: 'm', system: 's', maxTokens: 10, messages: [], tools: [] };

describe('createLlmAdapter', () => {
  it('builds the adapter of each protocol', () => {
    expect(createLlmAdapter('anthropic', { apiKey: 'k' })).toBeInstanceOf(AnthropicAdapter);
    expect(createLlmAdapter('google', { apiKey: 'k' })).toBeInstanceOf(GoogleAdapter);
    expect(createLlmAdapter('openai', { apiKey: 'k' })).toBeInstanceOf(OpenAiAdapter);
    expect(createLlmAdapter('deepseek', { apiKey: 'k' })).toBeInstanceOf(OpenAiAdapter);
    expect(
      createLlmAdapter('openai_compatible', { apiKey: 'k', baseUrl: 'http://localhost:11434/v1' }),
    ).toBeInstanceOf(OpenAiAdapter);
  });

  it.each([
    ['openai', null, 'https://api.openai.com/v1/chat/completions'],
    ['openai', '  ', 'https://api.openai.com/v1/chat/completions'],
    ['openai', 'https://gateway.example/openai/v1', 'https://gateway.example/openai/v1/chat/completions'],
    ['deepseek', undefined, 'https://api.deepseek.com/chat/completions'],
    ['deepseek', 'https://api.deepseek.com/v1/', 'https://api.deepseek.com/v1/chat/completions'],
    ['openai_compatible', 'https://openrouter.ai/api/v1', 'https://openrouter.ai/api/v1/chat/completions'],
  ] as const)('%s with Base URL %j posts to %s', async (provider, baseUrl, expected) => {
    const f = vi.fn(async () => new Response(JSON.stringify(ok)));
    await createLlmAdapter(provider, {
      apiKey: 'k',
      baseUrl,
      fetchImpl: f as unknown as typeof fetch,
    }).complete(request);
    expect(urlOf(f)).toBe(expected);
  });

  it('refuses openai_compatible without a Base URL', () => {
    expect(() => createLlmAdapter('openai_compatible', { apiKey: 'k' })).toThrow(LlmConfigurationError);
    expect(() => createLlmAdapter('openai_compatible', { apiKey: 'k', baseUrl: ' ' })).toThrowError(
      expect.objectContaining({ reason: 'base_url_required' }),
    );
  });

  it.each(['ftp://llm.example', 'api.deepseek.com', 'not a url', 'javascript:alert(1)'])(
    'refuses the Base URL %j',
    (baseUrl) => {
      expect(() => createLlmAdapter('deepseek', { apiKey: 'k', baseUrl })).toThrowError(
        expect.objectContaining({ reason: 'base_url_invalid' }),
      );
    },
  );

  it('ignores a Base URL for anthropic and google', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ content: [], stop_reason: 'end_turn' })));
    await createLlmAdapter('anthropic', {
      apiKey: 'k',
      baseUrl: 'https://elsewhere.example',
      fetchImpl: f as unknown as typeof fetch,
    }).complete(request);
    expect(urlOf(f)).toBe('https://api.anthropic.com/v1/messages');
  });

  it('names the default endpoints', () => {
    expect(defaultBaseUrlFor('openai')).toBe('https://api.openai.com/v1');
    expect(defaultBaseUrlFor('deepseek')).toBe('https://api.deepseek.com');
    expect(defaultBaseUrlFor('openai_compatible')).toBeNull();
    expect(defaultBaseUrlFor('anthropic')).toBeNull();
  });
});
