import { z } from 'zod';
import type {
  CmsPageBuilderTranslateResponse,
  CmsPageBuilderTranslationScope,
  LlmProvider,
} from '@endora-commerce/contracts';
import { LlmProviderError, type LlmProviderAdapter } from '@endora-commerce/llm-client';
import { chunkSegments } from './chunk.js';
import { extract, type Declarations, type Segment } from './extract.js';
import { inject } from './inject.js';
import {
  CALL_TIMEOUT_MS,
  CHUNK_CONCURRENCY,
  MAX_CHUNK_CHARACTERS,
  MAX_CHUNK_SEGMENTS,
  MAX_OUTPUT_TOKENS,
} from './limits.js';
import { SUBMIT_TRANSLATIONS_TOOL, SUBMIT_TRANSLATIONS_TOOL_NAME, systemPrompt, userMessage } from './prompt.js';
import { providerFailureToken, type ProviderFailureToken } from './provider-error-map.js';

/**
 * Feature 151 — translate one Page Builder document: extract → limit → chunk →
 * call the model (forced tool, bounded, two at a time) → validate per segment →
 * inject. Synchronous and stateless (research R9): nothing is stored, and the
 * caller decides what is audited from {@link TranslateCanvasResult.sent}.
 */

export interface TranslationModel {
  adapter: LlmProviderAdapter;
  provider: LlmProvider;
  model: string;
}

export interface SentStats {
  segments: number;
  characters: number;
}

/** Above the configured source-character limit — refused before anything is sent (FR-023). */
export class TranslationTooLargeError extends Error {
  override readonly name = 'TranslationTooLargeError';
  constructor(
    readonly characters: number,
    readonly limit: number,
  ) {
    super(`The content has ${characters} characters to translate; the limit is ${limit}.`);
  }
}

/** The provider failed, or every answer was unusable. Content may already have been sent. */
export class TranslationProviderFailedError extends Error {
  override readonly name = 'TranslationProviderFailedError';
  constructor(
    readonly token: ProviderFailureToken,
    readonly sent: SentStats,
    readonly scope: { kind: 'canvas' | 'component' | 'text'; componentType?: string | undefined } = {
      kind: 'canvas',
    },
  ) {
    super(`The translation model could not complete the translation (${token}).`);
  }
}

export interface TranslateCanvasInput {
  data: unknown;
  targetLanguage: string;
  sourceLanguage: string | null;
  scope?: CmsPageBuilderTranslationScope | undefined;
}

export interface TranslateCanvasResult {
  data: unknown;
  report: CmsPageBuilderTranslateResponse['report'];
  /** What reached the provider; `null` when nothing was sent. */
  sent: SentStats | null;
  outcome: 'completed' | 'partial' | null;
  /** The selected component's block name, when the scope named one. */
  componentType?: string | undefined;
}

const answerSchema = z.object({
  translations: z.array(z.object({ id: z.string(), text: z.string() })),
});

type ChunkAnswer = Map<string, string> | 'malformed';

export async function translateCanvas(
  input: TranslateCanvasInput,
  deps: { declarations: Declarations; maxCharacters: number; model: TranslationModel },
): Promise<TranslateCanvasResult> {
  const extraction = extract(input.data, deps.declarations, input.scope);
  const report = (translated: number, untranslated: number, characters: number) => ({
    translatedSegments: translated,
    untranslatedSegments: untranslated,
    untranslatableBlocks: [...extraction.untranslatableBlocks].map(([name, count]) => ({ name, count })),
    characters,
    provider: deps.model.provider,
    model: deps.model.model,
    sourceLanguage: input.sourceLanguage,
    scope: extraction.scope,
  });

  if (extraction.segments.length === 0) {
    return {
      data: input.data,
      report: report(0, 0, 0),
      sent: null,
      outcome: null,
      componentType: extraction.componentType,
    };
  }
  if (extraction.characters > deps.maxCharacters) {
    throw new TranslationTooLargeError(extraction.characters, deps.maxCharacters);
  }

  const system = systemPrompt(input);
  const failedScope = { kind: extraction.scope.kind, componentType: extraction.componentType };
  const chunks = chunkSegments(extraction.segments, {
    maxCharacters: MAX_CHUNK_CHARACTERS,
    maxSegments: MAX_CHUNK_SEGMENTS,
  });
  const sent: SentStats = { segments: 0, characters: 0 };

  const call = async (chunk: Segment[], mayRetry: boolean): Promise<ChunkAnswer> => {
    let completion;
    try {
      completion = await deps.model.adapter.complete({
        model: deps.model.model,
        system,
        messages: [{ role: 'user', text: userMessage(chunk) }],
        tools: [SUBMIT_TRANSLATIONS_TOOL],
        toolChoice: { name: SUBMIT_TRANSLATIONS_TOOL_NAME },
        maxTokens: MAX_OUTPUT_TOKENS,
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof LlmProviderError && error.kind === 'malformed') return 'malformed';
      throw error;
    }
    if (completion.stopReason === 'max_tokens' && mayRetry && chunk.length > 1) {
      // The answer was cut off: halve the chunk and try each half once.
      const middle = Math.ceil(chunk.length / 2);
      const halves = await Promise.all([call(chunk.slice(0, middle), false), call(chunk.slice(middle), false)]);
      if (halves.every((half) => half === 'malformed')) return 'malformed';
      return new Map(halves.flatMap((half) => (half === 'malformed' ? [] : [...half])));
    }
    const toolCall = completion.toolCalls.find((c) => c.name === SUBMIT_TRANSLATIONS_TOOL_NAME);
    const parsed = answerSchema.safeParse(toolCall?.arguments);
    if (!parsed.success) return 'malformed';
    const ids = new Set(chunk.map((segment) => segment.id));
    const answers = new Map<string, string>();
    const duplicated = new Set<string>();
    for (const { id, text } of parsed.data.translations) {
      if (!ids.has(id)) continue;
      if (answers.has(id)) duplicated.add(id);
      answers.set(id, text);
    }
    for (const id of duplicated) answers.delete(id);
    return answers;
  };

  const answers: ChunkAnswer[] = [];
  let failure = null as LlmProviderError | null;
  let next = 0;
  const worker = async (): Promise<void> => {
    while (failure === null && next < chunks.length) {
      const index = next++;
      const chunk = chunks[index]!;
      sent.segments += chunk.length;
      sent.characters += chunk.reduce((sum, segment) => sum + segment.text.length, 0);
      try {
        answers[index] = await call(chunk, true);
      } catch (error) {
        if (!(error instanceof LlmProviderError)) throw error;
        failure ??= error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CHUNK_CONCURRENCY, chunks.length) }, worker));

  if (failure !== null) throw new TranslationProviderFailedError(providerFailureToken(failure), sent, failedScope);
  if (answers.every((answer) => answer === 'malformed')) {
    throw new TranslationProviderFailedError('malformed', sent, failedScope);
  }

  const translations = new Map(answers.flatMap((answer) => (answer === 'malformed' ? [] : [...answer])));
  const result = inject(input.data, extraction, translations);
  return {
    data: result.data,
    report: report(result.translated, result.untranslated, sent.characters),
    sent,
    outcome: result.untranslated === 0 ? 'completed' : 'partial',
    componentType: extraction.componentType,
  };
}
