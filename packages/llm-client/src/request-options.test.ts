import { describe, expect, it, vi } from 'vitest';
import { AnthropicAdapter } from './anthropic-adapter.js';
import { GoogleAdapter } from './google-adapter.js';
import { OpenAiAdapter } from './openai-adapter.js';
import { LlmProviderError, type LlmProviderAdapter, type LlmRequest } from './provider.js';

/**
 * Feature 151, research R3 and R21 — the options this package adds to the
 * moved adapters: a forced tool choice, an abort signal, and (for the OpenAI
 * protocol) a Base URL and provider identity.
 */

const REQUEST: LlmRequest = {
  model: 'm',
  system: 's',
  maxTokens: 100,
  messages: [{ role: 'user', text: 'hi' }],
  tools: [
    {
      name: 'cms.submit_translations',
      description: 'Submit.',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
};

function okFetch(body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
}

function call(f: typeof fetch): { url: string; init: RequestInit & { body: string } } {
  const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [
    string,
    RequestInit & { body: string },
  ];
  return { url, init };
}

const ANTHROPIC_OK = { content: [], stop_reason: 'end_turn' };
const OPENAI_OK = { choices: [{ message: { content: 'x' }, finish_reason: 'stop' }] };
const GOOGLE_OK = { candidates: [{ content: { parts: [{ text: 'x' }] }, finishReason: 'STOP' }] };

describe('toolChoice', () => {
  it('anthropic forces the tool by its wire name', async () => {
    const f = okFetch(ANTHROPIC_OK);
    await new AnthropicAdapter('k', f).complete({ ...REQUEST, toolChoice: { name: 'cms.submit_translations' } });
    expect(JSON.parse(call(f).init.body).tool_choice).toEqual({ type: 'tool', name: 'cms__submit_translations' });
  });

  it('openai forces the function by its wire name', async () => {
    const f = okFetch(OPENAI_OK);
    await new OpenAiAdapter('k', f).complete({ ...REQUEST, toolChoice: { name: 'cms.submit_translations' } });
    expect(JSON.parse(call(f).init.body).tool_choice).toEqual({
      type: 'function',
      function: { name: 'cms__submit_translations' },
    });
  });

  it('google sets functionCallingConfig ANY with the allowed name', async () => {
    const f = okFetch(GOOGLE_OK);
    await new GoogleAdapter('k', f).complete({ ...REQUEST, toolChoice: { name: 'cms.submit_translations' } });
    expect(JSON.parse(call(f).init.body).toolConfig).toEqual({
      functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['cms__submit_translations'] },
    });
  });

  it('is absent from the body when not requested', async () => {
    const f = okFetch(OPENAI_OK);
    await new OpenAiAdapter('k', f).complete(REQUEST);
    expect(JSON.parse(call(f).init.body)).not.toHaveProperty('tool_choice');
  });
});

describe('signal', () => {
  const adapters: Array<[string, (f: typeof fetch) => LlmProviderAdapter, unknown]> = [
    ['anthropic', (f) => new AnthropicAdapter('k', f), ANTHROPIC_OK],
    ['openai', (f) => new OpenAiAdapter('k', f), OPENAI_OK],
    ['google', (f) => new GoogleAdapter('k', f), GOOGLE_OK],
  ];

  it.each(adapters)('%s passes the signal to fetch', async (_name, build, ok) => {
    const f = okFetch(ok);
    const controller = new AbortController();
    await build(f).complete({ ...REQUEST, signal: controller.signal });
    expect(call(f).init.signal).toBe(controller.signal);
  });

  it.each(adapters)('%s reports an aborted request as a network error with aborted=true', async (_name, build) => {
    const controller = new AbortController();
    const f = vi.fn(async (_url: string, init: RequestInit) => {
      controller.abort();
      init.signal?.throwIfAborted();
      return new Response('{}');
    }) as unknown as typeof fetch;
    const error = await build(f)
      .complete({ ...REQUEST, signal: controller.signal })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmProviderError);
    expect(error).toMatchObject({ kind: 'network', aborted: true });
  });

  it('a network failure that is not an abort carries aborted=false', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const error = await new OpenAiAdapter('k', f).complete(REQUEST).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'network', aborted: false });
  });
});

describe('OpenAiAdapter endpoint and provider (R21)', () => {
  it('posts to <baseUrl>/chat/completions, trimming trailing slashes', async () => {
    const f = okFetch(OPENAI_OK);
    await new OpenAiAdapter('k', f, { baseUrl: 'https://proxy.example/v1//' }).complete(REQUEST);
    expect(call(f).url).toBe('https://proxy.example/v1/chat/completions');
  });

  it('keeps max_completion_tokens for openai', async () => {
    const f = okFetch(OPENAI_OK);
    await new OpenAiAdapter('k', f, { baseUrl: 'https://proxy.example/v1' }).complete(REQUEST);
    const body = JSON.parse(call(f).init.body);
    expect(body.max_completion_tokens).toBe(100);
    expect(body).not.toHaveProperty('max_tokens');
  });

  it.each(['deepseek', 'openai_compatible'] as const)(
    '%s sends max_tokens and reports its own provider code',
    async (provider) => {
      const f = okFetch(OPENAI_OK);
      const adapter = new OpenAiAdapter('k', f, { provider, baseUrl: 'https://llm.example' });
      expect(adapter.provider).toBe(provider);
      await adapter.complete(REQUEST);
      const body = JSON.parse(call(f).init.body);
      expect(body.max_tokens).toBe(100);
      expect(body).not.toHaveProperty('max_completion_tokens');
      const failing = new OpenAiAdapter('k', vi.fn(async () => new Response('{}', { status: 401 })) as unknown as typeof fetch, {
        provider,
        baseUrl: 'https://llm.example',
      });
      await expect(failing.complete(REQUEST)).rejects.toMatchObject({ provider, status: 401 });
    },
  );
});
