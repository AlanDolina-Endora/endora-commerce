import { defineModuleManifest } from '@endora-commerce/contracts';

/**
 * SEO module — manifest backfill (Module Lifecycle, feature 018).
 *
 * Predates the lifecycle system; this manifest is the static record
 * required so the module participates in the registry. No install /
 * uninstall hook today — the module's schema is owned by earlier
 * platform-wide migrations.
 */
export const manifest = defineModuleManifest({
  id: 'seo',
  name: 'SEO',
  // The platform modules screen renders this sentence verbatim beside the
  // switch, so what switching the module off withdraws is said here
  // (`specs/144-seo-search-engine-robots/`, FR-033).
  description:
    'SEO metadata, the generated sitemap and the search engine robots settings. Switching it off withdraws the default robots directive from every storefront response, so a sales channel set to noindex becomes indexable again.',
  version: '1.0.0',
  // `auth` owns the `requireAdmin` port the admin routes are gated by. Feature
  // 072 made it a container resolution rather than a constructor argument.
  //
  // `catalog` and `cms` arrived with feature 075 Phase C. Both edges were
  // always real — the meta-tag resolver and the sitemap read their tables
  // directly — and both are **binding**: a sitemap that silently drops every
  // product or page URL still parses as a sitemap, and a crawler cannot tell
  // it from a shop that genuinely sells nothing. Refusing is the honest
  // answer. Meta tags likewise describe a page a customer can reach, which a
  // switched-off `catalog` or `cms` no longer serves.
  dependencies: ['auth', 'catalog', 'cms'],
  settings: {
    moduleCode: 'seo',
    groups: [{ code: 'seo', name: 'SEO' }],
    settings: [
      {
        // Feature 073 — the operator's activation control. Platform-wide.
        code: 'seo.enabled',
        name: 'SEO enabled',
        description:
          'Switches the meta-tag override screens, their API, the generated sitemap and the search engine robots settings on or off. While it is off the storefront sends no default robots directive, so a sales channel set to noindex becomes indexable again. Nothing is dropped: overrides and settings stay in the database and apply again when you switch it back on.',
        groupCode: 'seo',
        valueType: 'boolean',
        defaultValue: true,
      },
      {
        // `specs/144-seo-search-engine-robots/` — the directive every
        // storefront response of a sales channel carries, on top of what each
        // page declares for itself. Takes an all-channels value and per-channel
        // values like any other setting.
        //
        // The four choices are the directive pairs themselves and they are the
        // stored values. `backend/services/robots-policy.ts` is the one place
        // that reads them; nothing outside this module sees the spelling.
        code: 'seo.default_robots',
        name: 'Default robots',
        description:
          'What search engines are told about every page of the storefront, per sales channel. It only adds restrictions: a page that already says noindex stays noindex whatever is chosen here. NOINDEX asks search engines not to list the storefront, NOFOLLOW asks them not to follow its links. robots.txt is not changed, because a crawler has to fetch a page to read that it must not be indexed. A change is in force on the storefront within a few minutes; search engines apply it when they next visit a page, which can take days or weeks.',
        groupCode: 'seo',
        valueType: 'string',
        enumOptions: ['INDEX, FOLLOW', 'NOINDEX, FOLLOW', 'INDEX, NOFOLLOW', 'NOINDEX, NOFOLLOW'],
        defaultValue: 'INDEX, FOLLOW',
      },
      {
        // `specs/144-seo-search-engine-robots/` — text the storefront appends
        // to the `robots.txt` it generates for a sales channel. Empty by
        // default, which is what keeps an untouched instance's file what it
        // was. Takes an all-channels value and per-channel values like any
        // other setting; an empty per-channel value is a value, and gives that
        // channel no custom instructions whatever the all-channels text says.
        //
        // The size limit is not expressible here: it is in bytes, and it is
        // this module's rule, so `backend/services/crawler-text-validator.ts`
        // contributes it to the settings store's write validation.
        code: 'seo.robots_txt_custom',
        name: 'Custom robots.txt instructions',
        description:
          'Rules added to the storefront\'s robots.txt, per sales channel. The text is added after the rules the storefront generates itself, exactly as written here; those generated rules cannot be edited or removed, but a group written for one crawler (User-agent: its name) replaces them for that crawler — repeat them in that group if you still want them to apply to it. Leave it empty, or reset it, to serve the generated rules alone. robots.txt controls what crawlers may fetch, not what search engines list: forbidding crawling does not remove pages from search results, and a page that may not be fetched can still be listed from links elsewhere — to keep the storefront out of search results use "Default robots", and do not add "Disallow: /" on top of it, because a crawler that may not fetch a page never reads that it must not be indexed. At most 64 KiB of text. A change is in force on the storefront within a few minutes.',
        groupCode: 'seo',
        valueType: 'string',
        multiline: true,
        defaultValue: '',
      },
    ],
  },
  // Feature 091 (Phase 4, batch 8) — this module ships a bundle now: its
  // sidebar entry's `labelKey` is module-relative (R8) and resolves in this
  // module's own namespace. Its screen's copy stays in `_i18n`'s `core`
  // scope, which is batch 4's shape and not a new one.
  // The one refusal this module raises: a crawler text over the size limit.
  // Its sentence is `errors.SEO_CRAWLER_TEXT_TOO_LARGE` in `i18n/{en,pl}.json`
  // and names the limit from the raise's own `details`.
  errorCodes: [{ code: 'SEO_CRAWLER_TEXT_TOO_LARGE' }],
  i18n: { bundlesDir: 'i18n' },
  docs: { dir: 'docs' },
  activation: { settingCode: 'seo.enabled', default: true },
  // Principle XVI. `seo` owned a screen and declared no action until
  // `specs/144-seo-search-engine-robots/` (FR-009).
  actions: [
    {
      id: 'open-seo',
      labelKey: 'actions.openSeo.label',
      descriptionKey: 'actions.openSeo.description',
      icon: 'Search',
      targetRoute: '/seo',
      // The code the screen's own routes are gated by.
      requiredPermission: 'catalog:write',
      keywords: ['seo', 'sitemap', 'meta', 'search engines', 'wyszukiwarki'],
      weight: 120,
    },
    {
      // The robots settings live on the generic Settings screen, which has no
      // per-group address, so this opens `/settings`.
      //
      // `settings:read`, not `settings:write`: it is the code that screen is
      // gated by, and `check:action-route-permissions` holds a declared code
      // to the one enforced on the action's own target. A reader lands on the
      // settings read-only; changing them still takes `settings:write`.
      id: 'open-search-engine-robots',
      labelKey: 'actions.openSearchEngineRobots.label',
      descriptionKey: 'actions.openSearchEngineRobots.description',
      icon: 'Search',
      targetRoute: '/settings',
      requiredPermission: 'settings:read',
      keywords: ['robots', 'noindex', 'nofollow', 'llms', 'indexing', 'indeksowanie'],
      weight: 110,
    },
  ],
});
