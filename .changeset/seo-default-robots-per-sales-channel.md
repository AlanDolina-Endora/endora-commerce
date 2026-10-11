---
'@endora-commerce/mod-seo': minor
'@endora-commerce/contracts': minor
'@endora-commerce/cli': minor
---

A sales channel's storefront can be taken out of search engines with one setting: **Settings → SEO → Default robots**.

The setting offers `INDEX, FOLLOW` (the default), `NOINDEX, FOLLOW`, `INDEX, NOFOLLOW` and
`NOINDEX, NOFOLLOW`, for all sales channels or per channel. For a channel whose value restricts
something, the storefront adds the directive to every response it serves for that channel: an
`X-Robots-Tag` header on pages, on `/sitemap.xml`, on `/_next/image` and on the files under
`public/`, and one extra `<meta name="robots">` in every page's `<head>`. It only adds
restrictions — a page that declares `noindex` for itself keeps its own tag — and `robots.txt` is
not changed. With the default nothing is added. A saved change is in force on the storefront
within a minute or two.

**Switching the `seo` module off withdraws the directive**, so a channel set to `NOINDEX` becomes
indexable again until the module is switched back on. The stored value is kept.

What is new, by package:

- `@endora-commerce/mod-seo` declares the setting `seo.default_robots`, serves the public,
  channel-resolved `GET /api/v1/storefront/seo/robots-policy` (`{ "data": { "index", "follow" } }`,
  `Cache-Control: no-store`, `503` `MODULE_DISABLED` while the module is off), and declares two
  command-palette actions: `open-seo` (`catalog:write`) and `open-search-engine-robots`, which
  opens the Settings screen for holders of `settings:read`.
- `@endora-commerce/contracts` exports `storefrontRobotsPolicySchema`,
  `storefrontRobotsPolicyResponseSchema` and the types `StorefrontRobotsPolicy` and
  `StorefrontRobotsPolicyResponse`.
- `@endora-commerce/cli`: the storefront that `endora new storefront` writes reads the policy
  and applies it. Its middleware now runs for every path except `/_next/static` (it used to skip
  public files, `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest` and `/_next/image`); for
  those paths it only adds the header. Measured on the reference storefront, that costs a public
  file about one millisecond.

**An existing storefront is not changed by upgrading, and until it is updated it ignores the
setting.** `endora new storefront` copies the reference once and the project owns it afterwards.
With an upgraded backend and an older storefront the Settings screen shows *Default robots* and
nothing acts on it — a channel set to `NOINDEX` stays indexable. To take the feature, copy these
four files from the reference storefront into the storefront project, keeping any edits of your
own:

- `lib/seo/crawler-policy.ts` — new: reads the policy, caches it for a minute per channel, and
  keeps the last value it read while the backend cannot be reached;
- `lib/seo/robots-directive.ts` — new: what the policy puts on a response;
- `middleware.ts` — changed: the policy read, the response header, the request header for the
  layout, and the widened `config.matcher`;
- `app/layout.tsx` — changed: renders the extra `<meta name="robots">` in both documents it
  returns. Do not move the directive into the layout's `metadata` export: a page's own `robots`
  replaces a layout's there, so it would be dropped on every page that declares one.

Then rebuild the storefront. `curl -sI https://<your shop>/ | grep -i x-robots-tag` shows the
header once a restricting value is saved.

Two limits are stated in the module's documentation: files the backend serves (product images
and other uploaded media) carry no `X-Robots-Tag`, and a storefront that starts while its backend
is unreachable serves pages without the default directive until its first successful read.
