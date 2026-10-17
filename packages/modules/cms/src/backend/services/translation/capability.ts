import { z } from 'zod';
import {
  CMS_TRANSLATION_DEFAULT_MAX_SOURCE_CHARACTERS,
  CMS_TRANSLATION_MAX_SOURCE_CHARACTERS_BOUNDS,
  LlmProviderSchema,
  type CmsPageBuilderTranslationCapability,
  type LlmProvider,
  type ResolveResult,
} from '@endora-commerce/contracts';
import { rethrowIfModuleDisabled } from '@endora-commerce/platform/kernel';
import {
  createLlmAdapter,
  LlmConfigurationError,
  type FetchLike,
  type LlmProviderAdapter,
} from '@endora-commerce/llm-client';
import { CMS_PAGE_BUILDER_SETTING_CODES } from '../../../manifest.js';

/**
 * Feature 151 (research R11, R21, `data-model.md` §1) — is the Translate action
 * ready, and with which model? Derived per request from the three settings and
 * the referenced credential, never stored, so a change to either applies to the
 * next request without a restart (FR-004).
 *
 * Evaluated in order, and the order is the contract: a switched-off function
 * never touches `credentials`.
 */

export interface TranslationConfigDeps {
  /** A platform-wide setting value, or `undefined` when it cannot be read. */
  readSetting(code: string): Promise<unknown>;
  isCredentialsPresent(): boolean;
  /** `credentials`' `resolve`, reached through its port per call. */
  resolveCredential(code: string): Promise<ResolveResult>;
  fetchImpl?: FetchLike | undefined;
}

export type TranslationConfig =
  | {
      status: 'ready';
      provider: LlmProvider;
      model: string;
      adapter: LlmProviderAdapter;
      maxCharacters: number;
    }
  | { status: 'disabled' | 'not_configured' | 'unavailable'; maxCharacters: number };

const { min, max } = CMS_TRANSLATION_MAX_SOURCE_CHARACTERS_BOUNDS;
const limitSchema = z.number().int().min(min).max(max);

export async function resolveTranslationConfig(deps: TranslationConfigDeps): Promise<TranslationConfig> {
  const [enabled, reference, limit] = await Promise.all([
    deps.readSetting(CMS_PAGE_BUILDER_SETTING_CODES.TRANSLATION_ENABLED),
    deps.readSetting(CMS_PAGE_BUILDER_SETTING_CODES.TRANSLATION_LLM_CREDENTIALS),
    deps.readSetting(CMS_PAGE_BUILDER_SETTING_CODES.TRANSLATION_MAX_SOURCE_CHARACTERS),
  ]);
  // A stored value outside the bounds — written before the write validator
  // existed, or by hand — is not trusted; the default is.
  const parsedLimit = limitSchema.safeParse(limit);
  const maxCharacters = parsedLimit.success ? parsedLimit.data : CMS_TRANSLATION_DEFAULT_MAX_SOURCE_CHARACTERS;

  if (enabled !== true) return { status: 'disabled', maxCharacters };
  if (!deps.isCredentialsPresent()) return { status: 'unavailable', maxCharacters };
  const code = typeof reference === 'string' ? reference.trim() : '';
  if (code === '') return { status: 'not_configured', maxCharacters };

  let resolved: ResolveResult | null;
  try {
    resolved = await deps.resolveCredential(code);
  } catch (error) {
    // Tolerated: an unresolvable reference is a configuration the operator has
    // to fix, which is what `not_configured` tells them. A presence answer is
    // not that, and goes through.
    rethrowIfModuleDisabled(error);
    resolved = null;
  }
  if (!resolved || resolved.status !== 'ok') return { status: 'not_configured', maxCharacters };

  const provider = LlmProviderSchema.safeParse(resolved.providerCode);
  const text = (key: string): string => {
    const value = resolved.values[key];
    return typeof value === 'string' ? value.trim() : '';
  };
  const model = text('model');
  const apiKey = text('apiKey');
  if (!provider.success || model === '' || apiKey === '') return { status: 'not_configured', maxCharacters };

  try {
    const adapter = createLlmAdapter(provider.data, {
      apiKey,
      baseUrl: text('baseUrl'),
      fetchImpl: deps.fetchImpl,
    });
    return { status: 'ready', provider: provider.data, model, adapter, maxCharacters };
  } catch (error) {
    if (error instanceof LlmConfigurationError) return { status: 'not_configured', maxCharacters };
    throw error;
  }
}

/** The wire answer: provider and model when ready, never the key, code or Base URL. */
export function capabilityOf(config: TranslationConfig): CmsPageBuilderTranslationCapability {
  if (config.status === 'ready') {
    return { status: 'ready', provider: config.provider, model: config.model, maxCharacters: config.maxCharacters };
  }
  return { status: config.status, maxCharacters: config.maxCharacters };
}
