import { describe, expect, it, vi } from 'vitest';
import type { BlockTranslatableText } from '@endora-commerce/contracts';
import { LlmProviderError, type LlmCompletion, type LlmProviderAdapter, type LlmRequest } from '@endora-commerce/llm-client';
import type { Declarations } from './extract.js';
import { CALL_TIMEOUT_MS } from './limits.js';
import {
  TranslationProviderFailedError,
  TranslationTooLargeError,
  translateCanvas,
  type TranslationModel,
} from './translation.service.js';

/** Feature 151, T025 — the service against a fake model. */

const DECLARATIONS: Record<string, BlockTranslatableText[]> = {
  'cms.Heading': [{ path: 'text' }],
  'cms.RichContent': [{ path: 'content', format: 'tiptap' }],
};
const declarations: Declarations = (name) => DECLARATIONS[name];

function headings(...texts: string[]) {
  return {
    root: { props: {} },
    content: texts.map((text, i) => ({ type: 'cms.Heading', props: { id: `h${i}`, text } })),
  };
}

type Answer = (req: LlmRequest) => LlmCompletion | Promise<LlmCompletion>;

function fakeModel(answer: Answer): { model: TranslationModel; calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  const adapter: LlmProviderAdapter = {
    provider: 'openai',
    complete: vi.fn(async (req: LlmRequest) => {
      calls.push(req);
      return answer(req);
    }),
  };
  return { model: { adapter, provider: 'openai', model: 'gpt-test' }, calls };
}

function segmentsOf(req: LlmRequest): Array<{ id: string; text: string }> {
  const message = req.messages[0]!;
  return JSON.parse(message.role === 'user' ? message.text : '[]') as Array<{ id: string; text: string }>;
}

/** Answers every segment with its text plus " [en]". */
const echo: Answer = (req) => ({
  text: null,
  stopReason: 'tool_use',
  toolCalls: [
    {
      id: 'c',
      name: 'cms.submit_translations',
      arguments: { translations: segmentsOf(req).map((s) => ({ id: s.id, text: `${s.text} [en]` })) },
    },
  ],
});

const base = { targetLanguage: 'en-US', sourceLanguage: null } as const;

describe('translateCanvas', () => {
  it('forces the tool, bounds the call and translates', async () => {
    const { model, calls } = fakeModel(echo);
    const result = await translateCanvas(
      { ...base, data: headings('Witaj', 'Żegnaj') },
      { declarations, maxCharacters: 40_000, model },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.toolChoice).toEqual({ name: 'cms.submit_translations' });
    expect(calls[0]!.tools.map((t) => t.name)).toEqual(['cms.submit_translations']);
    expect(calls[0]!.signal).toBeInstanceOf(AbortSignal);
    expect(calls[0]!.system).toContain('American English');
    expect((result.data as ReturnType<typeof headings>).content.map((c) => c.props.text)).toEqual([
      'Witaj [en]',
      'Żegnaj [en]',
    ]);
    expect(result.report).toMatchObject({
      translatedSegments: 2,
      untranslatedSegments: 0,
      provider: 'openai',
      model: 'gpt-test',
      sourceLanguage: null,
      scope: { kind: 'canvas', widened: false },
    });
    expect(result.sent).toEqual({ segments: 2, characters: 11 });
    expect(result.outcome).toBe('completed');
    expect(CALL_TIMEOUT_MS).toBe(60_000);
  });

  it('never calls the model for a canvas with nothing to translate', async () => {
    const { model, calls } = fakeModel(echo);
    const data = headings('42', '€49');
    const result = await translateCanvas({ ...base, data }, { declarations, maxCharacters: 40_000, model });
    expect(calls).toHaveLength(0);
    expect(result.sent).toBeNull();
    expect(result.data).toEqual(data);
    expect(result.report.translatedSegments).toBe(0);
  });

  it('refuses content above the configured limit before any call', async () => {
    const { model, calls } = fakeModel(echo);
    const error = await translateCanvas(
      { ...base, data: headings('a'.repeat(1_200)) },
      { declarations, maxCharacters: 1_000, model },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TranslationTooLargeError);
    expect(error).toMatchObject({ characters: 1_200, limit: 1_000 });
    expect(calls).toHaveLength(0);
  });

  it('applies the limit to the selected scope only', async () => {
    const { model } = fakeModel(echo);
    const result = await translateCanvas(
      { ...base, data: headings('a'.repeat(1_200), 'krótki'), scope: { kind: 'component', componentId: 'h1' } },
      { declarations, maxCharacters: 1_000, model },
    );
    expect(result.report.translatedSegments).toBe(1);
  });

  it('rejects only the segments whose answer is unusable', async () => {
    const { model } = fakeModel((req) => {
      const [first, second, third] = segmentsOf(req);
      return {
        text: null,
        stopReason: 'tool_use',
        toolCalls: [
          {
            id: 'c',
            name: 'cms.submit_translations',
            arguments: {
              translations: [
                { id: first!.id, text: 'Hello' },
                { id: second!.id, text: 'Bye' },
                { id: second!.id, text: 'Bye again' },
                { id: 'unknown', text: 'x' },
                { id: third!.id, text: 'Lost the placeholder' },
              ],
            },
          },
        ],
      };
    });
    const result = await translateCanvas(
      { ...base, data: headings('Witaj', 'Żegnaj', 'Cześć {{name}}', 'Pominięty') },
      { declarations, maxCharacters: 40_000, model },
    );
    expect((result.data as ReturnType<typeof headings>).content.map((c) => c.props.text)).toEqual([
      'Hello',
      'Żegnaj',
      'Cześć {{name}}',
      'Pominięty',
    ]);
    expect(result.report).toMatchObject({ translatedSegments: 1, untranslatedSegments: 3 });
    expect(result.outcome).toBe('partial');
  });

  it('splits a chunk cut off by the token limit and retries each half once', async () => {
    let first = true;
    const { model, calls } = fakeModel((req) => {
      if (first) {
        first = false;
        return { text: null, toolCalls: [], stopReason: 'max_tokens' };
      }
      return echo(req);
    });
    const result = await translateCanvas(
      { ...base, data: headings('Jeden', 'Dwa', 'Trzy', 'Cztery') },
      { declarations, maxCharacters: 40_000, model },
    );
    expect(calls.map((c) => segmentsOf(c).length)).toEqual([4, 2, 2]);
    expect(result.report.translatedSegments).toBe(4);
  });

  it('fails the whole request on a provider error, with its token and what was sent', async () => {
    const { model } = fakeModel(() => {
      throw new LlmProviderError('openai', 'http', 'HTTP 429', 429);
    });
    const error = await translateCanvas(
      { ...base, data: headings('Witaj') },
      { declarations, maxCharacters: 40_000, model },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TranslationProviderFailedError);
    expect(error).toMatchObject({ token: 'rate_limited', sent: { segments: 1, characters: 5 } });
  });

  it('reports malformed when every chunk is unusable', async () => {
    const { model } = fakeModel(() => ({ text: 'Sorry', toolCalls: [], stopReason: 'end' }));
    await expect(
      translateCanvas({ ...base, data: headings('Witaj') }, { declarations, maxCharacters: 40_000, model }),
    ).rejects.toMatchObject({ token: 'malformed' });
  });

  it('keeps at most two calls in flight', async () => {
    let inFlight = 0;
    let peak = 0;
    const { model, calls } = fakeModel(async (req) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return echo(req);
    });
    const many = Array.from({ length: 8 }, (_, i) => `Tekst numer ${i} ${'x'.repeat(5_000)}`);
    await translateCanvas({ ...base, data: headings(...many) }, { declarations, maxCharacters: 200_000, model });
    expect(calls.length).toBe(8);
    expect(peak).toBe(2);
  });
});
