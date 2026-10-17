# Contract: `@endora-commerce/llm-client`

**Location**: `packages/llm-client/` | **Kind**: stateless library package (not a module — no
manifest, no lifecycle, no settings) | **Runtime dependencies**: none beyond `zod` (peer, already in
the stack) | **Origin**: moved from `packages/modules/prompt_actions/src/backend/services/llm/`
(research R2).

## 1. Public surface (root export `.` only)

```ts
export type LlmProvider = 'anthropic' | 'google' | 'openai';
export const LLM_PROVIDERS: readonly LlmProvider[];

export type LlmMessage = /* unchanged from prompt_actions' provider.ts */;
export interface LlmToolCall { id: string; name: string; arguments: unknown }
export interface LlmToolDefinition { name: string; description: string; inputSchema: object }

export interface LlmRequest {
  model: string;
  system: string;
  messages: LlmMessage[];
  tools: LlmToolDefinition[];
  maxTokens: number;
  /** NEW, optional. Forces the model to call this tool (research R3). Absent ⇒ provider default. */
  toolChoice?: { name: string };
  /** NEW, optional. Passed to fetch; lets a caller impose a timeout or cancel. */
  signal?: AbortSignal;
}

export interface LlmCompletion {
  text: string | null;
  toolCalls: LlmToolCall[];
  stopReason: 'tool_use' | 'end' | 'max_tokens' | 'other';
}

export interface LlmProviderAdapter {
  readonly provider: LlmProvider;
  complete(req: LlmRequest): Promise<LlmCompletion>;
}

export class LlmProviderError extends Error {
  readonly provider: LlmProvider;
  readonly kind: 'http' | 'network' | 'malformed';
  readonly status?: number;
  /** NEW: true when the network failure was the request's AbortSignal firing. */
  readonly aborted?: boolean;
}

export type FetchLike = typeof fetch;

export function createLlmAdapter(
  provider: LlmProvider,
  options: { apiKey: string; fetchImpl?: FetchLike },
): LlmProviderAdapter;

export { AnthropicAdapter, GoogleAdapter, OpenAiAdapter };
```

`LlmToolDefinition` is today declared in `@endora-commerce/contracts` (`prompt-actions.ts`); the
library re-uses that type rather than declaring a second one, so `contracts` stays the single
source (the library takes `@endora-commerce/contracts` as a peer, as every module does).

## 2. Invariants

- **Behaviour-preserving move**: for a request without `toolChoice`/`signal`, every adapter sends a
  byte-identical body to the same URL with the same headers as before the move. Proven by moving
  `adapters.test.ts` unchanged first (tasks T002–T003), then adding the new cases.
- No logging of request bodies, responses or keys inside the library.
- `baseUrl` is **not** added in this feature (see owner decision 4); the endpoints stay the
  providers' public ones.

## 3. Consumers after this feature

| Consumer | Uses |
| --- | --- |
| `prompt_actions` | adapters, `LlmProviderError`, types — its `provider-factory.ts` keeps its settings/credentials logic and builds adapters with `createLlmAdapter` |
| `cms` | `createLlmAdapter`, `toolChoice`, `signal`, `LlmProviderError` |

`prompt_actions`' `PromptActionsProviderSchema` (contracts) stays as is; it is structurally equal to
`LlmProvider`, and a type-level test asserts the two never drift.
