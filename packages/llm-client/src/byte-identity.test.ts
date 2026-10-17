import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AnthropicAdapter } from './anthropic-adapter.js';
import { GoogleAdapter } from './google-adapter.js';
import { OpenAiAdapter } from './openai-adapter.js';
import type { LlmProviderAdapter, LlmRequest } from './provider.js';

/**
 * Feature 151, FR-042 — the move into this package and the additions made here
 * (`toolChoice`, `signal`, a Base URL) leave a request that uses none of them
 * byte-identical to what `prompt_actions` sent before the move. The digests were
 * recorded from the adapters as they stood in `prompt_actions` (commit
 * f11386105) for the request below; a change to any of them is a change to the
 * assistant's wire traffic and must be deliberate.
 */

const REQUEST: LlmRequest = {
  model: 'identity-model',
  system: 'System prompt.',
  maxTokens: 512,
  messages: [
    { role: 'user', text: 'Hello' },
    { role: 'assistant', text: 'Calling', toolCalls: [{ id: 'c1', name: 'a.b', arguments: { x: 1 } }] },
    { role: 'tool_result', toolCallId: 'c1', toolName: 'a.b', resultJson: '{"ok":true}' },
  ],
  tools: [
    {
      name: 'a.b',
      description: 'Tool.',
      inputSchema: { type: 'object', properties: { x: { type: 'number' } }, additionalProperties: false },
    },
  ],
};

async function capture(build: (f: typeof fetch) => LlmProviderAdapter): Promise<{ url: string; digest: string }> {
  const f = vi.fn(async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
  await build(f).complete(REQUEST).catch(() => undefined);
  const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
    string,
    { headers: Record<string, string>; body: string },
  ];
  const digest = createHash('sha256')
    .update(JSON.stringify({ headers: init.headers, body: init.body }))
    .digest('hex');
  return { url, digest };
}

describe('wire identity of a request without the feature-151 options', () => {
  it('anthropic', async () => {
    expect(await capture((f) => new AnthropicAdapter('key', f))).toEqual({
      url: 'https://api.anthropic.com/v1/messages',
      digest: 'ce59786250b6141cd935e77c94b48ce175dc76712c3aeb1b8d4ab5d29f33f3fc',
    });
  });
  it('openai', async () => {
    expect(await capture((f) => new OpenAiAdapter('key', f))).toEqual({
      url: 'https://api.openai.com/v1/chat/completions',
      digest: 'e2fb737f6741b19ce158109a86925d2d428c2ac8667d7c3b56e4cfe3b86b8912',
    });
  });
  it('google', async () => {
    expect(await capture((f) => new GoogleAdapter('key', f))).toEqual({
      url: 'https://generativelanguage.googleapis.com/v1beta/models/identity-model:generateContent',
      digest: 'b01f0c394c0f3e924291a3ba6136c9c55492b3bb8f6e1d0e25286b363889ad32',
    });
  });
});
