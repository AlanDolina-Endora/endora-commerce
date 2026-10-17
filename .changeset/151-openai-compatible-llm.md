---
'@endora-commerce/contracts': minor
'@endora-commerce/llm-client': minor
'@endora-commerce/mod-credentials': minor
'@endora-commerce/mod-prompt-actions': minor
---

LLM configurations can now reach DeepSeek and any OpenAI-compatible endpoint. The `llm` credential type gains the provider `openai_compatible` ("OpenAI-compatible (custom endpoint)"), whose Base URL is required; every `llm` provider's Base URL is validated on save as an absolute `http://` or `https://` URL through the new optional `FieldDefinition.format: 'url'`, and the credential form renders such a field as a URL input. `createLlmAdapter` honours the Base URL for `openai`, `deepseek` (default `https://api.deepseek.com`) and `openai_compatible`, and throws `LlmConfigurationError` for a missing or invalid one. `LlmProviderSchema` in `@endora-commerce/contracts` is the one provider list (`PromptActionsProviderSchema` is now its alias), and the AI assistant accepts DeepSeek and OpenAI-compatible configurations where it used to report them as not configured.
