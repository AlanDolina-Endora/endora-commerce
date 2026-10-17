import type { ConfigurationTypeDescriptor, FieldDefinition } from '@endora-commerce/contracts';

/**
 * Core `llm` configuration type (feature 058, US1 / research §R2).
 *
 * Provider codes are `LlmProviderSchema`'s (`@endora-commerce/contracts`,
 * feature 151 research R21) — the list `@endora-commerce/llm-client` can call,
 * held equal by `llm.type.test.ts`. Every provider shares the same field set: a
 * secret `apiKey`, a required `model`, and a `baseUrl` validated as an absolute
 * http(s) URL — optional, except for `openai_compatible`, which has no default
 * endpoint. The credentials core stays type-agnostic — how a provider is
 * actually called, and which providers use the Base URL, is owned by the
 * consumer (Principle XIV).
 */

function llmFields(baseUrlRequired = false): FieldDefinition[] {
  return [
    { key: 'apiKey', label: 'API Key', kind: 'string', required: true, secret: true },
    { key: 'model', label: 'Model', kind: 'string', required: true, secret: false },
    {
      key: 'baseUrl',
      label: 'Base URL',
      kind: 'string',
      required: baseUrlRequired,
      secret: false,
      format: 'url',
      placeholder: baseUrlRequired
        ? 'Required — the API root, e.g. https://openrouter.ai/api/v1'
        : 'Optional — override the provider default endpoint (OpenAI and DeepSeek)',
    },
  ];
}

export const llmConfigurationType: ConfigurationTypeDescriptor = {
  code: 'llm',
  label: 'LLM',
  ownerModule: 'credentials',
  providers: [
    { code: 'openai', label: 'OpenAI (GPT)', fields: llmFields() },
    { code: 'google', label: 'Google (Gemini)', fields: llmFields() },
    { code: 'anthropic', label: 'Anthropic (Claude)', fields: llmFields() },
    { code: 'deepseek', label: 'DeepSeek', fields: llmFields() },
    {
      code: 'openai_compatible',
      label: 'OpenAI-compatible (custom endpoint)',
      fields: llmFields(true),
    },
  ],
};
