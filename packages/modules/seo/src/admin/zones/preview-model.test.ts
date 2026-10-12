import { describe, expect, it } from 'vitest';
import { composeCrawlerFile, type AdminCrawlerFilePreview } from '@endora-commerce/contracts';
import {
  DEFAULT_ROBOTS_NOTICE_MAX_CHANNELS,
  buildPreviewModel,
  closesSiteToEveryCrawler,
  outdatedStorefrontChannels,
  servedOperatorPart,
  servedSystemPart,
  type PreviewModel,
  type PreviewRequest,
} from './preview-model.js';

/**
 * What the `robots.txt` preview shows — one case per row of
 * `specs/144-seo-search-engine-robots/contracts/admin-surfaces.md` §4.
 *
 * The model is a pure function, so every state of the screen is reachable
 * here without a browser: which blocks, which notices, and — the property the
 * preview exists for — that the two blocks are the served file and nothing
 * else.
 */

const BASE = 'User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://shop.example/sitemap.xml\n';
const OWN = 'User-agent: GPTBot\nDisallow: /\n';

function answer(overrides: Partial<AdminCrawlerFilePreview> = {}): AdminCrawlerFilePreview {
  return {
    file: 'robots',
    salesChannelCode: 'pl',
    state: 'ok',
    base: BASE,
    savedExtra: '',
    savedExtraSource: 'default',
    channelsWithOwnValue: [],
    policy: { index: true, follow: true },
    storefront: { url: 'https://shop.example', source: 'setting' },
    ...overrides,
  };
}

const ready = (overrides: Partial<AdminCrawlerFilePreview> = {}): PreviewRequest => ({
  status: 'ready',
  data: answer(overrides),
});

const kinds = (model: PreviewModel): string[] => model.notices.map((notice) => notice.kind);

/** The two blocks, joined the way the screen's reader would join them. */
function blocksAsFile(model: PreviewModel): string {
  if (model.systemPart === null) throw new Error('no system part');
  return model.operatorPart === ''
    ? model.systemPart
    : `${model.systemPart}\n\n${model.operatorPart}\n`;
}

describe('buildPreviewModel — state ok', () => {
  it('shows the system part and the operator’s part as two blocks, in served order', () => {
    const model = buildPreviewModel(
      { channelCode: 'pl', draftText: OWN, dirty: false },
      'pl',
      ready({ savedExtra: OWN, savedExtraSource: 'channel', channelsWithOwnValue: ['pl'] }),
    );
    expect(model.mode).toBe('channel');
    expect(model.previewedChannel).toBe('pl');
    expect(model.loading).toBe(false);
    expect(model.systemPart).toBe(BASE.trimEnd());
    expect(model.operatorPart).toBe('User-agent: GPTBot\nDisallow: /');
    expect(model.operatorPartOrigin).toBe('field');
    expect(model.operatorPartUnsaved).toBe(false);
    expect(model.storefrontUrl).toBe('https://shop.example');
    expect(kinds(model)).toEqual([]);
  });

  it('the two blocks are the served file: exactly what composeCrawlerFile answers', () => {
    const model = buildPreviewModel({ channelCode: 'pl', draftText: OWN, dirty: false }, 'pl', ready());
    expect(model.composed).toBe(composeCrawlerFile(BASE, OWN));
    expect(blocksAsFile(model)).toBe(model.composed);
  });

  it.each([
    ['nothing at all', ''],
    ['only whitespace', '  \n\t\n'],
    ['only a byte order mark', '﻿'],
  ])('with %s in the field the file is the system part alone, byte for byte', (_label, text) => {
    const model = buildPreviewModel({ channelCode: 'pl', draftText: text, dirty: false }, 'pl', ready());
    expect(model.operatorPart).toBe('');
    expect(model.systemPart).toBe(BASE);
    expect(model.composed).toBe(BASE);
    expect(blocksAsFile(model)).toBe(BASE);
  });

  it.each([
    ['CRLF line breaks', 'User-agent: A\r\nDisallow: /x\r\n'],
    ['lone carriage returns', 'User-agent: A\rDisallow: /x\r'],
    ['a leading byte order mark', '﻿User-agent: A\nDisallow: /x'],
    ['many trailing line breaks', 'User-agent: A\nDisallow: /x\n\n\n\n'],
    ['leading blank lines and indentation', '\n\n  User-agent: A\n\tDisallow: /x  \n'],
    ['text outside ASCII', '# Zażółć gęślą jaźń 🤖\nDisallow: /zażółć\n'],
  ])('shows the operator’s part as it is served for %s', (_label, text) => {
    const model = buildPreviewModel({ channelCode: 'pl', draftText: text, dirty: true }, 'pl', ready());
    expect(model.composed).toBe(composeCrawlerFile(BASE, text));
    expect(blocksAsFile(model)).toBe(model.composed);
    expect(model.operatorPart).not.toContain('\r');
    expect(model.operatorPart.startsWith('﻿')).toBe(false);
    expect(model.operatorPart.endsWith('\n')).toBe(false);
  });

  it('a system part without a closing line break joins the same way', () => {
    const base = 'User-agent: *\nAllow: /';
    const model = buildPreviewModel(
      { channelCode: 'pl', draftText: OWN, dirty: false },
      'pl',
      ready({ base }),
    );
    expect(blocksAsFile(model)).toBe(composeCrawlerFile(base, OWN));
  });

  it('treats a setting with no text value as an empty field', () => {
    const model = buildPreviewModel({ channelCode: 'pl', draftText: null, dirty: false }, 'pl', ready());
    expect(model.operatorPart).toBe('');
    expect(model.composed).toBe(BASE);
  });
});

describe('buildPreviewModel — unsaved text', () => {
  it('takes the operator’s part from the field and marks it as not yet served', () => {
    const model = buildPreviewModel(
      { channelCode: 'pl', draftText: 'Disallow: /new/\n', dirty: true },
      'pl',
      ready({ savedExtra: OWN, savedExtraSource: 'channel', channelsWithOwnValue: ['pl'] }),
    );
    expect(model.operatorPart).toBe('Disallow: /new/');
    expect(model.operatorPartUnsaved).toBe(true);
    expect(kinds(model)).toContain('unsaved');
    expect(model.composed).toBe(composeCrawlerFile(BASE, 'Disallow: /new/\n'));
    // Not one character of the saved text is shown as if it were the field's.
    expect(model.operatorPart).not.toContain('GPTBot');
  });

  it('says nothing about saving while the field holds what is stored', () => {
    const model = buildPreviewModel({ channelCode: 'pl', draftText: OWN, dirty: false }, 'pl', ready());
    expect(model.operatorPartUnsaved).toBe(false);
    expect(kinds(model)).not.toContain('unsaved');
  });

  it('still says it while the storefront’s part is being asked for', () => {
    const model = buildPreviewModel(
      { channelCode: 'pl', draftText: 'Disallow: /new/', dirty: true },
      'pl',
      { status: 'loading' },
    );
    expect(model.loading).toBe(true);
    expect(model.systemPart).toBeNull();
    expect(model.operatorPart).toBe('Disallow: /new/');
    expect(kinds(model)).toEqual(['unsaved']);
  });
});

describe('buildPreviewModel — the all-channels value', () => {
  it('previews the field’s text on the chosen channel and names the channels it does not reach', () => {
    const model = buildPreviewModel(
      { channelCode: null, draftText: 'Disallow: /shared/\n', dirty: true },
      'pl',
      ready({ savedExtraSource: 'global', channelsWithOwnValue: ['de', 'fr'] }),
    );
    expect(model.mode).toBe('all-channels');
    expect(model.previewedChannel).toBe('pl');
    expect(model.operatorPartOrigin).toBe('field');
    expect(model.operatorPart).toBe('Disallow: /shared/');
    const unaffected = model.notices.find((notice) => notice.kind === 'channels-with-own-value');
    expect(unaffected?.channels).toEqual(['de', 'fr']);
    expect(kinds(model)).toEqual(['unsaved', 'channels-with-own-value']);
  });

  it('shows a chosen channel that has its own value what it serves — not the field', () => {
    const model = buildPreviewModel(
      { channelCode: null, draftText: 'Disallow: /shared/\n', dirty: true },
      'de',
      ready({
        salesChannelCode: 'de',
        savedExtra: OWN,
        savedExtraSource: 'channel',
        channelsWithOwnValue: ['de'],
      }),
    );
    expect(model.operatorPartOrigin).toBe('saved');
    expect(model.operatorPart).toBe('User-agent: GPTBot\nDisallow: /');
    expect(model.operatorPart).not.toContain('shared');
    // What is shown is saved, so it is not announced as unsaved.
    expect(model.operatorPartUnsaved).toBe(false);
    expect(kinds(model)).toEqual(['previewed-channel-has-own-value', 'channels-with-own-value']);
    expect(model.composed).toBe(composeCrawlerFile(BASE, OWN));
  });

  it('names no unaffected channel when none has its own value', () => {
    const model = buildPreviewModel({ channelCode: null, draftText: '', dirty: false }, 'pl', ready());
    expect(kinds(model)).toEqual([]);
  });

  it('says so when there is no sales channel to preview', () => {
    const model = buildPreviewModel({ channelCode: null, draftText: OWN, dirty: false }, null, {
      status: 'loading',
    });
    expect(model.previewedChannel).toBeNull();
    expect(kinds(model)).toContain('no-channel');
    expect(model.operatorPart).toBe('User-agent: GPTBot\nDisallow: /');
  });

  it('a channel row never lists other channels: its value is its own', () => {
    const model = buildPreviewModel(
      { channelCode: 'pl', draftText: OWN, dirty: false },
      'pl',
      ready({ channelsWithOwnValue: ['pl', 'de'] }),
    );
    expect(kinds(model)).toEqual([]);
  });
});

describe('buildPreviewModel — a channel whose default robots forbids indexing', () => {
  const noindex = { policy: { index: false, follow: true } };

  it('says that robots.txt stays open on purpose', () => {
    const model = buildPreviewModel({ channelCode: 'pl', draftText: '', dirty: false }, 'pl', ready(noindex));
    expect(kinds(model)).toEqual(['stays-open']);
    // The file itself is unchanged by the policy.
    expect(model.composed).toBe(BASE);
  });

  it('cautions when the operator’s text closes the site to every crawler', () => {
    const model = buildPreviewModel(
      { channelCode: 'pl', draftText: 'User-agent: *\nDisallow: /\n', dirty: true },
      'pl',
      ready(noindex),
    );
    expect(kinds(model)).toEqual(['unsaved', 'stays-open', 'site-wide-disallow']);
    expect(model.notices.find((notice) => notice.kind === 'site-wide-disallow')?.tone).toBe('warning');
  });

  it('does not caution about a ban on one named crawler', () => {
    const model = buildPreviewModel({ channelCode: 'pl', draftText: OWN, dirty: false }, 'pl', ready(noindex));
    expect(kinds(model)).toEqual(['stays-open']);
  });

  it('says neither on a channel that may be indexed, whatever the text', () => {
    const model = buildPreviewModel(
      { channelCode: 'pl', draftText: 'User-agent: *\nDisallow: /\n', dirty: false },
      'pl',
      ready(),
    );
    expect(kinds(model)).toEqual([]);
  });

  it('NOFOLLOW alone is not NOINDEX', () => {
    const model = buildPreviewModel(
      { channelCode: 'pl', draftText: '', dirty: false },
      'pl',
      ready({ policy: { index: true, follow: false } }),
    );
    expect(kinds(model)).toEqual([]);
  });
});

describe('buildPreviewModel — when the system part cannot be shown as current', () => {
  it('storefront-outdated: the rules it serves, a warning, and no claim that the text is joined', () => {
    const model = buildPreviewModel(
      { channelCode: 'pl', draftText: OWN, dirty: false },
      'pl',
      ready({ state: 'storefront-outdated' }),
    );
    expect(kinds(model)).toEqual(['storefront-outdated']);
    expect(model.notices[0]?.tone).toBe('warning');
    // Its whole answer, untouched: that storefront appends nothing.
    expect(model.systemPart).toBe(BASE);
    expect(model.operatorPart).toBe('User-agent: GPTBot\nDisallow: /');
    expect(model.composed).toBeNull();
  });

  it.each([
    ['storefront-unreachable', 'storefront-unreachable'],
    ['address-unknown', 'address-unknown'],
  ] as const)('%s: says so, shows no system part, and still shows the operator’s part', (state, kind) => {
    const model = buildPreviewModel(
      { channelCode: 'pl', draftText: OWN, dirty: true },
      'pl',
      ready({ state, base: null }),
    );
    expect(kinds(model)).toEqual([kind, 'unsaved']);
    expect(model.systemPart).toBeNull();
    expect(model.composed).toBeNull();
    expect(model.operatorPart).toBe('User-agent: GPTBot\nDisallow: /');
  });

  it('address-unknown shows no address, because there is none', () => {
    const model = buildPreviewModel(
      { channelCode: 'pl', draftText: '', dirty: false },
      'pl',
      ready({ state: 'address-unknown', base: null, storefront: { url: 'http://localhost:3000', source: 'fallback' } }),
    );
    expect(model.storefrontUrl).toBeNull();
  });

  it('a failed request: says so, shows no system part, keeps the operator’s part', () => {
    const model = buildPreviewModel(
      { channelCode: 'pl', draftText: OWN, dirty: false },
      'pl',
      { status: 'failed' },
    );
    expect(kinds(model)).toEqual(['preview-failed']);
    expect(model.systemPart).toBeNull();
    expect(model.operatorPart).toBe('User-agent: GPTBot\nDisallow: /');
  });

  it('never invents a system part: without a base there is none in any state', () => {
    for (const request of [
      { status: 'loading' },
      { status: 'failed' },
      ready({ state: 'storefront-unreachable', base: null }),
      ready({ state: 'address-unknown', base: null }),
      ready({ state: 'not-served', base: null }),
    ] as PreviewRequest[]) {
      const model = buildPreviewModel({ channelCode: 'pl', draftText: OWN, dirty: false }, 'pl', request);
      expect(model.systemPart).toBeNull();
      expect(model.composed).toBeNull();
    }
  });
});

describe('buildPreviewModel — the address every channel shares', () => {
  it('says so when the address is the deployment-wide one', () => {
    const model = buildPreviewModel(
      { channelCode: 'pl', draftText: '', dirty: false },
      'pl',
      ready({ storefront: { url: 'https://env.example', source: 'env' } }),
    );
    expect(kinds(model)).toEqual(['shared-address']);
    expect(model.storefrontUrl).toBe('https://env.example');
  });

  it('does not when the channel has an address of its own', () => {
    const model = buildPreviewModel({ channelCode: 'pl', draftText: '', dirty: false }, 'pl', ready());
    expect(kinds(model)).not.toContain('shared-address');
  });
});

describe('servedOperatorPart and servedSystemPart', () => {
  it.each([
    ['', ''],
    [' \n ', ''],
    ['a', 'a'],
    ['a\n', 'a'],
    ['a\r\nb\r\n\r\n', 'a\nb'],
    ['﻿a', 'a'],
    ['\n\na\n', '\n\na'],
  ])('servedOperatorPart(%j) is %j', (text, expected) => {
    expect(servedOperatorPart(text)).toBe(expected);
  });

  it('servedSystemPart is the base itself when the text adds nothing', () => {
    expect(servedSystemPart(BASE, '')).toBe(BASE);
    expect(servedSystemPart(BASE, '  \n')).toBe(BASE);
  });

  it('servedSystemPart drops only the line breaks the base ends with when text follows', () => {
    expect(servedSystemPart('a\nb\n\n\n', 'x')).toBe('a\nb');
    expect(servedSystemPart('', 'x')).toBe('');
  });
});

describe('closesSiteToEveryCrawler', () => {
  it.each([
    ['a ban under User-agent: *', 'User-agent: *\nDisallow: /\n'],
    ['field names in another case, with spaces', 'user-AGENT :  *\n  DISALLOW :  /  \n'],
    ['a ban in a group that names * among others', 'User-agent: GPTBot\nUser-agent: *\nDisallow: /\n'],
    ['a ban before any User-agent line, which follows the generated * group', 'Disallow: /\n'],
    ['CRLF line breaks', 'User-agent: *\r\nAllow: /a\r\nDisallow: /\r\n'],
    ['a trailing comment', 'User-agent: *\nDisallow: / # everything\n'],
    ['a later * group', 'User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /\n'],
  ])('is true for %s', (_label, text) => {
    expect(closesSiteToEveryCrawler(text)).toBe(true);
  });

  it.each([
    ['nothing', ''],
    ['a ban for one named crawler', 'User-agent: GPTBot\nDisallow: /\n'],
    ['a ban on a directory', 'User-agent: *\nDisallow: /private/\n'],
    ['an empty Disallow, which allows everything', 'User-agent: *\nDisallow:\n'],
    ['a commented-out ban', 'User-agent: *\n# Disallow: /\n'],
    ['Allow: /', 'User-agent: *\nAllow: /\n'],
    ['a named group after a * group that bans nothing', 'User-agent: *\nAllow: /\nUser-agent: Bot\nDisallow: /\n'],
    ['text that is not rules', 'hello world\n/\n'],
  ])('is false for %s', (_label, text) => {
    expect(closesSiteToEveryCrawler(text)).toBe(false);
  });

  it('is linear in the text: 64 KiB of line breaks, or of colons, is immediate', () => {
    const started = performance.now();
    closesSiteToEveryCrawler('\n'.repeat(65_536));
    closesSiteToEveryCrawler(':'.repeat(65_536));
    closesSiteToEveryCrawler('User-agent: *\n'.repeat(4_000));
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe('outdatedStorefrontChannels — the notice on the Default robots row', () => {
  it('names the channels whose storefront answered without the capability', () => {
    expect(
      outdatedStorefrontChannels([
        { channelCode: 'pl', request: ready({ state: 'storefront-outdated' }) },
        { channelCode: 'de', request: ready() },
        { channelCode: 'fr', request: ready({ state: 'storefront-outdated' }) },
      ]),
    ).toEqual(['pl', 'fr']);
  });

  it.each([
    ['still loading', { status: 'loading' }],
    ['the request failed', { status: 'failed' }],
    ['the storefront is unreachable', ready({ state: 'storefront-unreachable', base: null })],
    ['the address is unknown', ready({ state: 'address-unknown', base: null })],
    ['the storefront is current', ready()],
  ] as Array<[string, PreviewRequest]>)('names nobody when %s', (_label, request) => {
    expect(outdatedStorefrontChannels([{ channelCode: 'pl', request }])).toEqual([]);
  });

  it('bounds how many channels the all-channels row asks about', () => {
    expect(DEFAULT_ROBOTS_NOTICE_MAX_CHANNELS).toBe(5);
  });
});
