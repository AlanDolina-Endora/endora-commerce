---
'@endora-commerce/mod-seo': minor
'@endora-commerce/contracts': minor
'@endora-commerce/cli': minor
---

The storefront serves an `llms.txt` per sales channel, and an operator can add to it: **Settings → SEO → Additional llms.txt content**.

**For an operator.** `/llms.txt` is a plain-text file that tells AI assistants what a shop is and
where its public pages are. The storefront now serves one for each sales channel: a part it
generates — the shop's name, links to the home page, the catalog, search, the blog and the contact
page, and the sitemap — followed by the text you save in the new setting. The setting is empty by
default, takes a value for all sales channels and a value per channel like any other, and holds at
most 64 KiB, the limit of the `robots.txt` instructions. A saved change is served within about two
minutes. The addresses in the generated part use the storefront's one public origin
(`NEXT_PUBLIC_SITE_URL`, fixed when the storefront is built), as the sitemap does: a storefront
that serves several sales channels names that origin in every channel's file, with each
channel's own shop name.

Two things to know before relying on it:

- **A sales channel whose *Default robots* is `NOINDEX` has no `llms.txt`.** The storefront answers
  `/llms.txt` with "not found" there, whatever the setting holds: a shop that asks search engines
  to stay away does not invite AI assistants in. The text is kept and is served again when the
  channel allows indexing. `robots.txt` is unaffected — it stays open on such a channel, as before.
- **Switching the `seo` module off withdraws the file**, with the *Default robots* policy and the
  custom `robots.txt` instructions. The module's description and its activation setting now say so.

Below the field there is a preview, the same as the one beside *Custom robots.txt instructions*:
one block that is the file, your lines marked inside it, under a heading that reads *llms.txt as
served now* or *llms.txt after saving*. On a `NOINDEX` channel it says *llms.txt is not served*,
with the reason, in place of the block. The messages for a storefront that cannot be reached, has
no address configured or did not confirm that it serves the file are the ones the `robots.txt`
preview shows, and the request the backend makes for it is bound the same way — one `GET
<origin>/llms.txt?part=base`, no redirect followed, three seconds, 512 KiB, `text/plain` only,
nothing of the administrator's request in it. As before, private and loopback addresses are not
refused, and this preview tells a holder of `settings:read` slightly more about a configured
address than the `robots.txt` one does: a `404` without the storefront's header is reported as
"did not confirm that it serves llms.txt" rather than as "could not be reached", so an address
where some HTTP server answers can be told from one where nothing does.

No migration, no new environment variable, no new permission.

The `seo` bundles also gain the name of the settings group and the name and description of the
*SEO enabled* setting, in English and Polish (`settingGroups.seo.name`,
`settingLabels.seo.enabled.*`).

**`robots.txt` no longer depends on *Default robots* being readable.** A *Default robots* value
that is not one of the four choices — which takes a row written around the settings API — made
`GET /api/v1/storefront/seo/crawler-files` answer `500`, so a storefront that had just started
answered that channel's `robots.txt` with `503`, although the file has never depended on that
setting. The endpoint now answers, and names what it could not read (below). Such a channel keeps
its `robots.txt`; its `llms.txt`, which does depend on the setting, answers `503` until the value
is repaired by saving *Default robots* again. A storefront that has not been updated benefits
too: its `robots.txt` is served as well.

**In `@endora-commerce/contracts`.**

- `storefrontCrawlerFilesSchema` gains an optional member, **`unreadable`**: the names of the
  members the backend could not read from what is stored — `CRAWLER_FILES_UNREADABLE_POLICY`
  (`'policy'`: `index` and `follow` are then both `false` and mean "not known") and
  `CRAWLER_FILES_UNREADABLE_LLMS_TXT` (`'llmsTxtAdditional'`: that member is then `''` and means
  "not known"). It is absent when everything was read. **Additive**: a consumer that does not read
  it is unaffected unless it reads `index`, `follow` or `llmsTxtAdditional` from this endpoint, in
  which case it should treat a named member as unknown rather than as its value. Unreadable
  `robots.txt` instructions still fail the whole answer with `500`.
- `llmsTxtAdditional` now carries the channel's saved text; it was always `''`.
- `GET /api/v1/admin/seo/crawler-files/preview?file=llms` now answers; it answered `400`. The
  `not-served` state means the storefront answered `404` **with** the `X-Endora-Crawler-Files`
  header — no file for that channel; a `404` without the header is `storefront-outdated`, with no
  `base`.

**For a custom storefront.** To be previewed, `/llms.txt?part=base` answers the generated part
alone, as `text/plain`, with `X-Endora-Crawler-Files: 1`; a channel with no file answers `404` with
the same header. Answer `503` rather than a file while `unreadable` names `policy` or
`llmsTxtAdditional`.

**In `@endora-commerce/cli`.** The storefront that `endora new storefront` writes serves
`/llms.txt` as described above.

**An existing storefront is not changed by upgrading, and until it is updated it has no
`llms.txt`**: the Settings screen shows the text, the preview says that the storefront did not
confirm that it serves the file, and nothing serves it. To take the feature, apply these changes
from the reference storefront to the storefront project, keeping any edits of your own. They
assume the project has already taken the *Default robots* and *Custom robots.txt instructions*
changes that the other entries of this release describe — `lib/seo/crawler-policy.ts`, `lib/seo/robots-txt.ts`,
`lib/seo/robots-system-rules.ts`, `lib/seo/robots-directive.ts` and `app/robots.txt/route.ts`
exist, and `app/robots.ts` is deleted. If not, apply those entries first.

- **add** `app/llms.txt/route.ts` — the route;
- **add** `lib/seo/llms-txt.ts` — what the route answers, and when it answers `404` and `503`;
- **add** `lib/seo/llms-txt-base.ts` — the generated part. It lists `SITEMAP_STATIC_ROUTES` from
  your `app/sitemap.ts`; **if you changed that list, give each of your routes a title in
  `LLMS_TXT_PAGE_TITLES`**, and name in `LLMS_TXT_CONDITIONAL_PAGES` any of them that can answer
  "not found";
- **add** `lib/seo/llms-txt-pages.ts` — whether a conditional page is served right now (today:
  the blog), remembered per channel by the cache `lib/seo/crawler-policy.ts` exports;
- **add** `lib/seo/crawler-file-response.ts` — the headers and the temporary failure the two files
  share;
- **replace** `lib/seo/robots-txt.ts` and `lib/seo/crawler-policy.ts` with the new versions. The
  first now takes its headers from `crawler-file-response.ts`; the second reads `unreadable` and exports the channel cache the page question uses;
- **edit** `lib/seo/robots-directive.ts`: `isDocumentPath` must answer `false` for `/llms.txt`, as
  the reference's version does. **Do not skip this one**: without it the storefront still serves
  the file, but while the backend is unreachable it answers `/llms.txt` with the outage page
  instead of the last version it knew;
- **edit** `app/reserved-segments.ts`: add `'llms.txt'` to `RESERVED_TOP_LEVEL_SEGMENTS`, and add
  the same entry to the deployment's `cms.reserved_slug_segments` setting if you maintain one;
- **make sure there is no `public/llms.txt`.** A file there is served instead of the route — for
  every channel, with no operator text, and on a channel set to `NOINDEX` — and neither the build
  nor the server says so. `curl -sI https://<your shop>/llms.txt | grep -i x-endora-crawler-files`
  shows the header when the route is the one answering.

`middleware.ts` and `app/layout.tsx` do not change in this release. The new files import
`composeCrawlerFile` from `@endora-commerce/contracts/seo`, so the storefront project needs
`@endora-commerce/contracts` at this release — as the custom `robots.txt` instructions, another
entry of this release, already require. Then
rebuild the storefront — the build's route list shows `ƒ /llms.txt`.

The reference storefront's tests for these files (`test/seo/llms-txt-base.test.ts`,
`test/seo/llms-txt-route.test.ts`, and the additions to `test/seo/crawler-policy.test.ts`,
`test/seo/robots-txt-route.test.ts`, `test/seo/middleware-robots.test.ts` and
`test/seo/middleware-effect.test.ts`) are optional to copy.
