import { describe, expect, it } from 'vitest';
import { CRAWLER_TEXT_MAX_BYTES, type SettingWriteValidationInput } from '@endora-commerce/contracts';
import { HttpError } from '@endora-commerce/platform/http';
import { manifest } from '../../manifest.js';
import { CRAWLER_TEXT_SETTING_CODES, createCrawlerTextValidator } from './crawler-text-validator.js';

/**
 * The size limit on what an operator may save as custom `robots.txt`
 * instructions (`specs/144-seo-search-engine-robots/`, FR-006).
 *
 * The limit is on **bytes**, because it bounds the file a crawler downloads,
 * and the cases below are mostly about not mistaking characters for them: a
 * text of Polish letters is twice as many bytes as characters, and one of
 * emoji four times.
 */
describe('createCrawlerTextValidator', () => {
  const validator = createCrawlerTextValidator();

  const inputFor = (proposedValue: unknown): SettingWriteValidationInput => ({
    code: 'seo.robots_txt_custom',
    ownerModuleId: 'seo',
    proposedValue,
    // Deliberately empty: the limit is on the text being saved, and a
    // platform-wide write that every channel shadows with a value of its own
    // appears in no channel's projection at all.
    projection: [],
    targetedChannelIds: [],
  });

  const refusal = async (proposedValue: unknown): Promise<HttpError> => {
    try {
      await validator.validate(inputFor(proposedValue));
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      return error as HttpError;
    }
    throw new Error('the write was accepted');
  };

  it('is contributed by seo, for exactly the crawler text settings', () => {
    expect(validator.contributorModuleId).toBe('seo');
    expect(validator.codes).toEqual(['seo.robots_txt_custom', 'seo.llms_txt_additional']);
    expect(validator.codes).toEqual([...CRAWLER_TEXT_SETTING_CODES]);
  });

  it('answers only for settings the manifest declares, each a multi-line text defaulting to empty', () => {
    for (const code of validator.codes) {
      const declared = manifest.settings?.settings.find((setting) => setting.code === code);
      expect(declared, code).toBeDefined();
      expect(declared?.valueType).toBe('string');
      expect(declared?.multiline).toBe(true);
      expect(declared?.defaultValue).toBe('');
    }
  });

  it('holds the llms.txt content to the same limit, and names that setting in the refusal', async () => {
    const forLlms = (proposedValue: unknown): SettingWriteValidationInput => ({
      ...inputFor(proposedValue),
      code: 'seo.llms_txt_additional',
    });
    await expect(
      validator.validate(forLlms('a'.repeat(CRAWLER_TEXT_MAX_BYTES))),
    ).resolves.toBeUndefined();
    const refused = validator.validate(forLlms(`${'ż'.repeat(CRAWLER_TEXT_MAX_BYTES / 2)}a`));
    await expect(refused).rejects.toMatchObject({
      statusCode: 400,
      code: 'SEO_CRAWLER_TEXT_TOO_LARGE',
      details: {
        settingCode: 'seo.llms_txt_additional',
        maxBytes: CRAWLER_TEXT_MAX_BYTES,
        actualBytes: CRAWLER_TEXT_MAX_BYTES + 1,
      },
    });
  });

  it('accepts the empty text and an ordinary one', async () => {
    await expect(validator.validate(inputFor(''))).resolves.toBeUndefined();
    await expect(
      validator.validate(inputFor('User-agent: GPTBot\nDisallow: /\n')),
    ).resolves.toBeUndefined();
  });

  it('accepts exactly the limit and refuses one byte more', async () => {
    expect(CRAWLER_TEXT_MAX_BYTES).toBe(65_536);
    await expect(
      validator.validate(inputFor('a'.repeat(CRAWLER_TEXT_MAX_BYTES))),
    ).resolves.toBeUndefined();

    const error = await refusal('a'.repeat(CRAWLER_TEXT_MAX_BYTES + 1));
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('SEO_CRAWLER_TEXT_TOO_LARGE');
  });

  it('measures bytes, not characters', async () => {
    // Two bytes each: 32 768 of them are exactly the limit.
    const twoBytes = 'ż';
    expect(Buffer.byteLength(twoBytes, 'utf8')).toBe(2);
    await expect(
      validator.validate(inputFor(twoBytes.repeat(CRAWLER_TEXT_MAX_BYTES / 2))),
    ).resolves.toBeUndefined();
    // One more character of one byte is one byte too many…
    expect((await refusal(`${twoBytes.repeat(CRAWLER_TEXT_MAX_BYTES / 2)}a`)).code).toBe(
      'SEO_CRAWLER_TEXT_TOO_LARGE',
    );
    // …and a text well under the limit in characters is over it in bytes.
    const fortyThousand = twoBytes.repeat(40_000);
    expect(fortyThousand.length).toBeLessThan(CRAWLER_TEXT_MAX_BYTES);
    expect((await refusal(fortyThousand)).code).toBe('SEO_CRAWLER_TEXT_TOO_LARGE');

    // Four bytes each, two UTF-16 units each.
    const fourBytes = '🤖';
    expect(Buffer.byteLength(fourBytes, 'utf8')).toBe(4);
    await expect(
      validator.validate(inputFor(fourBytes.repeat(CRAWLER_TEXT_MAX_BYTES / 4))),
    ).resolves.toBeUndefined();
    expect((await refusal(`${fourBytes.repeat(CRAWLER_TEXT_MAX_BYTES / 4)} `)).code).toBe(
      'SEO_CRAWLER_TEXT_TOO_LARGE',
    );
  });

  it('counts a CRLF line break as the two bytes it is stored as', async () => {
    const lines = 'a\r\n'.repeat(Math.floor(CRAWLER_TEXT_MAX_BYTES / 3));
    expect(Buffer.byteLength(lines, 'utf8')).toBe(65_535);
    await expect(validator.validate(inputFor(`${lines}a`))).resolves.toBeUndefined();
    expect((await refusal(`${lines}ab`)).code).toBe('SEO_CRAWLER_TEXT_TOO_LARGE');
  });

  it('names the limit, in the message and for a client to read', async () => {
    const error = await refusal('a'.repeat(70_000));
    expect(error.message).toContain('65536');
    expect(error.message).toContain('64 KiB');
    expect(error.message).toContain('70000');
    expect(error.details).toEqual({
      settingCode: 'seo.robots_txt_custom',
      maxBytes: 65_536,
      actualBytes: 70_000,
    });
  });

  it('refuses on the text being saved even when no channel would come to hold it', async () => {
    // Every channel has a value of its own, so an all-channels write changes
    // no channel's effective value today — and is still what a channel reset
    // tomorrow would start serving.
    const shadowed: SettingWriteValidationInput = {
      ...inputFor('a'.repeat(CRAWLER_TEXT_MAX_BYTES + 1)),
      projection: [
        {
          salesChannelId: '00000000-0000-4000-8000-000000000001',
          salesChannelCode: 'default',
          salesChannelName: 'Default',
          value: 'Disallow: /tmp',
        },
      ],
    };
    await expect(validator.validate(shadowed)).rejects.toMatchObject({
      code: 'SEO_CRAWLER_TEXT_TOO_LARGE',
    });
  });

  it('leaves a value that is not a text to the settings store, which refuses it by type', async () => {
    for (const notText of [null, undefined, 42, true, ['a'], { text: 'a' }]) {
      await expect(validator.validate(inputFor(notText))).resolves.toBeUndefined();
    }
  });
});
