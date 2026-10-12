import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AdminCrawlerFilePreview, AdminZoneProps } from '@endora-commerce/contracts';
import { composeCrawlerFile } from '@endora-commerce/contracts';
import { AdminZone } from '@endora-commerce/admin-kit/zones';
import { renderWithI18n } from '../../helpers/render-with-i18n';
import { adminSession, modulePresence, withSession } from '../../helpers/render-with-session';

/**
 * `seo`'s two contributions beside its own settings on the Settings screen
 * (`specs/144-seo-search-engine-robots/contracts/admin-surfaces.md` §4):
 * the `robots.txt` preview on *Custom robots.txt instructions*, and the
 * outdated-storefront notice on *Default robots* (ruling R9).
 *
 * What is shown for which state is the pure model's subject, in the package
 * (`preview-model.test.ts`). This file holds what only a rendered tree can:
 * that the contributions are declared, matched and gated; that they vanish
 * with the module; that typing asks the backend nothing; that one channel's
 * answer is never drawn for another; and that what a storefront sent is drawn
 * as text.
 */

const getSpy = vi.fn();

vi.mock('@endora-commerce/admin-kit/lib', async () => {
  const actual = await vi.importActual<typeof import('@endora-commerce/admin-kit/lib')>(
    '@endora-commerce/admin-kit/lib',
  );
  return {
    ...actual,
    apiClient: {
      get: (...args: unknown[]) => getSpy(...args),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

const seo = await import('@endora-commerce/mod-seo/admin');
const REGISTRY = [{ moduleId: 'seo', contributions: seo.contributions }];

const readBundle = (language: 'en' | 'pl'): Record<string, string> =>
  JSON.parse(
    readFileSync(resolve(process.cwd(), `../packages/modules/seo/i18n/${language}.json`), 'utf8'),
  ) as Record<string, string>;
const EN = readBundle('en');
const PL = readBundle('pl');
const en = (key: string, params: Record<string, string> = {}): string => {
  const template = EN[key];
  if (template === undefined) throw new Error(`no such key in seo/i18n/en.json: ${key}`);
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => params[name] ?? `{${name}}`);
};

const BASE = 'User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://shop.example/sitemap.xml\n';
const OWN = 'User-agent: GPTBot\nDisallow: /\n';
const CHANNELS_URL = '/api/v1/admin/sales-channels?activeOnly=true&pageSize=100';
const previewUrl = (channel: string): string =>
  `/api/v1/admin/seo/crawler-files/preview?file=robots&salesChannelCode=${channel}`;

function answer(channel: string, overrides: Partial<AdminCrawlerFilePreview> = {}): { data: AdminCrawlerFilePreview } {
  return {
    data: {
      file: 'robots',
      salesChannelCode: channel,
      state: 'ok',
      base: BASE,
      savedExtra: '',
      savedExtraSource: 'default',
      channelsWithOwnValue: [],
      policy: { index: true, follow: true },
      storefront: { url: `https://${channel}.shop.example`, source: 'setting' },
      ...overrides,
    },
  };
}

/** What the backend answers, per channel. A missing channel is a failed request. */
let answers: Record<string, { data: AdminCrawlerFilePreview } | Error>;

type ZoneProps = AdminZoneProps<'settings.setting.after'>;

function zone(
  props: Partial<ZoneProps> = {},
  options: { readonly permissions?: readonly string[]; readonly present?: readonly string[] } = {},
): ReactElement {
  return withSession(
    <AdminZone
      name="settings.setting.after"
      props={{
        settingCode: 'seo.robots_txt_custom',
        ownerModule: 'seo',
        channelCode: 'pl',
        draftText: '',
        dirty: false,
        ...props,
      }}
    />,
    {
      session: adminSession({ permissions: [...(options.permissions ?? ['settings:read'])] }),
      presence: modulePresence({ present: [...(options.present ?? ['seo', 'settings'])] }),
      contributions: REGISTRY,
    },
  );
}

const previewCalls = (): string[] =>
  getSpy.mock.calls.map(([path]) => String(path)).filter((path) => path.includes('/crawler-files/'));

const part = (container: HTMLElement, name: string): HTMLElement | null =>
  container.querySelector(`[data-part="${name}"]`);

const notice = (container: HTMLElement, kind: string): HTMLElement | null =>
  container.querySelector(`[data-notice="${kind}"]`);

beforeEach(() => {
  answers = { pl: answer('pl'), de: answer('de') };
  getSpy.mockReset();
  getSpy.mockImplementation((path: string) => {
    if (path === CHANNELS_URL) {
      return Promise.resolve({
        items: [
          { code: 'pl', systemDefault: false },
          { code: 'de', systemDefault: true },
        ],
        page: 0,
        pageSize: 100,
        total: 2,
      });
    }
    for (const [channel, response] of Object.entries(answers)) {
      if (path === previewUrl(channel)) {
        return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
      }
    }
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
});

afterEach(() => cleanup());

describe('seo declares its contributions beside its settings', () => {
  it('the preview: matched to the robots.txt setting, gated on settings:read, behind a dynamic import', () => {
    const zones = (seo.contributions.zones ?? []).filter((entry) => entry.zone === 'settings.setting.after');
    expect(zones).toHaveLength(2);
    const preview = zones.find((entry) => entry.match?.['settingCode'] === 'seo.robots_txt_custom');
    expect(preview?.requiredPermission).toBe('settings:read');
    expect(typeof preview?.component).toBe('function');
  });

  it('the notice: matched to the default robots setting, gated on settings:read', () => {
    const zones = seo.contributions.zones ?? [];
    const noticeZone = zones.find((entry) => entry.match?.['settingCode'] === 'seo.default_robots');
    expect(noticeZone?.zone).toBe('settings.setting.after');
    expect(noticeZone?.requiredPermission).toBe('settings:read');
  });

  it('every contribution is narrowed to one setting: none renders beside a setting of another module', () => {
    for (const entry of seo.contributions.zones ?? []) {
      expect(typeof entry.match?.['settingCode']).toBe('string');
    }
  });

  it('ships every sentence in English and in Polish', () => {
    const keys = Object.keys(EN).filter((key) => key.startsWith('crawlerPreview.'));
    expect(keys.length).toBeGreaterThan(20);
    for (const key of keys) {
      expect(PL[key], `pl.json lacks ${key}`).toBeTruthy();
      expect(PL[key], `pl.json repeats the English for ${key}`).not.toBe(EN[key]);
    }
  });
});

describe('the robots.txt preview', () => {
  it('shows the storefront’s rules and the operator’s text as two labelled blocks, in served order', async () => {
    const { container } = renderWithI18n(zone({ draftText: OWN }), { seo: EN });
    const heading = await screen.findByRole('heading', { name: en('crawlerPreview.robots.title') });
    const section = heading.closest('section') as HTMLElement;
    expect(section.getAttribute('aria-labelledby')).toBe(heading.id);

    await waitFor(() => expect(part(container, 'system')).not.toBeNull());
    const system = part(container, 'system') as HTMLElement;
    const operator = part(container, 'operator') as HTMLElement;
    expect(system.textContent).toBe(BASE.trimEnd());
    expect(operator.textContent).toBe('User-agent: GPTBot\nDisallow: /');
    expect(system.compareDocumentPosition(operator) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // The two blocks are the served file.
    expect(`${system.textContent}\n\n${operator.textContent}\n`).toBe(composeCrawlerFile(BASE, OWN));

    // Told apart in words, not by colour: each block is named, and the
    // system block says it cannot be edited.
    expect(screen.getByRole('region', { name: en('crawlerPreview.robots.title') })).toBe(section);
    expect(within(section).getByText(en('crawlerPreview.system.title'))).toBeTruthy();
    expect(within(section).getByText(en('crawlerPreview.system.readOnly'))).toBeTruthy();
    expect(within(section).getByText(en('crawlerPreview.operator.title'))).toBeTruthy();
    expect(system.getAttribute('aria-labelledby')).toBeTruthy();
    expect(document.getElementById(system.getAttribute('aria-labelledby') as string)?.textContent).toContain(
      en('crawlerPreview.system.title'),
    );
    // Neither block is a field: the system part cannot be edited here.
    expect(section.querySelector('textarea, input, [contenteditable]')).toBeNull();
    // Scrollable blocks are reachable from the keyboard.
    expect(system.tabIndex).toBe(0);
    expect(operator.tabIndex).toBe(0);
    expect(previewCalls()).toEqual([previewUrl('pl')]);
    // No sentence fell back to its key.
    expect(section.textContent).not.toContain('crawlerPreview.');
  });

  it('renders in Polish from the Polish bundle', async () => {
    renderWithI18n(zone(), { seo: PL });
    expect(await screen.findByRole('heading', { name: 'Podgląd robots.txt' })).toBeTruthy();
  });

  it('follows the field as it is typed in, says it is not saved, and asks the backend nothing', async () => {
    const { container, rerender } = renderWithI18n(zone({ draftText: '' }), { seo: EN });
    await waitFor(() => expect(part(container, 'system')).not.toBeNull());
    expect(part(container, 'operator-empty')?.textContent).toBe(en('crawlerPreview.operator.empty'));
    expect(notice(container, 'unsaved')).toBeNull();
    expect(previewCalls()).toHaveLength(1);

    for (const typed of ['D', 'Disallow', 'Disallow: /tmp/\n']) {
      rerender(zone({ draftText: typed, dirty: true }));
    }
    expect(part(container, 'operator')?.textContent).toBe('Disallow: /tmp/');
    // In words, in a live region — and on the block itself.
    const status = container.querySelector('[role="status"]') as HTMLElement;
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(within(status).getByText(en('crawlerPreview.notice.unsaved'))).toBeTruthy();
    expect(screen.getByText(en('crawlerPreview.operator.unsavedBadge'))).toBeTruthy();

    await new Promise((done) => setTimeout(done, 400));
    expect(previewCalls()).toHaveLength(1);

    // Saved: the notice goes, the text stays.
    rerender(zone({ draftText: 'Disallow: /tmp/\n', dirty: false }));
    expect(notice(container, 'unsaved')).toBeNull();
    expect(part(container, 'operator')?.textContent).toBe('Disallow: /tmp/');
  });

  it('draws what a storefront sent as text, never as markup', async () => {
    const hostile = '<img src=x onerror="window.__pwned = 1">\n<script>window.__pwned = 1</script>\nUser-agent: *\n';
    answers['pl'] = answer('pl', {
      base: hostile,
      storefront: { url: 'javascript:alert(1)//<b>x</b>', source: 'setting' },
    });
    const { container } = renderWithI18n(zone({ draftText: '<b onclick="x()">bold</b>' }), { seo: EN });
    await waitFor(() => expect(part(container, 'system')).not.toBeNull());
    expect(part(container, 'system')?.textContent).toBe(hostile.trimEnd());
    expect(part(container, 'operator')?.textContent).toBe('<b onclick="x()">bold</b>');
    expect(container.querySelector('img, script, b, a')).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    // The address is shown, and is not something to click.
    expect(container.textContent).toContain('javascript:alert(1)//<b>x</b>');
    expect(container.querySelector('[href]')).toBeNull();
  });

  it('asks again when the channel changes, and never draws one channel’s answer for another', async () => {
    answers['pl'] = answer('pl', { base: 'User-agent: *\nDisallow: /only-pl/\n' });
    answers['de'] = answer('de', { base: 'User-agent: *\nDisallow: /only-de/\n' });
    const { container, rerender } = renderWithI18n(zone({ channelCode: 'pl' }), { seo: EN });
    await waitFor(() => expect(part(container, 'system')?.textContent).toContain('/only-pl/'));

    rerender(zone({ channelCode: 'de' }));
    // From the first frame of the new channel, the old one's rules are gone.
    expect(container.textContent).not.toContain('/only-pl/');
    await waitFor(() => expect(part(container, 'system')?.textContent).toContain('/only-de/'));
    expect(container.textContent).not.toContain('/only-pl/');
    expect(previewCalls()).toEqual([previewUrl('pl'), previewUrl('de')]);

    // And back: nothing remembered is shown while the channel is asked about again.
    answers['pl'] = answer('pl', { base: 'User-agent: *\nDisallow: /pl-now/\n' });
    rerender(zone({ channelCode: 'pl' }));
    expect(container.textContent).not.toContain('/only-pl/');
    expect(container.textContent).not.toContain('/only-de/');
    await waitFor(() => expect(part(container, 'system')?.textContent).toContain('/pl-now/'));
    expect(previewCalls()).toEqual([previewUrl('pl'), previewUrl('de'), previewUrl('pl')]);
  });

  it('does not ask about every channel passed on the way to the one that is chosen', async () => {
    const { container, rerender } = renderWithI18n(zone({ channelCode: 'pl' }), { seo: EN });
    rerender(zone({ channelCode: 'de' }));
    rerender(zone({ channelCode: 'pl' }));
    rerender(zone({ channelCode: 'de' }));
    await waitFor(() => expect(part(container, 'system')).not.toBeNull());
    expect(previewCalls()).toEqual([previewUrl('de')]);
  });

  it.each([
    ['storefront-unreachable', 'storefront-unreachable', 'crawlerPreview.notice.storefrontUnreachable'],
    ['address-unknown', 'address-unknown', 'crawlerPreview.notice.addressUnknown'],
  ] as const)('%s: says so, shows no system block, and still shows the operator’s text', async (state, kind, key) => {
    answers['pl'] = answer('pl', { state, base: null });
    const { container } = renderWithI18n(zone({ draftText: OWN, dirty: true }), { seo: EN });
    await waitFor(() => expect(notice(container, kind)).not.toBeNull());
    expect(notice(container, kind)?.textContent).toContain(en(key));
    // A warning says it is one in words.
    expect(notice(container, kind)?.textContent).toContain(en('crawlerPreview.notice.warningPrefix'));
    expect(part(container, 'system')).toBeNull();
    expect(container.textContent).not.toContain('Sitemap:');
    expect(part(container, 'operator')?.textContent).toBe('User-agent: GPTBot\nDisallow: /');
  });

  it('a failed request: says so, invents no rules, keeps the operator’s text', async () => {
    answers['pl'] = new Error('500');
    const { container } = renderWithI18n(zone({ draftText: OWN }), { seo: EN });
    await waitFor(() => expect(notice(container, 'preview-failed')).not.toBeNull());
    expect(part(container, 'system')).toBeNull();
    expect(part(container, 'operator')).not.toBeNull();
  });

  it('storefront-outdated: says so above the rules it serves, and marks the text as not served', async () => {
    answers['pl'] = answer('pl', { state: 'storefront-outdated' });
    const { container } = renderWithI18n(zone({ draftText: OWN }), { seo: EN });
    await waitFor(() => expect(notice(container, 'storefront-outdated')).not.toBeNull());
    const warning = notice(container, 'storefront-outdated') as HTMLElement;
    const system = part(container, 'system') as HTMLElement;
    expect(system.textContent).toBe(BASE);
    expect(warning.compareDocumentPosition(system) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(en('crawlerPreview.operator.notServedBadge'))).toBeTruthy();
  });

  it('on a NOINDEX channel says in words that the file stays open, and cautions about Disallow: /', async () => {
    answers['pl'] = answer('pl', { policy: { index: false, follow: false } });
    const { container, rerender } = renderWithI18n(zone({ draftText: '' }), { seo: EN });
    await waitFor(() => expect(notice(container, 'stays-open')).not.toBeNull());
    expect(notice(container, 'stays-open')?.textContent).toContain(en('crawlerPreview.notice.staysOpen'));
    // The file shown is still the open one: no site-wide ban was added to it.
    expect(part(container, 'system')?.textContent).toBe(BASE);
    expect(notice(container, 'site-wide-disallow')).toBeNull();

    rerender(zone({ draftText: 'User-agent: *\nDisallow: /\n', dirty: true }));
    expect(notice(container, 'site-wide-disallow')?.textContent).toContain(
      en('crawlerPreview.notice.siteWideDisallow'),
    );
  });

  it('asks again when the operator asks it to', async () => {
    answers['pl'] = answer('pl', { state: 'storefront-unreachable', base: null });
    const { container } = renderWithI18n(zone(), { seo: EN });
    await waitFor(() => expect(notice(container, 'storefront-unreachable')).not.toBeNull());
    answers['pl'] = answer('pl');
    fireEvent.click(screen.getByRole('button', { name: en('crawlerPreview.refresh') }));
    await waitFor(() => expect(part(container, 'system')).not.toBeNull());
    expect(notice(container, 'storefront-unreachable')).toBeNull();
    expect(previewCalls()).toEqual([previewUrl('pl'), previewUrl('pl')]);
  });

  it('the all-channels value: a labelled channel picker, the default channel first, and who is not affected', async () => {
    answers['de'] = answer('de', { channelsWithOwnValue: ['pl'] });
    answers['pl'] = answer('pl', {
      savedExtra: OWN,
      savedExtraSource: 'channel',
      channelsWithOwnValue: ['pl'],
      base: 'User-agent: *\nDisallow: /only-pl/\n',
    });
    const { container } = renderWithI18n(
      zone({ channelCode: null, draftText: 'Disallow: /shared/\n', dirty: true }),
      { seo: EN },
    );
    const picker = (await screen.findByLabelText(en('crawlerPreview.channel.pickerLabel'))) as HTMLSelectElement;
    // The system default leads the list and is previewed first.
    expect([...picker.options].map((option) => option.value)).toEqual(['de', 'pl']);
    expect(picker.value).toBe('de');
    await waitFor(() => expect(part(container, 'system')).not.toBeNull());
    expect(part(container, 'operator')?.textContent).toBe('Disallow: /shared/');
    expect(notice(container, 'channels-with-own-value')?.textContent).toContain(
      en('crawlerPreview.notice.channelsWithOwnValue', { channels: 'pl' }),
    );

    // The operator picks the channel that has its own value: it is shown what
    // it serves, and the all-channels text is not drawn as if it reached it.
    fireEvent.change(picker, { target: { value: 'pl' } });
    expect(container.textContent).not.toContain('/only-pl/');
    await waitFor(() => expect(part(container, 'system')?.textContent).toContain('/only-pl/'));
    expect(part(container, 'operator')?.textContent).toBe('User-agent: GPTBot\nDisallow: /');
    expect(container.textContent).not.toContain('/shared/');
    expect(notice(container, 'previewed-channel-has-own-value')).not.toBeNull();
    expect(notice(container, 'unsaved')).toBeNull();
  });

  it('renders nothing and asks nothing beside another setting', async () => {
    const { container } = renderWithI18n(zone({ settingCode: 'shop.name', ownerModule: 'settings' }), { seo: EN });
    await new Promise((done) => setTimeout(done, 350));
    expect(container.textContent).toBe('');
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('renders nothing and asks nothing without settings:read', async () => {
    const { container } = renderWithI18n(zone({}, { permissions: ['catalog:write'] }), { seo: EN });
    await new Promise((done) => setTimeout(done, 350));
    expect(container.textContent).toBe('');
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('is shown to an administrator who may read settings and change nothing (FR-045)', async () => {
    const { container } = renderWithI18n(zone({}, { permissions: ['settings:read'] }), { seo: EN });
    await waitFor(() => expect(part(container, 'system')).not.toBeNull());
  });

  it('vanishes with the module — renders nothing and asks nothing while seo is off — and is back after', async () => {
    const off = renderWithI18n(zone({}, { present: ['settings'] }), { seo: EN });
    await new Promise((done) => setTimeout(done, 350));
    expect(off.container.textContent).toBe('');
    expect(getSpy).not.toHaveBeenCalled();
    off.unmount();

    const on = renderWithI18n(zone(), { seo: EN });
    await waitFor(() => expect(part(on.container, 'system')).not.toBeNull());
    expect(previewCalls()).toEqual([previewUrl('pl')]);
  });
});

describe('the outdated-storefront notice on the Default robots row', () => {
  const defaultRobots = (props: Partial<ZoneProps> = {}, options: Parameters<typeof zone>[1] = {}): ReactElement =>
    zone({ settingCode: 'seo.default_robots', draftText: 'NOINDEX, NOFOLLOW', ...props }, options);
  const KIND = 'default-robots-storefront-outdated';

  it('says the storefront does not apply the setting, when it is outdated', async () => {
    answers['pl'] = answer('pl', { state: 'storefront-outdated' });
    const { container } = renderWithI18n(defaultRobots(), { seo: EN });
    await waitFor(() => expect(notice(container, KIND)).not.toBeNull());
    const shown = notice(container, KIND) as HTMLElement;
    expect(shown.getAttribute('role')).toBe('status');
    expect(shown.textContent).toContain(en('crawlerPreview.defaultRobots.storefrontOutdated'));
    expect(shown.textContent).toContain(en('crawlerPreview.notice.warningPrefix'));
    // The notice and nothing else: no preview of a file on this row.
    expect(part(container, 'system')).toBeNull();
    expect(previewCalls()).toEqual([previewUrl('pl')]);
  });

  it.each([
    ['is current', answer('pl')],
    ['cannot be reached', answer('pl', { state: 'storefront-unreachable', base: null })],
    ['has no address', answer('pl', { state: 'address-unknown', base: null })],
    ['could not be asked about', new Error('500')],
  ])('adds nothing to the row when the storefront %s', async (_label, response) => {
    answers['pl'] = response;
    const { container } = renderWithI18n(defaultRobots(), { seo: EN });
    await waitFor(() => expect(previewCalls()).toHaveLength(1));
    await new Promise((done) => setTimeout(done, 50));
    expect(container.textContent).toBe('');
  });

  it('edited for all channels, names the channels whose storefront is outdated', async () => {
    answers['de'] = answer('de', { state: 'storefront-outdated' });
    const { container } = renderWithI18n(defaultRobots({ channelCode: null }), { seo: EN });
    await waitFor(() => expect(notice(container, KIND)).not.toBeNull());
    expect(notice(container, KIND)?.textContent).toContain(
      en('crawlerPreview.defaultRobots.storefrontOutdatedChannels', { channels: 'de' }),
    );
    expect(previewCalls().sort()).toEqual([previewUrl('de'), previewUrl('pl')]);
  });

  it('shares one request with the preview on the other row', async () => {
    const { container } = renderWithI18n(
      <>
        {zone()}
        {defaultRobots()}
      </>,
      { seo: EN },
    );
    await waitFor(() => expect(part(container, 'system')).not.toBeNull());
    await new Promise((done) => setTimeout(done, 50));
    expect(previewCalls()).toEqual([previewUrl('pl')]);
  });

  it('asks again once the row is saved, so the preview follows the new policy', async () => {
    const { container, rerender } = renderWithI18n(defaultRobots({ dirty: true }), { seo: EN });
    await waitFor(() => expect(previewCalls()).toHaveLength(1));
    rerender(defaultRobots({ dirty: false }));
    await waitFor(() => expect(previewCalls()).toHaveLength(2));
    expect(container.textContent).toBe('');
  });

  it('vanishes with the module', async () => {
    answers['pl'] = answer('pl', { state: 'storefront-outdated' });
    const { container } = renderWithI18n(defaultRobots({}, { present: ['settings'] }), { seo: EN });
    await new Promise((done) => setTimeout(done, 350));
    expect(container.textContent).toBe('');
    expect(getSpy).not.toHaveBeenCalled();
  });
});
