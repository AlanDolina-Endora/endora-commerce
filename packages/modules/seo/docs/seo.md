---
title: seo
description: Meta-tag resolver, cached XML sitemap and the default search engine robots setting
---

# `seo`

Per-page meta-tag resolution, the public XML sitemap, and what search engines are told about
a sales channel's storefront as a whole.

## Public surface

| Verb + Path | Audience | Purpose |
| --- | --- | --- |
| `GET /api/v1/catalog/sitemap.xml` | crawlers | Cached XML sitemap; falls through to inline regenerate when stale |
| `GET /api/v1/storefront/seo/robots-policy` | storefront | The request's sales channel's default robots policy, as `{ index, follow }` |
| `GET /api/v1/admin/seo/sitemap` | admin (`catalog:write`) | One row per sales channel: storefront address, last-generated timestamp, size, URL count |
| `POST /api/v1/admin/seo/sitemap/:channelCode/regenerate` | admin (`catalog:write`) | Force a fresh build for that channel |
| `GET /api/v1/admin/seo/sitemap/:channelCode/status` | admin (`catalog:write`) | Last-generated timestamp + size + URL count for that channel |
| `GET /api/v1/admin/seo/sitemap/:channelCode/xml` | admin (`catalog:write`) | That channel's cached XML, inline or as a download (`?download=1`) |
| `GET /api/v1/admin/seo/meta/:entityType/:entityId` | admin (`catalog:write`) | Resolved meta + override row for a (entity, locale) |
| `PUT /api/v1/admin/seo/meta/:entityType/:entityId` | admin (`catalog:write`) | Upsert override (per locale) |
| `DELETE /api/v1/admin/seo/meta/:entityType/:entityId` | admin (`catalog:write`) | Drop the override (resolver returns to rule output) |

## Search engine robots

**Settings → SEO → Default robots** decides what search engines are told about every page of a
sales channel's storefront. It is the switch for taking a whole storefront out of search — a
staging copy, a demo, a shop that has not opened yet — without touching any page.

| Choice | Search engines are asked |
| --- | --- |
| `INDEX, FOLLOW` (default) | nothing: every page says what it said before |
| `NOINDEX, FOLLOW` | not to list the storefront's pages, but to follow their links |
| `INDEX, NOFOLLOW` | to list the pages, but not to follow their links |
| `NOINDEX, NOFOLLOW` | not to list the pages and not to follow their links |

The four choices are the directives themselves and read the same in every language. Like any
setting it takes a value for all sales channels and a value per channel; a channel's own value
wins, and resetting it makes the channel inherit again. Changing it takes `settings:write`, and
the change is recorded in the audit log with who made it, when, and the value written. The
command palette (⌘K / CTRL+K) opens the Settings screen under *Search engine robots*.

### What the storefront does with it

For a channel whose default restricts something, the storefront adds the directive to the
responses it serves for that channel, in two forms:

- an `X-Robots-Tag` response header — on every page, including not-found (`404`) pages and the
  offline page, on `/sitemap.xml`, on optimised images (`/_next/image`) and on the files under
  `public/`;
- one extra `<meta name="robots">` element in the `<head>` of the pages the shop renders for a
  request.

Three kinds of response are outside it, and none of them is something a search engine indexes:

- the build's own script and style files under `/_next/static` carry neither;
- a redirect declared in the storefront's `next.config.js` (such as the old `/cms/…` addresses)
  carries neither — it is answered before the storefront's middleware runs;
- not-found (`404`) pages and the statically built `/offline` page carry the header but not the
  extra element. Both already declare `noindex, nofollow` for themselves.

**It only adds restrictions.** A page that declares `noindex` for itself — the cart, the
checkout, the account pages — keeps its own tag whatever is chosen here, and such a page then
carries two robots tags. A search engine that reads several robots directives for one address
applies the most restrictive of them, so the default can never make a private page indexable.
With `INDEX, FOLLOW` nothing is added at all, and the storefront's responses are what they were
before the setting existed.

### Why `robots.txt` stays open

*Default robots* does not change `robots.txt`, and a `NOINDEX` channel must not close it with
`Disallow: /`. A crawler has to fetch a page to read that it must not be indexed; a page it is
forbidden to fetch can still be listed, by its address alone, when other sites link to it.

### How long a change takes

The storefront asks the backend for a channel's policy at most once a minute, so a saved change
is in force on the storefront within a minute or two. Search engines apply it when they next
visit each page, which takes days or weeks; a page already in the index leaves it only after it
has been crawled again.

Reading the policy does not slow the shop down when the backend is slow. A storefront that
already knows a channel's policy gives a refresh a fraction of a second and otherwise goes on
serving what it knows, letting the refresh finish in the background.

### When the module is switched off

Switching `seo` off on the platform modules screen withdraws the default: the storefront stops
sending the header and the extra tag within a minute or two, so **a channel set to `NOINDEX`
becomes indexable again**. The setting turns read-only and keeps its stored value, the command
palette entries disappear, and `GET /api/v1/storefront/seo/robots-policy` answers `503`
`MODULE_DISABLED`. Switching the module back on applies the stored value again.

### Two limits

- **Files the backend serves are not covered.** Product images and other uploaded media are
  served by the backend, from its own address, and carry no `X-Robots-Tag`. A `NOINDEX` channel's
  pages leave search; its image files can still be found by an image search that reaches them
  directly.
- **A freshly started storefront knows nothing yet.** The storefront keeps the last policy it
  read in the memory of its own process and goes on applying it while the backend cannot be
  reached. A storefront that starts while the backend is unreachable has nothing to apply, and
  serves that channel's pages without the default directive until its first successful read.
  It is also the one moment a response waits for the policy: the first read of a channel after
  a start is waited for, up to two seconds, once. No page is ever answered with an error because
  the policy could not be read.

### A storefront scaffolded before this feature

The directive is applied by the storefront's own `middleware.ts` and `app/layout.tsx`. A
storefront created from an earlier release keeps working with an upgraded backend, but it
**ignores the setting** until those files are updated: the Settings screen shows the choice and
nothing in that storefront acts on it. The release notes list the files to copy; they need no
package upgrade to run.

### For a custom storefront

`GET /api/v1/storefront/seo/robots-policy` is public and resolves the sales channel from the
request's `X-Sales-Channel` header, or the system-default channel when there is none:

```json
{ "data": { "index": false, "follow": false } }
```

The answer is sent with `Cache-Control: no-store`; the consumer is expected to cache it. The
schema is `storefrontRobotsPolicyResponseSchema` in `@endora-commerce/contracts`; a consumer
should ignore members it does not know, so that a later release can add one.

Treat the statuses differently. `503` with `error.code: "MODULE_DISABLED"` and `404` mean there
is no policy — apply none. Any other failure, including a `500`, means the policy could not be
read: keep the last one you read. The endpoint answers `500` rather than "no restriction" when
the stored value is not one of the four choices, which takes a row written around the settings
API.

## Meta-tag resolution

`MetaTagResolverService.resolve({ entityType, entityId, locale })` returns
`{ title, description, openGraph, source, locale }`. The resolution order is:

1. Look up the per-(entity, locale) override row.
2. If a field is set on the override, use it verbatim.
3. Otherwise fall back to the rule derived from the entity (Product name +
   description, Category name + auto-summary).
4. Per-field locale fallback: when a Product has no `pl-PL` text, the rule
   uses `en-US`, then any available locale.

Title and description are truncated at 60 / 160 characters with an ellipsis.
The truncation lives in one helper so changes to the SEO budget happen in
one place.

## Sitemap

`SitemapGeneratorService.regenerate()` walks active, public-visibility,
non-archived products and non-deleted categories, stamps absolute URLs
against `STOREFRONT_BASE_URL`, and writes the XML payload to a singleton
`sitemap_cache` row.

The public route (`GET /catalog/sitemap.xml`) returns the cached payload;
when the row is older than `staleAfterMs` (default 6 h) it regenerates
inline. A `Cache-Control: public, max-age=3600` header is set on the
response so well-behaved CDNs hold the payload for an hour.

## Anonymous-only filtering

The sitemap excludes:
- products with `status != 'active'`
- products with `visibility != 'public'`
- archived (`archivedAt`) and soft-deleted (`deletedAt`) rows
- soft-deleted categories

The contract is simple: only what an anonymous Customer can see is
ever exposed to crawlers.

## Entities

`SeoMetaOverride` (entityType, entityId, locale, title?, description?,
ogTitle?, ogDescription?, ogImageUrl?), `SitemapCache` (singleton key,
payload, urlCount, byteSize, generatedAt).

## Extension points

- **CMS pages** — when a CMS module ships, hook its slug + body into both
  `MetaTagResolverService.loadRuleSource()` and
  `SitemapGeneratorService.regenerate()`.
- **Sitemap index** — for catalogues > 50 000 URLs, split into per-section
  sitemaps and emit a `<sitemapindex>` from this module's route.
- **Scheduled regenerate** — wire a BullMQ repeatable into the production
  composition root that calls `regenerate()` nightly.
