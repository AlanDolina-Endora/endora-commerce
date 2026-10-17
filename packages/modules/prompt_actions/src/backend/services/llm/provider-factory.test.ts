import { describe, expect, it, vi } from 'vitest';
import type { ResolveResult } from '@endora-commerce/contracts';
import { AssistantNotConfigured, LlmProviderFactory } from './provider-factory.js';

/**
 * Feature 151, FR-043 / research R21 — the assistant accepts DeepSeek and any
 * OpenAI-compatible endpoint through the credential's Base URL, built by the
 * same `@endora-commerce/llm-client` factory the Page Builder translation uses.
 */

function factoryFor(providerCode: string, values: Record<string, unknown>, fetchImpl?: typeof fetch) {
  const resolved = { status: 'ok', typeCode: 'llm', providerCode, values } as unknown as ResolveResult;
  return new LlmProviderFactory({
    settings: {
      get: <T,>(code: string): Promise<T> =>
        Promise.resolve(
          (code.endsWith('enabled') ? true : code.endsWith('bulk_limit') ? 50 : 'llm-ref') as T,
        ),
    },
    resolveChannelId: () => Promise.resolve('channel-1'),
    credentials: { resolve: () => Promise.resolve(resolved) },
    ...(fetchImpl ? { fetchImpl } : {}),
  });
}

const ok = { choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }] };
const request = { model: 'm', system: 's', maxTokens: 10, messages: [], tools: [] };

describe('LlmProviderFactory provider coverage', () => {
  it.each([
    ['deepseek', {}, 'https://api.deepseek.com/chat/completions'],
    ['openai_compatible', { baseUrl: 'https://openrouter.ai/api/v1' }, 'https://openrouter.ai/api/v1/chat/completions'],
    ['openai', { baseUrl: 'https://gateway.example/v1' }, 'https://gateway.example/v1/chat/completions'],
    ['openai', {}, 'https://api.openai.com/v1/chat/completions'],
  ])('%s %j is ready and calls %s', async (provider, extra, url) => {
    const f = vi.fn(async () => new Response(JSON.stringify(ok)));
    const factory = factoryFor(provider, { model: 'model-x', apiKey: 'key', ...extra }, f as unknown as typeof fetch);
    await expect(factory.capability()).resolves.toMatchObject({ status: 'ready' });
    const resolved = await factory.resolve();
    expect(resolved.provider).toBe(provider);
    await resolved.adapter.complete(request);
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe(url);
  });

  it.each([
    ['openai_compatible', {}],
    ['openai_compatible', { baseUrl: '   ' }],
    ['deepseek', { baseUrl: 'ftp://llm.example' }],
    ['some_future_provider', {}],
  ])('%s %j is not configured', async (provider, extra) => {
    const factory = factoryFor(provider, { model: 'model-x', apiKey: 'key', ...extra });
    await expect(factory.capability()).resolves.toMatchObject({ status: 'not_configured' });
    await expect(factory.resolve()).rejects.toBeInstanceOf(AssistantNotConfigured);
  });
});
