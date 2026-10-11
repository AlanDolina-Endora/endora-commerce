import { describe, expect, it } from 'vitest';
import {
  CRAWLER_TEXT_MAX_BYTES,
  composeCrawlerFile,
  storefrontCrawlerFilesResponseSchema,
  storefrontCrawlerFilesSchema,
  storefrontRobotsPolicyResponseSchema,
  storefrontRobotsPolicySchema,
} from './seo.js';

/**
 * `specs/144-seo-search-engine-robots/contracts/crawler-policy.md` §1 — what
 * `GET /api/v1/storefront/seo/robots-policy` answers.
 *
 * The wire carries two booleans and nothing else. The token an operator picks
 * on the Settings screen (`NOINDEX, FOLLOW` …) is the `seo` module's stored
 * vocabulary and never crosses it, so a consumer branches on `index` and
 * `follow` and cannot come to depend on a spelling.
 *
 * The schema is strict about the two members it reads and tolerant of members
 * it does not know — the second half is what lets a backend add a field
 * without every storefront already deployed reading the answer as unreadable.
 * (`specs/144-seo-search-engine-robots/tasks.md` T005 asked for an extra member
 * to be *rejected*; forward compatibility won, and the member is dropped
 * instead.)
 */
describe('storefrontRobotsPolicySchema', () => {
  it.each([
    { index: true, follow: true },
    { index: false, follow: true },
    { index: true, follow: false },
    { index: false, follow: false },
  ])('accepts %o', (policy) => {
    expect(storefrontRobotsPolicySchema.parse(policy)).toEqual(policy);
  });

  it('rejects a missing key', () => {
    expect(storefrontRobotsPolicySchema.safeParse({ index: false }).success).toBe(false);
    expect(storefrontRobotsPolicySchema.safeParse({ follow: false }).success).toBe(false);
    expect(storefrontRobotsPolicySchema.safeParse({}).success).toBe(false);
  });

  it('rejects a value that is not a boolean', () => {
    expect(storefrontRobotsPolicySchema.safeParse({ index: 'false', follow: true }).success).toBe(
      false,
    );
    expect(storefrontRobotsPolicySchema.safeParse({ index: true, follow: 0 }).success).toBe(false);
    expect(storefrontRobotsPolicySchema.safeParse({ index: null, follow: true }).success).toBe(
      false,
    );
  });

  it('accepts a member it does not know, and drops it', () => {
    // A later backend adding a field must not make this answer unreadable.
    const parsed = storefrontRobotsPolicySchema.parse({
      index: false,
      follow: false,
      maxSnippet: 0,
      defaultRobots: 'NOINDEX, NOFOLLOW',
    });
    // …and the consumer never sees what it was not written for — the stored
    // token included, should a backend ever send it.
    expect(parsed).toEqual({ index: false, follow: false });
    expect(Object.keys(parsed)).toEqual(['index', 'follow']);
  });

  it('is not made valid by an unknown member when a known one is missing or mistyped', () => {
    expect(
      storefrontRobotsPolicySchema.safeParse({ index: false, defaultRobots: 'NOINDEX, NOFOLLOW' })
        .success,
    ).toBe(false);
    expect(
      storefrontRobotsPolicySchema.safeParse({ index: 'false', follow: true, extra: true }).success,
    ).toBe(false);
  });
});

describe('storefrontRobotsPolicyResponseSchema', () => {
  it('accepts the envelope', () => {
    const body = { data: { index: false, follow: true } };
    expect(storefrontRobotsPolicyResponseSchema.parse(body)).toEqual(body);
  });

  it('accepts an envelope and a policy carrying members it does not know', () => {
    expect(
      storefrontRobotsPolicyResponseSchema.parse({
        data: { index: true, follow: false, maxSnippet: 0 },
        meta: { generatedAt: '2026-10-11T00:00:00.000Z' },
      }),
    ).toEqual({ data: { index: true, follow: false } });
  });

  it('rejects a bare policy, an empty envelope and the stored token as data', () => {
    expect(
      storefrontRobotsPolicyResponseSchema.safeParse({ index: false, follow: true }).success,
    ).toBe(false);
    expect(storefrontRobotsPolicyResponseSchema.safeParse({ data: {} }).success).toBe(false);
    expect(
      storefrontRobotsPolicyResponseSchema.safeParse({ data: 'NOINDEX, FOLLOW' }).success,
    ).toBe(false);
  });
});

/**
 * `specs/144-seo-search-engine-robots/contracts/crawler-policy.md` §4 — how a
 * crawler file is put together from the part the storefront generates and the
 * part an operator wrote.
 *
 * One function, because two things have to agree about the join: the file the
 * storefront serves and the preview the Admin UI shows of it.
 *
 * ## What "verbatim" means here
 *
 * Every character of the operator's text is served, unchanged and in order,
 * with two exceptions that are about line breaks and nothing else:
 *
 *  * a line break is served as a line feed however it was stored. A browser's
 *    text field always sends line feeds, an API client may send `CRLF`, and
 *    one file must not come out with two conventions in it depending on which
 *    of them saved last;
 *  * line breaks at the very end of the text are served as exactly one.
 *
 * (`specs/144-seo-search-engine-robots/tasks.md` T054 asked for `CRLF` to be
 * *preserved*; the definition above won, and the cases below hold it.)
 */
describe('composeCrawlerFile', () => {
  const BASE = 'User-Agent: *\nAllow: /\nDisallow: /cart\n\nSitemap: https://shop.example.com/sitemap.xml\n';

  it.each([
    ['the empty string', ''],
    ['spaces', '   '],
    ['line breaks', '\n\n'],
    ['CRLF line breaks and a tab', '\r\n\t\r\n'],
  ])('returns the base byte for byte when the extra text is %s', (_label, extra) => {
    expect(composeCrawlerFile(BASE, extra)).toBe(BASE);
    // …whatever the base ends with: it is not this function's to tidy.
    expect(composeCrawlerFile('no trailing break', extra)).toBe('no trailing break');
    expect(composeCrawlerFile('three breaks\n\n\n', extra)).toBe('three breaks\n\n\n');
  });

  it('appends the extra text after one blank line and ends with one line break', () => {
    expect(composeCrawlerFile(BASE, 'User-agent: GPTBot\nDisallow: /')).toBe(
      `${BASE}\nUser-agent: GPTBot\nDisallow: /\n`,
    );
  });

  it('separates by exactly one blank line whatever the base ends with', () => {
    const expected = 'base\n\nextra\n';
    expect(composeCrawlerFile('base', 'extra')).toBe(expected);
    expect(composeCrawlerFile('base\n', 'extra')).toBe(expected);
    expect(composeCrawlerFile('base\n\n\n', 'extra')).toBe(expected);
  });

  it('ends with exactly one line break however many the extra text ends with', () => {
    expect(composeCrawlerFile('base\n', 'extra\n')).toBe('base\n\nextra\n');
    expect(composeCrawlerFile('base\n', 'extra\n\n\n')).toBe('base\n\nextra\n');
    expect(composeCrawlerFile('base\n', 'extra\r\n\r\n')).toBe('base\n\nextra\n');
  });

  it('leaves everything inside the extra text as it was written', () => {
    const extra = [
      '# Zażółć gęślą jaźń — a comment, with non-ASCII and trailing spaces   ',
      '',
      '',
      '\tUser-agent:  GPTBot',
      'Disallow: /*?sort=',
      '  Crawl-delay: 10',
      '<script>alert(1)</script>',
    ].join('\n');
    expect(composeCrawlerFile('base\n', extra)).toBe(`base\n\n${extra}\n`);
  });

  it('keeps blank lines the extra text starts with', () => {
    expect(composeCrawlerFile('base\n', '\n\nextra')).toBe('base\n\n\n\nextra\n');
  });

  it('serves every line break as a line feed, whichever way it was stored', () => {
    const served = 'base\n\nUser-agent: a\nDisallow: /x\n\nUser-agent: b\nDisallow: /y\n';
    expect(
      composeCrawlerFile('base\n', 'User-agent: a\nDisallow: /x\n\nUser-agent: b\nDisallow: /y'),
    ).toBe(served);
    expect(
      composeCrawlerFile(
        'base\n',
        'User-agent: a\r\nDisallow: /x\r\n\r\nUser-agent: b\r\nDisallow: /y\r\n',
      ),
    ).toBe(served);
    expect(
      composeCrawlerFile('base\n', 'User-agent: a\rDisallow: /x\r\rUser-agent: b\rDisallow: /y'),
    ).toBe(served);
    // Mixed, as a text edited through two clients ends up.
    expect(
      composeCrawlerFile('base\n', 'User-agent: a\r\nDisallow: /x\n\rUser-agent: b\nDisallow: /y'),
    ).toBe(served);
    expect(served).not.toContain('\r');
  });

  it('never changes the base it was given', () => {
    // The system-generated rules are the storefront's; an operator's text can
    // follow them and cannot reach into them.
    const composed = composeCrawlerFile(BASE, 'Disallow: /');
    expect(composed.startsWith(BASE)).toBe(true);
  });
});

/**
 * `specs/144-seo-search-engine-robots/contracts/crawler-policy.md` §2 — what
 * `GET /api/v1/storefront/seo/crawler-files` answers.
 *
 * Tolerant of members it does not know and strict about the ones it names, for
 * the reason given at `storefrontRobotsPolicySchema`: a storefront is usually
 * older than its backend.
 */
describe('storefrontCrawlerFilesSchema', () => {
  const FILES = {
    index: false,
    follow: true,
    robotsTxtCustom: 'User-agent: GPTBot\nDisallow: /\n',
    llmsTxtAdditional: '',
    shop: { name: 'Endora Demo' },
  };

  it('accepts the documented shape', () => {
    expect(storefrontCrawlerFilesSchema.parse(FILES)).toEqual(FILES);
  });

  it('accepts empty texts and an empty shop name', () => {
    const empty = { ...FILES, robotsTxtCustom: '', shop: { name: '' } };
    expect(storefrontCrawlerFilesSchema.parse(empty)).toEqual(empty);
  });

  it('returns the texts exactly as given, line breaks included', () => {
    const text = '  first\r\n\r\n\tsecond \n';
    expect(
      storefrontCrawlerFilesSchema.parse({ ...FILES, robotsTxtCustom: text }).robotsTxtCustom,
    ).toBe(text);
  });

  it.each(['index', 'follow', 'robotsTxtCustom', 'llmsTxtAdditional', 'shop'] as const)(
    'rejects a missing %s',
    (member) => {
      const partial: Record<string, unknown> = { ...FILES };
      delete partial[member];
      expect(storefrontCrawlerFilesSchema.safeParse(partial).success).toBe(false);
    },
  );

  it('rejects a text that is not a string, and a shop without a name', () => {
    for (const wrong of [
      { ...FILES, robotsTxtCustom: null },
      { ...FILES, robotsTxtCustom: ['Disallow: /'] },
      { ...FILES, llmsTxtAdditional: 1 },
      { ...FILES, shop: {} },
      { ...FILES, shop: 'Endora Demo' },
      { ...FILES, shop: { name: null } },
      { ...FILES, index: 'false' },
    ]) {
      expect(storefrontCrawlerFilesSchema.safeParse(wrong).success).toBe(false);
    }
  });

  it('rejects a text longer than any the backend accepts', () => {
    // The limit is in bytes and is enforced where the text is saved. A text of
    // that many bytes never has more characters than that, so a longer string
    // is one that did not come through that door.
    expect(CRAWLER_TEXT_MAX_BYTES).toBe(65_536);
    const atLimit = 'a'.repeat(CRAWLER_TEXT_MAX_BYTES);
    expect(
      storefrontCrawlerFilesSchema.safeParse({ ...FILES, robotsTxtCustom: atLimit }).success,
    ).toBe(true);
    expect(
      storefrontCrawlerFilesSchema.safeParse({ ...FILES, robotsTxtCustom: `${atLimit}a` }).success,
    ).toBe(false);
    expect(
      storefrontCrawlerFilesSchema.safeParse({ ...FILES, llmsTxtAdditional: `${atLimit}a` }).success,
    ).toBe(false);
  });

  it('accepts members it does not know, and drops them', () => {
    const parsed = storefrontCrawlerFilesSchema.parse({
      ...FILES,
      somethingNewer: true,
      shop: { name: 'Endora Demo', logoUrl: 'https://cdn.example.com/logo.png' },
    });
    expect(parsed).toEqual(FILES);
  });
});

describe('storefrontCrawlerFilesResponseSchema', () => {
  const FILES = {
    index: true,
    follow: true,
    robotsTxtCustom: '',
    llmsTxtAdditional: '',
    shop: { name: '' },
  };

  it('accepts the envelope, with or without members it does not know', () => {
    expect(storefrontCrawlerFilesResponseSchema.parse({ data: FILES })).toEqual({ data: FILES });
    expect(
      storefrontCrawlerFilesResponseSchema.parse({ data: FILES, meta: { a: 1 } }),
    ).toEqual({ data: FILES });
  });

  it('rejects the bare value, an empty envelope and a robots policy alone', () => {
    expect(storefrontCrawlerFilesResponseSchema.safeParse(FILES).success).toBe(false);
    expect(storefrontCrawlerFilesResponseSchema.safeParse({ data: {} }).success).toBe(false);
    expect(
      storefrontCrawlerFilesResponseSchema.safeParse({ data: { index: true, follow: true } })
        .success,
    ).toBe(false);
  });
});
