import type { LlmProviderError } from '@endora-commerce/llm-client';

/** The `details.code` tokens of `CMS_TRANSLATION_PROVIDER_FAILED` (research R17). */
export type ProviderFailureToken = 'credentials_rejected' | 'rate_limited' | 'unavailable' | 'timeout' | 'malformed';

/**
 * Map a provider failure to the token the editor's message is chosen by. An
 * aborted call is a timeout: the only signal this module passes is
 * `AbortSignal.timeout` (`limits.ts` `CALL_TIMEOUT_MS`).
 */
export function providerFailureToken(error: LlmProviderError): ProviderFailureToken {
  if (error.kind === 'malformed') return 'malformed';
  if (error.kind === 'network') return error.aborted ? 'timeout' : 'unavailable';
  if (error.status === 401 || error.status === 403) return 'credentials_rejected';
  if (error.status === 429) return 'rate_limited';
  return 'unavailable';
}
