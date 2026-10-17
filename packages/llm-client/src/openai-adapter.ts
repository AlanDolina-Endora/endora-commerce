import { z } from 'zod';
import {
  LlmProviderError,
  fromWireName,
  parseOrThrow,
  postJson,
  toWireName,
  wireNameMap,
  type FetchLike,
  type LlmCompletion,
  type LlmProviderAdapter,
  type LlmRequest,
} from './provider.js';

/**
 * OpenAI (GPT) adapter — `POST /v1/chat/completions` with tools/tool_calls.
 * Native fetch, no SDK (research §R2). Tool-call arguments arrive as a JSON
 * string and are parsed here; the interpreter re-validates against the
 * tool's Zod schema regardless.
 */

const ResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable().optional(),
          tool_calls: z
            .array(
              z.object({
                id: z.string(),
                function: z.object({ name: z.string(), arguments: z.string() }),
              }),
            )
            .optional(),
        }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
});

/** The providers that speak this protocol (feature 151, research R21). */
export type OpenAiProtocolProvider = 'openai' | 'deepseek' | 'openai_compatible';

export interface OpenAiAdapterOptions {
  /** Whose endpoint this is; named in errors and `provider`. Default `openai`. */
  provider?: OpenAiProtocolProvider | undefined;
  /**
   * The API root the request is posted under, as `<baseUrl>/chat/completions`.
   * Default: OpenAI's public endpoint. Validated by `createLlmAdapter`, not here.
   */
  baseUrl?: string | undefined;
}

const OPENAI_BASE_URL = 'https://api.openai.com/v1';

export class OpenAiAdapter implements LlmProviderAdapter {
  readonly provider: OpenAiProtocolProvider;
  private readonly endpoint: string;

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch,
    options: OpenAiAdapterOptions = {},
  ) {
    this.provider = options.provider ?? 'openai';
    this.endpoint = `${(options.baseUrl ?? OPENAI_BASE_URL).replace(/\/+$/, '')}/chat/completions`;
  }

  async complete(req: LlmRequest): Promise<LlmCompletion> {
    const names = wireNameMap(req.tools);
    const body = {
      model: req.model,
      // OpenAI renamed the cap; DeepSeek and the compatible servers (vLLM,
      // Ollama, OpenRouter, …) take the original name. `openai` keeps the
      // field it has always sent.
      ...(this.provider === 'openai'
        ? { max_completion_tokens: req.maxTokens }
        : { max_tokens: req.maxTokens }),
      messages: [
        { role: 'system', content: req.system },
        ...req.messages.map((m) => {
          if (m.role === 'user') return { role: 'user', content: m.text };
          if (m.role === 'assistant') {
            return {
              role: 'assistant',
              content: m.text,
              ...(m.toolCalls.length > 0
                ? {
                    tool_calls: m.toolCalls.map((c) => ({
                      id: c.id,
                      type: 'function',
                      function: {
                        name: toWireName(c.name),
                        arguments: JSON.stringify(c.arguments),
                      },
                    })),
                  }
                : {}),
            };
          }
          return { role: 'tool', tool_call_id: m.toolCallId, content: m.resultJson };
        }),
      ],
      tools: req.tools.map((t) => ({
        type: 'function',
        function: { name: toWireName(t.name), description: t.description, parameters: t.inputSchema },
      })),
      ...(req.toolChoice
        ? { tool_choice: { type: 'function', function: { name: toWireName(req.toolChoice.name) } } }
        : {}),
    };

    const json = await postJson(
      this.provider,
      this.fetchImpl,
      this.endpoint,
      { authorization: `Bearer ${this.apiKey}` },
      body,
      req.signal,
    );
    const parsed = parseOrThrow(this.provider, ResponseSchema, json);
    const choice = parsed.choices[0]!;

    const toolCalls = (choice.message.tool_calls ?? []).map((c) => {
      let args: unknown;
      try {
        args = JSON.parse(c.function.arguments);
      } catch {
        throw new LlmProviderError(
          this.provider,
          'malformed',
          `${this.provider} tool call "${c.function.name}" carried non-JSON arguments.`,
        );
      }
      return { id: c.id, name: fromWireName(c.function.name, names), arguments: args };
    });

    return {
      text: choice.message.content ?? null,
      toolCalls,
      stopReason:
        choice.finish_reason === 'tool_calls'
          ? 'tool_use'
          : choice.finish_reason === 'stop'
            ? 'end'
            : choice.finish_reason === 'length'
              ? 'max_tokens'
              : 'other',
    };
  }
}
