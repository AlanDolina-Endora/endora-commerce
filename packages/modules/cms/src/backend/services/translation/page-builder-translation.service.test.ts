import { describe, expect, it, vi } from 'vitest';
import type { CmsPageBuilderTranslateRequest } from '@endora-commerce/contracts';
import type { Command } from '@endora-commerce/platform/commands';
import { HttpError } from '@endora-commerce/platform/http';
import { LlmProviderError, type LlmProviderAdapter } from '@endora-commerce/llm-client';
import type { TranslationConfig } from './capability.js';
import { PageBuilderTranslationService } from './page-builder-translation.service.js';

/** Feature 151, T035–T038 at unit level — HTTP answers and the audit rule (FR-031). */

const echoAdapter = (behaviour: 'echo' | 'rate_limited' = 'echo'): LlmProviderAdapter => ({
  provider: 'anthropic',
  complete: vi.fn(async (req) => {
    if (behaviour === 'rate_limited') throw new LlmProviderError('anthropic', 'http', 'HTTP 429', 429);
    const message = req.messages[0]!;
    const segments = JSON.parse(message.role === 'user' ? message.text : '[]') as Array<{ id: string; text: string }>;
    return {
      text: null,
      stopReason: 'tool_use' as const,
      toolCalls: [
        { id: 'c', name: 'cms.submit_translations', arguments: { translations: segments.map((s) => ({ id: s.id, text: `${s.text}!` })) } },
      ],
    };
  }),
});

function service(config: TranslationConfig) {
  const commands: Array<Command<unknown>> = [];
  const commandBus = { run: vi.fn(async (command: Command<unknown>) => { commands.push(command); return undefined; }) };
  const svc = new PageBuilderTranslationService({
    config: async () => config,
    declarations: (name) => (name === 'cms.Heading' ? [{ path: 'text' }] : undefined),
    commandBus: commandBus as never,
  });
  return { svc, commands };
}

const ready = (adapter = echoAdapter()): TranslationConfig => ({
  status: 'ready',
  provider: 'anthropic',
  model: 'claude-test',
  adapter,
  maxCharacters: 1000,
});

function request(texts: string[], extra: Partial<CmsPageBuilderTranslateRequest> = {}): CmsPageBuilderTranslateRequest {
  return {
    targetLanguage: 'en-US',
    sourceLanguage: null,
    context: 'cms',
    data: { root: { props: {} }, content: texts.map((text, i) => ({ type: 'cms.Heading', props: { id: `h${i}`, text } })) },
    resource: { type: 'cms_page', id: '0b7c3a2e-5b0a-4c55-9d43-7d6c1f8a1e11' },
    ...extra,
  };
}

async function after(command: Command<unknown>) {
  return (await command.run({} as never)).after;
}

describe('PageBuilderTranslationService', () => {
  it.each([
    ['disabled', 'CMS_TRANSLATION_DISABLED'],
    ['not_configured', 'CMS_TRANSLATION_NOT_CONFIGURED'],
    ['unavailable', 'CMS_TRANSLATION_UNAVAILABLE'],
  ] as const)('answers 409 when %s, recording nothing', async (status, code) => {
    const { svc, commands } = service({ status, maxCharacters: 1000 });
    await expect(svc.translate(request(['Witaj']))).rejects.toMatchObject({ statusCode: 409, code });
    expect(commands).toHaveLength(0);
  });

  it('records one audit entry with metadata only', async () => {
    const { svc, commands } = service(ready());
    const response = await svc.translate(request(['Witaj świecie']));
    expect(response.report.translatedSegments).toBe(1);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      action: 'cms.page_builder.translate',
      objectType: 'cms_page',
      objectId: '0b7c3a2e-5b0a-4c55-9d43-7d6c1f8a1e11',
    });
    const state = await after(commands[0]!);
    expect(state).toEqual({
      targetLanguage: 'en-US',
      sourceLanguage: null,
      provider: 'anthropic',
      model: 'claude-test',
      segments: 1,
      characters: 13,
      translatedSegments: 1,
      untranslatedSegments: 0,
      outcome: 'completed',
      limit: 1000,
      scope: 'canvas',
    });
    expect(JSON.stringify(state)).not.toContain('Witaj');
  });

  it('records the scope and the selected block type', async () => {
    const { svc, commands } = service(ready());
    await svc.translate(request(['Jeden', 'Dwa'], { scope: { kind: 'component', componentId: 'h1' } }));
    expect(await after(commands[0]!)).toMatchObject({ scope: 'component', componentType: 'cms.Heading', segments: 1 });
  });

  it('answers 413 with the configured limit, recording nothing', async () => {
    const { svc, commands } = service(ready());
    const error = await svc.translate(request(['x'.repeat(1001)])).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ statusCode: 413, code: 'CMS_TRANSLATION_TOO_LARGE', details: { limit: 1000, characters: 1001 } });
    expect(commands).toHaveLength(0);
  });

  it('answers 422 for a selection not in the canvas, recording nothing', async () => {
    const { svc, commands } = service(ready());
    await expect(
      svc.translate(request(['Witaj'], { scope: { kind: 'text', componentId: null, selectedText: 'brak' } })),
    ).rejects.toMatchObject({ statusCode: 422, code: 'CMS_TRANSLATION_SELECTION_NOT_FOUND' });
    expect(commands).toHaveLength(0);
  });

  it('answers 200 without calling anyone for nothing to translate', async () => {
    const adapter = echoAdapter();
    const { svc, commands } = service(ready(adapter));
    const response = await svc.translate(request(['123']));
    expect(response.report.characters).toBe(0);
    expect(adapter.complete).not.toHaveBeenCalled();
    expect(commands).toHaveLength(0);
  });

  it('answers 502 with the token and still records the attempt that sent content', async () => {
    const { svc, commands } = service(ready(echoAdapter('rate_limited')));
    await expect(svc.translate(request(['Witaj']))).rejects.toMatchObject({
      statusCode: 502,
      code: 'CMS_TRANSLATION_PROVIDER_FAILED',
      details: { code: 'rate_limited' },
    });
    expect(await after(commands[0]!)).toMatchObject({ outcome: 'failed', failure: 'rate_limited', segments: 1 });
  });

  it('carries an operation id for a canvas that is not a saved record', async () => {
    const { svc, commands } = service(ready());
    await svc.translate(request(['Witaj'], { resource: undefined }));
    expect(commands[0]!.objectType).toBe('page_builder_canvas');
    expect(commands[0]!.objectId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
