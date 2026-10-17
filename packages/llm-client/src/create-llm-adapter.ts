import { LlmProviderSchema } from '@endora-commerce/contracts';
import { AnthropicAdapter } from './anthropic-adapter.js';
import { GoogleAdapter } from './google-adapter.js';
import { OpenAiAdapter } from './openai-adapter.js';
import type { FetchLike, LlmProvider, LlmProviderAdapter } from './provider.js';

/**
 * One factory for every consumer (feature 151, research R21): `prompt_actions`
 * and `cms` resolve their own credential and hand the values in; which class
 * speaks which protocol, and which endpoint a provider defaults to, is decided
 * here once.
 */

/** Every provider code this package can call — `LlmProviderSchema`'s options. */
export const LLM_PROVIDERS: readonly LlmProvider[] = LlmProviderSchema.options;

/** A configuration no call could succeed with; consumers report it as "not configured". */
export class LlmConfigurationError extends Error {
  override readonly name = 'LlmConfigurationError';
  constructor(
    public readonly provider: LlmProvider,
    public readonly reason: 'base_url_required' | 'base_url_invalid',
  ) {
    super(
      reason === 'base_url_required'
        ? `The ${provider} provider needs a Base URL.`
        : `The ${provider} Base URL must be an absolute http or https URL.`,
    );
  }
}

const DEFAULT_BASE_URLS: Partial<Record<LlmProvider, string>> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com',
};

/** The endpoint an OpenAI-protocol provider uses with no Base URL, or `null`. */
export function defaultBaseUrlFor(provider: LlmProvider): string | null {
  return DEFAULT_BASE_URLS[provider] ?? null;
}

/** `true` for an absolute `http:` / `https:` URL — the rule `credentials` applies on write too. */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export interface CreateLlmAdapterOptions {
  apiKey: string;
  /** The credential's Base URL; blank or absent ⇒ the provider default. Ignored by anthropic/google. */
  baseUrl?: string | null | undefined;
  fetchImpl?: FetchLike;
}

/**
 * Build the adapter for `provider`. Throws `LlmConfigurationError` synchronously
 * for an `openai_compatible` configuration without a Base URL and for a Base URL
 * that is not an absolute http(s) URL, so the caller learns it before any call.
 */
export function createLlmAdapter(
  provider: LlmProvider,
  options: CreateLlmAdapterOptions,
): LlmProviderAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  if (provider === 'anthropic') return new AnthropicAdapter(options.apiKey, fetchImpl);
  if (provider === 'google') return new GoogleAdapter(options.apiKey, fetchImpl);

  const configured = options.baseUrl?.trim() ?? '';
  if (configured !== '' && !isHttpUrl(configured)) {
    throw new LlmConfigurationError(provider, 'base_url_invalid');
  }
  const baseUrl = configured !== '' ? configured : defaultBaseUrlFor(provider);
  if (baseUrl === null) throw new LlmConfigurationError(provider, 'base_url_required');
  // `openai` with no Base URL passes none, so its endpoint is the adapter's own
  // default and the request stays what it was before this factory existed.
  return new OpenAiAdapter(options.apiKey, fetchImpl, {
    provider,
    ...(provider === 'openai' && configured === '' ? {} : { baseUrl }),
  });
}
