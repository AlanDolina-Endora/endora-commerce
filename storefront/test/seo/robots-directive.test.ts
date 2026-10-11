import { describe, expect, it } from 'vitest';
import {
  ROBOTS_DEFAULT_REQUEST_HEADER,
  ROBOTS_RESPONSE_HEADER,
  forwardRobotsDefault,
  robotsDirective,
  robotsDirectiveFromHeader,
  stampRobotsResponse,
} from '../../lib/seo/robots-directive';

/**
 * A channel's default robots policy → what a response carries
 * (`specs/144-seo-search-engine-robots/contracts/crawler-policy.md` §6).
 *
 * One property matters more than the strings: **the default only ever adds a
 * restriction.** Nothing here can emit `index` or `follow`, so there is no
 * input for which this function loosens what a page declared for itself — and
 * for the policy every untouched instance has, it emits nothing at all, which
 * is what keeps such an instance's responses identical to before the feature.
 */
describe('robotsDirective', () => {
  it.each([
    ['no policy exists (the module is off, or the backend has no such feature)', { kind: 'none' }],
    ['the policy could not be read and none was ever known', { kind: 'unknown' }],
    ['the policy restricts nothing', { kind: 'value', value: { index: true, follow: true } }],
  ] as const)('emits nothing when %s', (_label, read) => {
    expect(robotsDirective(read)).toBeNull();
  });

  it.each([
    [{ index: false, follow: true }, 'noindex'],
    [{ index: true, follow: false }, 'nofollow'],
    [{ index: false, follow: false }, 'noindex, nofollow'],
  ] as const)('emits the exact directive for %o', (value, directive) => {
    expect(robotsDirective({ kind: 'value', value })).toBe(directive);
  });

  it('never emits a permissive token for any policy', () => {
    for (const index of [true, false]) {
      for (const follow of [true, false]) {
        const directive = robotsDirective({ kind: 'value', value: { index, follow } }) ?? '';
        expect(directive.split(', ').filter((token) => token !== '')).toEqual(
          [...(index ? [] : ['noindex']), ...(follow ? [] : ['nofollow'])],
        );
      }
    }
  });
});

describe('the response header', () => {
  it('is set when the policy restricts something', () => {
    const headers = new Headers();
    stampRobotsResponse(headers, 'noindex, nofollow');
    expect(headers.get(ROBOTS_RESPONSE_HEADER)).toBe('noindex, nofollow');
    expect(ROBOTS_RESPONSE_HEADER).toBe('X-Robots-Tag');
  });

  it('states the directive once: a value already on the response is replaced, not added to', () => {
    const headers = new Headers({ 'x-robots-tag': 'nofollow' });
    stampRobotsResponse(headers, 'noindex, nofollow');
    expect(headers.get(ROBOTS_RESPONSE_HEADER)).toBe('noindex, nofollow');
    stampRobotsResponse(headers, 'noindex, nofollow');
    expect(headers.get(ROBOTS_RESPONSE_HEADER)).toBe('noindex, nofollow');
  });

  it('is not set, and nothing else is touched, when it does not', () => {
    const headers = new Headers({ 'cache-control': 'no-store' });
    stampRobotsResponse(headers, null);
    expect([...headers.keys()]).toEqual(['cache-control']);
  });
});

describe('the request header the root layout reads', () => {
  it('carries the directive to the render', () => {
    const headers = new Headers();
    forwardRobotsDefault(headers, 'noindex');
    expect(headers.get(ROBOTS_DEFAULT_REQUEST_HEADER)).toBe('noindex');
    expect(ROBOTS_DEFAULT_REQUEST_HEADER).toBe('x-robots-default');
  });

  it('is deleted when there is no restrictive policy, so a value a client sent never survives', () => {
    for (const supplied of ['noindex, nofollow', 'index, follow', 'none', '<script>']) {
      const headers = new Headers({ [ROBOTS_DEFAULT_REQUEST_HEADER]: supplied });
      forwardRobotsDefault(headers, null);
      expect(headers.has(ROBOTS_DEFAULT_REQUEST_HEADER)).toBe(false);
    }
  });

  it('replaces a value a client sent rather than appending to it', () => {
    const headers = new Headers({ [ROBOTS_DEFAULT_REQUEST_HEADER]: 'index, follow' });
    forwardRobotsDefault(headers, 'nofollow');
    expect(headers.get(ROBOTS_DEFAULT_REQUEST_HEADER)).toBe('nofollow');
  });
});

describe('robotsDirectiveFromHeader', () => {
  it.each(['noindex', 'nofollow', 'noindex, nofollow'])('accepts %s', (value) => {
    expect(robotsDirectiveFromHeader(value)).toBe(value);
  });

  it.each([
    ['an absent header', null],
    ['the empty string', ''],
    ['a permissive directive', 'index, follow'],
    ['another directive', 'noarchive'],
    ['a reordered pair', 'nofollow, noindex'],
    ['markup', '"><script>alert(1)</script>'],
  ])('renders nothing for %s', (_label, value) => {
    // The layout renders this value into the document. The middleware is what
    // makes the header trustworthy; this is what makes the layout safe to read
    // on its own — it can only ever render one of the three strings above.
    expect(robotsDirectiveFromHeader(value)).toBeNull();
  });
});
