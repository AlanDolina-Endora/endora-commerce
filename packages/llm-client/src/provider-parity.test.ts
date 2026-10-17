import { describe, expect, it } from 'vitest';
import { LlmProviderSchema, PromptActionsProviderSchema } from '@endora-commerce/contracts';
import { LLM_PROVIDERS } from './create-llm-adapter.js';

/** Feature 151, T004 / research R21 — one provider list, no drift. */
describe('LLM_PROVIDERS', () => {
  it('equals the contract list the credentials llm type and the assistant use', () => {
    expect([...LLM_PROVIDERS]).toEqual(LlmProviderSchema.options);
    expect(PromptActionsProviderSchema.options).toEqual(LlmProviderSchema.options);
  });
});
