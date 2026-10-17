import type { LlmToolDefinition } from '@endora-commerce/contracts';
import type { Segment } from './extract.js';

/**
 * Feature 151 (research R16) — one fixed English system prompt and one forced
 * tool. Changing either changes what every translation sends, which is why
 * `prompt.test.ts` holds them by snapshot.
 */

export const SUBMIT_TRANSLATIONS_TOOL_NAME = 'cms.submit_translations';

export const SUBMIT_TRANSLATIONS_TOOL: LlmToolDefinition = {
  name: SUBMIT_TRANSLATIONS_TOOL_NAME,
  description: 'Return the translation of every input segment, each id exactly once.',
  inputSchema: {
    type: 'object',
    properties: {
      translations: {
        type: 'array',
        items: {
          type: 'object',
          properties: { id: { type: 'string' }, text: { type: 'string' } },
          required: ['id', 'text'],
        },
      },
    },
    required: ['translations'],
  },
};

function languageName(code: string): string {
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' }).of(code);
    return name && name !== code ? `${name} (${code})` : code;
  } catch {
    return code;
  }
}

export function systemPrompt(input: { targetLanguage: string; sourceLanguage: string | null }): string {
  const from = input.sourceLanguage
    ? languageName(input.sourceLanguage)
    : 'the language it is written in (detect it)';
  return [
    `You translate the public content of a web shop from ${from} into ${languageName(input.targetLanguage)}.`,
    `You receive a JSON array of segments, each with an "id" and a "text". Translate every segment and return each id exactly once through the ${SUBMIT_TRANSLATIONS_TOOL_NAME} tool. Do not add, omit, summarise or explain anything.`,
    'Rules for every text:',
    '- Keep every tag exactly as many times as it appears in the source: paired tags such as <0>…</0> wrap formatted words and may move to fit the word order of the translation; self-closing tags such as <1/> and <br/> stay in their original order.',
    '- Never add a tag the source does not have, and never translate inside a tag.',
    '- Keep placeholders in double braces, such as {{customer.firstName}}, exactly as written.',
    '- Keep the escapes &lt; &gt; &amp; as they are, and keep URLs, e-mail addresses, product codes and numbers unchanged.',
    '- If a text is already in the target language, return it unchanged or lightly corrected.',
  ].join('\n');
}

/** The segments as the model reads them: ids and texts, nothing else. */
export function userMessage(segments: readonly Segment[]): string {
  return JSON.stringify(segments.map(({ id, text }) => ({ id, text })));
}
