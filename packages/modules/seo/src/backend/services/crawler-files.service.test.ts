import { describe, expect, it } from 'vitest';
import {
  CRAWLER_TEXT_MAX_BYTES,
  storefrontCrawlerFilesSchema,
} from '@endora-commerce/contracts';
import type { z } from 'zod';
import {
  ROBOTS_TXT_CUSTOM_SETTING_CODE,
  StoredCrawlerTextTooLargeError,
  resolveCrawlerFiles,
  type CrawlerFilesSettingsPort,
} from './crawler-files.service.js';
import { UnknownRobotsTokenError } from './robots-policy.js';

/**
 * What a sales channel's crawler files are built from
 * (`specs/144-seo-search-engine-robots/contracts/crawler-policy.md` §2).
 *
 * The settings store resolves channel value → all-channels value → default;
 * this is only about what the module does with what it is handed, so the store
 * is a table here. The resolution itself is held against a real database in
 * `backend/test/integration/seo/crawler-files-channel-scope.test.ts`.
 */
describe('resolveCrawlerFiles', () => {
  const CHANNEL = '00000000-0000-4000-8000-000000000001';

  function settings(
    values: Record<string, unknown>,
    seen: { code: string; salesChannelId: string | null }[] = [],
  ): CrawlerFilesSettingsPort {
    return {
      async get<T>(code: string, salesChannelId: string, schema: z.ZodType<T>): Promise<T> {
        seen.push({ code, salesChannelId });
        if (!Object.hasOwn(values, code)) throw new Error(`Setting "${code}" is not registered.`);
        return schema.parse(values[code]);
      },
      async getMany(codes: string[], salesChannelId: string) {
        return new Map(
          codes.map((code) => {
            seen.push({ code, salesChannelId });
            return [
              code,
              Object.hasOwn(values, code)
                ? ({ ok: true, value: values[code] } as const)
                : ({ ok: false, error: 'not_registered' } as const),
            ];
          }),
        );
      },
    };
  }

  const STORED = {
    'seo.default_robots': 'NOINDEX, FOLLOW',
    'seo.robots_txt_custom': 'User-agent: GPTBot\r\nDisallow: /\n\n  # kept \n',
    'shop.name': 'Endora Demo',
  };

  it('answers the documented shape', async () => {
    const files = await resolveCrawlerFiles(settings(STORED), CHANNEL);
    expect(files).toEqual({
      index: false,
      follow: true,
      robotsTxtCustom: STORED['seo.robots_txt_custom'],
      llmsTxtAdditional: '',
      shop: { name: 'Endora Demo' },
    });
    expect(storefrontCrawlerFilesSchema.parse(files)).toEqual(files);
    expect(ROBOTS_TXT_CUSTOM_SETTING_CODE).toBe('seo.robots_txt_custom');
  });

  it('returns the text exactly as stored — no trimming, no line-break rewriting', async () => {
    const text = '\r\n  \tfirst  \r\n\r\nsecond\n\n\n';
    const files = await resolveCrawlerFiles(
      settings({ ...STORED, 'seo.robots_txt_custom': text }),
      CHANNEL,
    );
    expect(files.robotsTxtCustom).toBe(text);
  });

  it('reads every setting for the channel it was given, and no other', async () => {
    const seen: { code: string; salesChannelId: string | null }[] = [];
    await resolveCrawlerFiles(settings(STORED, seen), CHANNEL);
    expect(seen.map((read) => read.code).sort()).toEqual([
      'seo.default_robots',
      'seo.robots_txt_custom',
      'shop.name',
    ]);
    expect(new Set(seen.map((read) => read.salesChannelId))).toEqual(new Set([CHANNEL]));
  });

  it('answers an empty shop name when none is set, is registered, or is a text', async () => {
    for (const values of [
      { ...STORED, 'shop.name': '' },
      { 'seo.default_robots': 'INDEX, FOLLOW', 'seo.robots_txt_custom': '' },
      { ...STORED, 'shop.name': 42 },
    ]) {
      expect((await resolveCrawlerFiles(settings(values), CHANNEL)).shop).toEqual({ name: '' });
    }
  });

  it('throws for a stored robots value outside the four choices, rather than answer "no restriction"', async () => {
    await expect(
      resolveCrawlerFiles(settings({ ...STORED, 'seo.default_robots': 'NOINDEX' }), CHANNEL),
    ).rejects.toBeInstanceOf(UnknownRobotsTokenError);
  });

  it('throws for a stored text over the limit, rather than serve what the write door refuses', async () => {
    // Only a row written around the settings API can be this long.
    const atLimit = 'a'.repeat(CRAWLER_TEXT_MAX_BYTES);
    await expect(
      resolveCrawlerFiles(settings({ ...STORED, 'seo.robots_txt_custom': atLimit }), CHANNEL),
    ).resolves.toMatchObject({ robotsTxtCustom: atLimit });

    const tooLong = resolveCrawlerFiles(
      settings({ ...STORED, 'seo.robots_txt_custom': `${'ż'.repeat(CRAWLER_TEXT_MAX_BYTES / 2)}a` }),
      CHANNEL,
    );
    await expect(tooLong).rejects.toBeInstanceOf(StoredCrawlerTextTooLargeError);
    await expect(tooLong).rejects.toThrow(/seo\.robots_txt_custom.*65537.*65536/);
  });

  it('throws when the text setting cannot be read, rather than answer an empty text', async () => {
    // An empty text at `200` would be definitive: the storefront would serve a
    // file without the operator's instructions and call it current.
    await expect(
      resolveCrawlerFiles(settings({ 'seo.default_robots': 'INDEX, FOLLOW' }), CHANNEL),
    ).rejects.toThrow(/seo\.robots_txt_custom/);
    await expect(
      resolveCrawlerFiles(settings({ ...STORED, 'seo.robots_txt_custom': 42 }), CHANNEL),
    ).rejects.toThrow();
  });
});
