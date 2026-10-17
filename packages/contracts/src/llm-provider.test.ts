import { describe, expect, it } from 'vitest';
import { LlmProviderSchema, PromptActionsProviderSchema } from './prompt-actions.js';
import { FieldDefinitionSchema } from './credentials.js';

/**
 * Feature 151, research R21 — one list of LLM provider codes, read by the
 * credentials `llm` type, `@endora-commerce/llm-client`, the assistant and the
 * Page Builder translation alike.
 */
describe('LlmProviderSchema', () => {
  it('lists the five provider codes of the credential llm type', () => {
    expect(LlmProviderSchema.options).toEqual([
      'anthropic',
      'google',
      'openai',
      'deepseek',
      'openai_compatible',
    ]);
  });

  it('is the schema the assistant validates its provider with', () => {
    expect(PromptActionsProviderSchema).toBe(LlmProviderSchema);
  });
});

describe('FieldDefinitionSchema format', () => {
  const base = { key: 'baseUrl', label: 'Base URL', kind: 'string', required: false, secret: false };

  it('accepts a definition without a format', () => {
    expect(FieldDefinitionSchema.parse(base)).not.toHaveProperty('format');
  });

  it("accepts format 'url'", () => {
    expect(FieldDefinitionSchema.parse({ ...base, format: 'url' }).format).toBe('url');
  });

  it('refuses an unknown format', () => {
    expect(FieldDefinitionSchema.safeParse({ ...base, format: 'email' }).success).toBe(false);
  });
});
