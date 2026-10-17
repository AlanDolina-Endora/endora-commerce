/**
 * `@endora-commerce/llm-client` — the platform's provider-neutral LLM transport
 * (feature 151, research R2).
 *
 * Moved unchanged from `prompt_actions` so that a second module (the Page
 * Builder translation in `cms`) can call the same three provider protocols
 * without a module edge. Stateless: no settings, no credentials, no logging —
 * each consumer resolves its own credential and passes the key in.
 */
export {
  LlmProviderError,
  fromWireName,
  toWireName,
  wireNameMap,
  type FetchLike,
  type LlmCompletion,
  type LlmMessage,
  type LlmProvider,
  type LlmProviderAdapter,
  type LlmRequest,
  type LlmToolCall,
  type LlmToolDefinition,
} from './provider.js';
export { AnthropicAdapter } from './anthropic-adapter.js';
export { GoogleAdapter } from './google-adapter.js';
export { OpenAiAdapter } from './openai-adapter.js';
export type { OpenAiAdapterOptions, OpenAiProtocolProvider } from './openai-adapter.js';
export {
  LLM_PROVIDERS,
  LlmConfigurationError,
  createLlmAdapter,
  defaultBaseUrlFor,
  isHttpUrl,
  type CreateLlmAdapterOptions,
} from './create-llm-adapter.js';
