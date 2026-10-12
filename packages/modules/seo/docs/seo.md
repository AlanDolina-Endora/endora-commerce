---
title: seo
description: Meta-tag resolver, cached XML sitemap and the search engine robots settings
---

# `seo`

Per-page meta-tag resolution, the public XML sitemap, and what search engines are told about
a sales channel's storefront as a whole.

## Public surface

| Verb + Path | Audience | Purpose |
| --- | --- | --- |
| `GET /api/v1/catalog/sitemap.xml` | crawlers | Cached XML sitemap; falls through to inline regenerate when stale |
| `GET /api/v1/storefront/seo/robots-policy` | storefront | The request's sales channel's default robots policy, as `{ index, follow }` |
| `GET /api/v1/storefront/seo/crawler-files` | storefront | What the request's sales channel's `robots.txt` is built from: its custom instructions, with the policy and the shop name |
| `GET /api/v1/admin/seo/crawler-files/preview` | admin (`settings:read`) | The preview of a sales channel's `robots.txt`: the rules its storefront generates, asked of that storefront, beside the saved text |
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

The same holds for what an operator writes into the file — see
[*Do not use it to leave search results*](#do-not-use-it-to-leave-search-results) below.

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

The custom `robots.txt` instructions are withdrawn with it, on the same terms: `robots.txt`
goes back to the rules the storefront generates and stays available, the setting turns read-only
and keeps its text, and the text is served again when the module is switched back on.

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

The directive is applied by the storefront's own `middleware.ts` and `app/layout.tsx`, and the
custom instructions by its `app/robots.txt/route.ts`. A storefront created from an earlier
release keeps working with an upgraded backend, but it **ignores these settings** until those
files are updated: the Settings screen shows the choice and the text, and nothing in that
storefront acts on them — its `robots.txt` stays the file it was built with. The Settings screen
says so where it can tell: when such a storefront answers the backend, the *Default robots* row
and the `robots.txt` preview both show that the channel's storefront does not apply the setting
yet. The release notes list the files to copy, and the one to delete: a storefront that keeps its old `app/robots.ts`
beside the new route goes on serving the old file, and the build does not say so.

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

## Custom `robots.txt` instructions

**Settings → SEO → Custom robots.txt instructions** is text the storefront adds to the
`robots.txt` of a sales channel — rules for a particular crawler, an extra `Disallow`, a
`Crawl-delay`. It is empty by default, and an empty text leaves the file exactly as it was.

### What the file contains, and in what order

1. **The rules the storefront generates.** They close the address families that are never
   indexed — the cart, the checkout, the account, the sign-in pages, `/api/` — and name the
   sitemap. They mirror the storefront's own routes; they are not a setting, and nothing on the
   Settings screen can edit or remove them.
2. **A blank line.**
3. **Your text**, as you wrote it.

For example, with `User-agent: GPTBot` and `Disallow: /` saved for a channel:

```text
User-Agent: *
Allow: /
Disallow: /api/
Disallow: /account
…
Disallow: /offline

Sitemap: https://shop.example.com/sitemap.xml

User-agent: GPTBot
Disallow: /
```

The text is served **as written**: every character is kept, in order — indentation, blank
lines, comments. Two things about line breaks are made uniform: every line break is served as a
line feed, however the text was saved, and the file always ends with exactly one. And one
invisible character is left out: a byte order mark at the very start of the text, which some
editors add when a file is saved — a crawler would not recognise the line it is attached to.
Nothing in the text is checked or corrected; a line a crawler does not understand is served like
any other.

**A group you write for one crawler replaces the generated rules for that crawler.** A crawler
follows the group that names it and ignores the `*` group when one does, so after
`User-agent: GPTBot` and your own rules, GPTBot no longer sees the generated `Disallow` lines.
Repeat them in that group if you still want them to apply to it. The generated lines themselves
cannot be changed, but an `Allow` of the same length as a generated `Disallow` wins over it.
Whether a page can be indexed does not depend on any of this: the pages those rules close say
`noindex` themselves.

Like any setting it takes a value for all sales channels and a value per channel, and a
channel's own value wins — including an empty one, which gives that channel no custom
instructions whatever the all-channels text says. One channel's text is never served in another
channel's file. **Reset** removes the channel's own text, so the channel inherits the
all-channels text again; resetting that as well leaves the generated rules alone. Changing the
text takes `settings:write` and is recorded in the audit log.

### The preview

Below the field, the Settings screen shows the `robots.txt` the sales channel's storefront
serves, in two blocks in the order the file carries them:

- **Generated by the storefront** — the rules that storefront generates, with its own
  `Sitemap:` line. Read-only: they are the storefront's, and the Admin UI asks the storefront
  for them each time rather than keeping a copy that could go stale.
- **Your instructions** — the text in the field, as it will be served. It follows what you
  type, before you save; while it differs from what is saved the preview says **Not saved yet —
  the storefront still serves the saved version**. Previewing changes nothing the storefront
  serves.

The preview is of the sales channel chosen at the top of the Settings screen. Under **All
channels** it shows the result for one channel you pick in the preview, and names the channels
that have a value of their own — the text for all channels does not reach those, and picking
one of them shows what that channel serves instead.

On a sales channel whose *Default robots* is `NOINDEX`, the preview says that `robots.txt`
stays open on purpose, and warns when your text contains `Disallow: /` for every crawler — see
[why `robots.txt` stays open](#why-robotstxt-stays-open).

An administrator who may see settings but not change them sees the preview too.

#### When the preview cannot show the generated rules

The preview never shows rules it did not just obtain. In each of these cases your own block is
still shown and saving works as usual:

| The preview says | What it means | What to do |
| --- | --- | --- |
| *The storefront could not be reached* | The storefront did not answer within three seconds, refused the connection, answered with an error or a redirect, or answered something that is not a plain-text `robots.txt` | Check that the storefront is running and that the channel's **Storefront URL** is its real address — the address the storefront itself answers at, not one that redirects to it. **Check again** asks once more. The server log names the reason |
| *This sales channel has no storefront address configured* | Neither the channel's **Storefront URL** setting nor `STOREFRONT_BASE_URL` is set, so there is no address to ask | Set **Settings → Sales Channels → Storefront URL** for the channel |
| *This storefront does not serve custom instructions yet* | The storefront answered, but it runs a version from before this feature: it serves only its generated rules, shown below the message, and ignores your text and *Default robots* | Update the storefront — see [a storefront scaffolded before this feature](#a-storefront-scaffolded-before-this-feature). The same message appears on the *Default robots* row |
| *This address is shared by every sales channel* | The address comes from `STOREFRONT_BASE_URL`, one address for all channels, so the preview is of that shared storefront | Nothing, on an instance with one storefront. With a storefront per channel, set each channel's **Storefront URL** |

#### What the backend asks the storefront

To show the generated rules, the backend makes one request to the channel's storefront:
`GET <origin of the channel's storefront address>/robots.txt?part=system`, with the channel's
code in `X-Sales-Channel`. It is made only for a signed-in administrator who may read settings,
only to the configured address — nothing the administrator's browser sends is part of it — and
only to the address's origin: a path or query in the configured address is not used, because a
`robots.txt` lives at the root of a site. It follows no redirect, waits at most three seconds,
reads at most 512 KiB, accepts only `text/plain`, and sends no cookie and no credentials. Nothing
it receives is stored.

The storefront must therefore be reachable **from the backend** at the configured address. A
storefront that is public but not routable from the backend's network shows as unreachable in
the preview and is otherwise unaffected.

### The size limit

A text may be at most **64 KiB** (65 536 bytes of UTF-8 — a letter outside ASCII counts as two
bytes or more). A larger text is refused when it is saved, with a message that names the limit,
and the text saved before stays in force. Search engines read only the first 500 KiB of a
`robots.txt`; the limit keeps the whole file far inside that.

### Do not use it to leave search results

`robots.txt` controls what a crawler may **fetch**. It does not control what a search engine
**lists**. A page that may not be fetched can still appear in results — by its address alone,
without a description — when other sites link to it.

To take a storefront out of search, set *Default robots* to `NOINDEX`. And do not add
`Disallow: /` on top of that: a crawler that may not fetch a page never reads the `noindex` on
it, so the rule that looks like the stronger one switches the working one off. Nothing written
here can make a page that declares `noindex` indexable; it can only stop crawlers from seeing
that it does.

### Behind a proxy or a CDN

The file is different for each sales channel, and the storefront learns the channel from the
`X-Sales-Channel` request header. It sends the file with `Cache-Control: public, max-age=60` and
`Vary: X-Sales-Channel`. Two things follow for what stands in front of a storefront that serves
more than one channel:

- the reverse proxy must set `X-Sales-Channel` itself, per host, and must not pass through a
  value a visitor sent — otherwise a visitor chooses whose file they are shown;
- a shared cache that ignores `Vary` on such a header must include the header in its cache key,
  or not cache `/robots.txt` at all — otherwise one channel's file is served for another.

A storefront that serves a single channel needs neither; its proxy can remove the header.

### How long a change to the file takes

The storefront asks the backend for a channel's text at most once a minute and lets a crawler
keep the file for another minute, so a saved change is served within about two minutes. Search
engines fetch `robots.txt` on their own schedule, usually about once a day.

### When the text cannot be read

A storefront that has read a channel's text once goes on serving that version for as long as
the backend cannot be reached. A storefront that has not — one started while the backend was
down — answers `robots.txt` with `503` and `Retry-After: 120` until its first successful read,
instead of serving the generated rules alone.

That is deliberate, and it differs from what pages do. A `robots.txt` answered with `200` is a
complete statement of what may be fetched, so a file that silently left out your `Disallow`
lines would be permission you did not give. A search engine reads a `503` as "ask again later"
and goes on using the copy it already has. No customer reads this file, so nothing a customer
sees depends on it.

The first read of a channel after a start is waited for, up to two seconds — and a request
for `robots.txt` makes two such reads one after the other, the channel's default robots policy
and then its text, so against a backend that accepts connections and does not answer the first
request can take four to five seconds. The storefront then does not ask again for five seconds and
answers at once. While the `seo` module is switched off, and against a backend that does not
have this feature, the storefront serves the generated rules alone with `200` — those are
answers, not failures.

### Reading the text from a custom storefront

`GET /api/v1/storefront/seo/crawler-files` is public and resolves the sales channel as
`robots-policy` does:

```json
{
  "data": {
    "index": true,
    "follow": true,
    "robotsTxtCustom": "User-agent: GPTBot\nDisallow: /\n",
    "llmsTxtAdditional": "",
    "shop": { "name": "Endora Demo" }
  }
}
```

`robotsTxtCustom` is the text resolved for the channel, exactly as stored — the backend changes
no character of it, line breaks included. `index` and `follow` repeat the channel's policy,
`shop.name` is its configured shop name or an empty string, and `llmsTxtAdditional` is always
empty in this release. The schema is `storefrontCrawlerFilesResponseSchema` in
`@endora-commerce/contracts`, which also exports `composeCrawlerFile(base, extra)` — the
function the reference storefront joins its generated rules and the text with — and
`CRAWLER_TEXT_MAX_BYTES`.

The answer is sent with `Cache-Control: no-store`. Treat the statuses as for `robots-policy`:
`503` `MODULE_DISABLED` and `404` mean there is no custom text; anything else, a `500` included,
means it could not be read, and a `robots.txt` should then be the last version you served, or a
`503` — not a file without the text. The endpoint answers `500` rather than an empty text when a
stored value cannot be served, which takes a row written around the settings API.

The reference storefront's `robots.txt` also answers `GET /robots.txt?part=system` with its
generated rules alone — sent with `Cache-Control: no-store`, because it is the file without the
operator's text at an address a cache could mistake for the real one — and marks every answer
with an `X-Endora-Crawler-Files: 1` header.

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
