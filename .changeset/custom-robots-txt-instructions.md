---
'@endora-commerce/mod-seo': minor
'@endora-commerce/mod-settings': minor
'@endora-commerce/contracts': minor
'@endora-commerce/cli': minor
---

An operator can add rules to a sales channel's `robots.txt`: **Settings → SEO → Custom robots.txt instructions**.

The text is appended to the rules the storefront generates itself — after them, separated by one
blank line — for all sales channels or per channel. The generated rules (the closed address
families and the `Sitemap:` line) are unchanged and cannot be edited or removed from the Settings
screen. With no text, `robots.txt` is byte for byte what it was. Resetting the setting removes the
text. A saved change is served within about two minutes.

The text is served as written: every character is kept, in order. Two things about line breaks
are made uniform — every line break is served as a line feed (`LF`), whether it was saved as `LF`,
`CRLF` or `CR`, and the file ends with exactly one — and one byte order mark (`U+FEFF`) at the
very start of the text is not served, because a crawler does not recognise the line it is
attached to. Nothing in the text is validated.

The generated lines cannot be changed, but their effect on one crawler can: a group written for a
crawler by name replaces the `*` group for that crawler. Repeat the generated rules in such a
group if they should still apply to it. Indexing does not depend on it — the pages those rules
close declare `noindex` themselves.

**`robots.txt` does not take pages out of search results.** It controls what a crawler may fetch.
To keep a storefront out of search use *Default robots* = `NOINDEX`, and do not add `Disallow: /`
on top of it: a crawler that may not fetch a page never reads its `noindex`. The setting's
description says so, in English and in Polish.

A text may be at most **64 KiB** (65 536 bytes of UTF-8). A larger one is refused when saved, with
`400` `SEO_CRAWLER_TEXT_TOO_LARGE` and a message naming the limit, and the stored text is kept.

**`/robots.txt` on the reference storefront is no longer a build-time file.** It is rendered per
request, for the request's sales channel:

- `200` with the generated rules and the channel's text; `Content-Type: text/plain; charset=utf-8`,
  `Cache-Control: public, max-age=60`, `Vary: X-Sales-Channel`, `X-Endora-Crawler-Files: 1`. Before,
  the file was prerendered and sent with `Cache-Control: public, max-age=0, must-revalidate` and
  `Content-Type: text/plain`;
- the generated rules alone while the `seo` module is switched off, and against a backend that
  does not have this feature;
- **`503` with `Retry-After: 120`** when the channel's text cannot be read and the storefront
  process has never read it — rather than a file that silently omits the operator's rules. A
  process that has read the text once goes on serving that version for as long as the backend
  cannot be reached. A storefront started while its backend is down therefore answers
  `robots.txt` with `503` until the backend is back; pages are unaffected;
- `GET /robots.txt?part=system` answers the generated rules alone, without the route asking the
  backend, and is sent with `Cache-Control: no-store`.

**If a reverse proxy or a CDN stands in front of a storefront that serves more than one sales
channel**, check two things, because the file now differs per channel and the channel is named by
the `X-Sales-Channel` request header: the proxy must set that header itself, per host, and not
pass through a value a visitor sent; and a shared cache that ignores `Vary` on such a header must
include it in its cache key or not cache `/robots.txt`. In nginx that is one line in the
storefront's `location` block — `proxy_set_header X-Sales-Channel "<this host's channel code>";`
for a multi-channel deployment, or `proxy_set_header X-Sales-Channel "";` to drop the header on a
single-channel one, which is otherwise unaffected. The `nginx.example.conf` an instance was
scaffolded with does not carry the line; this repository's `deploy/nginx.example.conf` now shows
both, commented.

The origin in the `Sitemap:` line is still `NEXT_PUBLIC_SITE_URL` as inlined at build time.

What is new, by package:

- `@endora-commerce/mod-seo` declares the multi-line setting `seo.robots_txt_custom` (default
  empty) with its name and description in `en` and `pl`; serves the public, channel-resolved
  `GET /api/v1/storefront/seo/crawler-files`
  (`{ "data": { "index", "follow", "robotsTxtCustom", "llmsTxtAdditional", "shop": { "name" } } }`,
  `Cache-Control: no-store`, `503` `MODULE_DISABLED` while the module is off, and `500` — never
  an empty text — when a stored value cannot be served); and declares the error code
  `SEO_CRAWLER_TEXT_TOO_LARGE`. `llmsTxtAdditional` is always `""` in this release.
- `@endora-commerce/contracts` exports `storefrontCrawlerFilesSchema`,
  `storefrontCrawlerFilesResponseSchema`, the types `StorefrontCrawlerFiles` and
  `StorefrontCrawlerFilesResponse`, `composeCrawlerFile(base, extra)` (the join described above),
  `CRAWLER_TEXT_MAX_BYTES` and `ERROR_CODES.SEO_CRAWLER_TEXT_TOO_LARGE`. The schemas drop members
  they do not know.
- `@endora-commerce/contracts` and `@endora-commerce/mod-settings`: `SettingWriteValidationInput`
  gains **`proposedValue`** — the value a settings write proposes, beside the per-channel
  projection it already carried. An all-channels write reaches no channel that has a value of its
  own, so on an instance where every channel has one the proposed value was in no channel's
  projection, and a validator whose rule is about the value itself could not see it. A module that
  contributes a `SettingWriteValidator` needs no change; code that *constructs* a
  `SettingWriteValidationInput` (a test calling a validator directly) must now supply the member.
- `@endora-commerce/cli`: the storefront that `endora new storefront` writes serves `robots.txt`
  as described above.

**An existing storefront is not changed by upgrading, and until it is updated it ignores the
setting**: its `robots.txt` stays the file it was built with, and the Settings screen shows a text
nothing serves. To take the feature, apply these changes from the reference storefront to the
storefront project, keeping any edits of your own:

- **delete** `app/robots.ts`. It must go, and nothing will tell you if it has not: with both it
  and `app/robots.txt/route.ts` present, Next builds without a warning, goes on serving the old
  build-time file and never reaches the new route. The build's route list shows which one won —
  `○ /robots.txt` is the old file, `ƒ /robots.txt` is the new route;
- **add** `app/robots.txt/route.ts` — the route;
- **add** `lib/seo/robots-txt.ts` — what the route answers, and when it answers `503`;
- **add** `lib/seo/robots-system-rules.ts` — the generated rules, moved out of `app/robots.ts`
  unchanged. **If you edited the `disallow` list in your `app/robots.ts`, carry your edits into
  `ROBOTS_SYSTEM_RULES` here**;
- **replace** `lib/seo/crawler-policy.ts` with the new version. It now reads the crawler files as
  well as the default robots policy, and gives up a backend read that a frozen process left
  hanging instead of waiting on it for ever. If the project does not have this file yet, it has
  not taken the *Default robots* feature either — add the file, and see that release's notes for
  `middleware.ts` and `app/layout.tsx`;
- **edit** `app/reserved-segments.ts`: add `'robots.txt'` to `RESERVED_TOP_LEVEL_SEGMENTS`, and add
  the same entry to the deployment's `cms.reserved_slug_segments` setting if you maintain one;
- in `test/seo/route-declarations.test.ts`, if you copied it, replace the import of
  `'../../app/robots'` with `ROBOTS_SYSTEM_RULES` and `robotsSitemapUrl` from
  `'../../lib/seo/robots-system-rules'`, as the reference's version does.

`lib/seo/robots-txt.ts` imports `composeCrawlerFile` from `@endora-commerce/contracts/seo`, so
**the storefront project needs `@endora-commerce/contracts` at this release or later** — unlike
the *Default robots* files, which needed no upgrade. `middleware.ts` and `app/layout.tsx` do not
change in this release. Then rebuild the storefront;
`curl -sI https://<your shop>/robots.txt | grep -i x-endora-crawler-files` shows the header once
the new route is serving.

The reference storefront's tests for these files (`test/seo/robots-system-rules.test.ts` with its
fixture `test/seo/__fixtures__/robots-before.txt`, `test/seo/robots-txt-route.test.ts` and the
additions to `test/seo/crawler-policy.test.ts`) are optional to copy. The fixture is the
reference's own generated rules with `http://localhost:3000` as the origin; a project that edited
its list edits the fixture to match.
