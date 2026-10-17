import { describe, expect, it } from 'vitest';
import { LlmProviderSchema } from '@endora-commerce/contracts';
import { llmConfigurationType } from './llm.type.js';

/**
 * Feature 151, FR-007 / research R21 — the `llm` type offers exactly the
 * providers `@endora-commerce/llm-client` can call, an OpenAI-compatible one
 * among them, and declares its Base URL as a URL.
 */
describe('llmConfigurationType', () => {
  it('offers exactly the platform provider list', () => {
    // As a set: the order is the Credentials screen's, the schema's is the contract's.
    expect(llmConfigurationType.providers.map((p) => p.code).sort()).toEqual(
      [...LlmProviderSchema.options].sort(),
    );
  });

  it('requires a Base URL for the OpenAI-compatible provider only', () => {
    for (const provider of llmConfigurationType.providers) {
      const baseUrl = provider.fields.find((f) => f.key === 'baseUrl');
      expect(baseUrl, provider.code).toBeDefined();
      expect(baseUrl!.required, provider.code).toBe(provider.code === 'openai_compatible');
    }
  });

  it('declares every Base URL with the url format', () => {
    for (const provider of llmConfigurationType.providers) {
      expect(provider.fields.find((f) => f.key === 'baseUrl')!.format, provider.code).toBe('url');
    }
  });
});
