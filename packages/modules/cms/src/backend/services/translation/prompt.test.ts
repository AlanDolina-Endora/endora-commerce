import { describe, expect, it } from 'vitest';
import { SUBMIT_TRANSLATIONS_TOOL, systemPrompt, userMessage } from './prompt.js';

/** Feature 151, T023 — the prompt is reviewed by snapshot (research R16). */
describe('systemPrompt', () => {
  it('names a known source and the target', () => {
    expect(systemPrompt({ targetLanguage: 'en-US', sourceLanguage: 'pl-PL' })).toMatchInlineSnapshot(`
      "You translate the public content of a web shop from Polish (Poland) (pl-PL) into American English (en-US).
      You receive a JSON array of segments, each with an "id" and a "text". Translate every segment and return each id exactly once through the cms.submit_translations tool. Do not add, omit, summarise or explain anything.
      Rules for every text:
      - Keep every tag exactly as many times as it appears in the source: paired tags such as <0>…</0> wrap formatted words and may move to fit the word order of the translation; self-closing tags such as <1/> and <br/> stay in their original order.
      - Never add a tag the source does not have, and never translate inside a tag.
      - Keep placeholders in double braces, such as {{customer.firstName}}, exactly as written.
      - Keep the escapes &lt; &gt; &amp; as they are, and keep URLs, e-mail addresses, product codes and numbers unchanged.
      - If a text is already in the target language, return it unchanged or lightly corrected."
    `);
  });

  it('asks the model to detect an unknown source', () => {
    expect(systemPrompt({ targetLanguage: 'de', sourceLanguage: null })).toContain(
      'from the language it is written in (detect it) into German (de).',
    );
  });

  it('falls back to the bare code for a code ICU does not know', () => {
    expect(systemPrompt({ targetLanguage: 'xx-QQ', sourceLanguage: null })).toContain('into xx-QQ.');
  });
});

describe('the forced tool and the user message', () => {
  it('matches the contract', () => {
    expect(SUBMIT_TRANSLATIONS_TOOL).toEqual({
      name: 'cms.submit_translations',
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
    });
  });

  it('sends ids and texts only', () => {
    expect(userMessage([{ id: 's1', kind: 'plain', text: 'Witaj' }])).toBe('[{"id":"s1","text":"Witaj"}]');
  });
});
