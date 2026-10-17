---
'@endora-commerce/llm-client': minor
'@endora-commerce/mod-prompt-actions': minor
---

New package `@endora-commerce/llm-client`: the platform's provider-neutral LLM transport — the fetch-based `AnthropicAdapter`, `GoogleAdapter` and `OpenAiAdapter` with tool calling, `LlmProviderError`, and the `createLlmAdapter(provider, { apiKey, baseUrl?, fetchImpl? })` factory. Moved from `@endora-commerce/mod-prompt-actions`, which now builds its adapters through it; a request without the new options is sent byte for byte as before. `LlmRequest` gains an optional `toolChoice: { name }` (forces that tool on every provider) and `signal` (passed to `fetch`), and `LlmProviderError` an `aborted` flag for a request its signal cancelled.
