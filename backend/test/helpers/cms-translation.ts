import type { BackendServerHandle } from './test-server.js';

/**
 * Feature 151 — the Page Builder translation under test: a scripted OpenAI-shaped
 * model behind `cmsTranslationLlmFetch`, and a seeder that walks the real
 * credentials and settings APIs (the `prompt-actions.ts` shape).
 */

const ADMIN = { b2b_session: 'stub-admin-session' };
export const CMS_TRANSLATION_TEST_CREDENTIAL = 'cms-translation-test-llm';

export type ScriptedAnswer =
  | { kind: 'echo'; prefix?: string }
  | { kind: 'http'; status: number }
  | { kind: 'garbage' };

/**
 * Answers every chunk by calling `cms.submit_translations` with each segment's
 * text prefixed by `[en] ` — tags and placeholders kept — unless scripted
 * otherwise. Records every request it receives.
 */
export class ScriptedTranslator {
  readonly requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  answer: ScriptedAnswer = { kind: 'echo' };

  readonly fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    this.requests.push({ url, body });
    const answer = this.answer;
    if (answer.kind === 'http') {
      return new Response(JSON.stringify({ error: 'scripted' }), { status: answer.status });
    }
    if (answer.kind === 'garbage') {
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Sorry.' }, finish_reason: 'stop' }] }));
    }
    const messages = body['messages'] as Array<{ role: string; content: string }>;
    const segments = JSON.parse(messages.find((m) => m.role === 'user')!.content) as Array<{ id: string; text: string }>;
    const prefix = answer.prefix ?? '[en] ';
    const args = { translations: segments.map((s) => ({ id: s.id, text: `${prefix}${s.text}` })) };
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { id: 'call_1', type: 'function', function: { name: 'cms__submit_translations', arguments: JSON.stringify(args) } },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }),
    );
  }) as typeof fetch;

  /** Every segment text the model was sent, across all requests. */
  sentTexts(): string[] {
    return this.requests.flatMap(({ body }) => {
      const messages = body['messages'] as Array<{ role: string; content: string }>;
      return (JSON.parse(messages.find((m) => m.role === 'user')!.content) as Array<{ text: string }>).map((s) => s.text);
    });
  }
}

async function setValue(h: BackendServerHandle, code: string, value: unknown): Promise<{ statusCode: number; body: string }> {
  const r = await h.app.inject({
    method: 'PUT',
    url: `/api/v1/admin/settings/${code}/value`,
    cookies: ADMIN,
    payload: { scope: 'all', value },
  });
  return { statusCode: r.statusCode, body: r.body };
}

export async function setTranslationSetting(h: BackendServerHandle, code: string, value: unknown): Promise<void> {
  const r = await setValue(h, code, value);
  if (r.statusCode !== 200) throw new Error(`Seeding setting ${code} failed: ${r.statusCode} ${r.body}`);
}

export { setValue as putSettingValue };

/**
 * Configure the translation: switch, size limit, and an `llm` credential of
 * `provider` referenced by the credentials setting (`''` = none).
 */
export async function seedTranslationSettings(
  h: BackendServerHandle,
  values: Partial<{
    enabled: boolean;
    provider: string | null;
    model: string;
    baseUrl: string;
    maxSourceCharacters: number;
  }> = {},
): Promise<void> {
  await setTranslationSetting(h, 'cms.page_builder.translation.llm_credentials', '');
  await h.app.inject({
    method: 'DELETE',
    url: `/api/v1/admin/credentials/${CMS_TRANSLATION_TEST_CREDENTIAL}`,
    cookies: ADMIN,
  });
  const provider = values.provider === undefined ? 'openai' : values.provider;
  if (provider !== null) {
    const created = await h.app.inject({
      method: 'POST',
      url: '/api/v1/admin/credentials',
      cookies: ADMIN,
      payload: {
        code: CMS_TRANSLATION_TEST_CREDENTIAL,
        name: 'CMS translation test LLM',
        typeCode: 'llm',
        providerCode: provider,
        values: {
          apiKey: 'sk-translation-secret',
          model: values.model ?? 'gpt-translate',
          ...(values.baseUrl !== undefined ? { baseUrl: values.baseUrl } : {}),
        },
      },
    });
    if (created.statusCode !== 201) throw new Error(`Seeding credential failed: ${created.statusCode} ${created.body}`);
    await setTranslationSetting(h, 'cms.page_builder.translation.llm_credentials', CMS_TRANSLATION_TEST_CREDENTIAL);
  }
  await setTranslationSetting(h, 'cms.page_builder.translation.enabled', values.enabled ?? true);
  await setTranslationSetting(
    h,
    'cms.page_builder.translation.max_source_characters',
    values.maxSourceCharacters ?? 40000,
  );
}

/** Undo {@link seedTranslationSettings}, so later files start from the defaults. */
export async function resetTranslationSettings(h: BackendServerHandle): Promise<void> {
  await seedTranslationSettings(h, { enabled: false, provider: null });
}
