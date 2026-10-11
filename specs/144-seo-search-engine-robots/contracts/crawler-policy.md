# Contract: crawler policy — what the backend tells the storefront, and what the storefront serves

**Feature**: `specs/144-seo-search-engine-robots/` · **Owner of §1–§2**: `seo` · **Owner of
§3–§6**: the storefront.

The Zod schemas named here are written in `packages/contracts/src/seo.ts` **before** either side
is implemented (Principle II); this document is their prose. Names are final unless a test in the
owning slice refutes one.

## 1. `GET /api/v1/storefront/seo/robots-policy`

Public, unauthenticated, channel-resolved (the request's `X-Sales-Channel`, else the system
default channel — never "no channel").

```jsonc
// 200
{ "data": { "index": true, "follow": true } }
```

| Stored `seo.default_robots` | `index` | `follow` |
| --- | --- | --- |
| `INDEX, FOLLOW` (default) | `true` | `true` |
| `NOINDEX, FOLLOW` | `false` | `true` |
| `INDEX, NOFOLLOW` | `true` | `false` |
| `NOINDEX, NOFOLLOW` | `false` | `false` |

- Schema: `storefrontRobotsPolicySchema` / `storefrontRobotsPolicyResponseSchema`.
- The stored token never appears on the wire; a consumer branches on two booleans.
- `Cache-Control: no-store`. The storefront is the cache (§3); an intermediary holding this
  answer would add to FR-010's bound invisibly.
- `503` with `error.code: "MODULE_DISABLED"` when `seo` is not effectively present — applied by
  the module route wrapper, not written in the handler.

## 2. `GET /api/v1/storefront/seo/crawler-files`

Public, unauthenticated, channel-resolved as §1.

```jsonc
// 200
{
  "data": {
    "index": false,
    "follow": false,
    "robotsTxtCustom": "User-agent: GPTBot\nDisallow: /\n",
    "llmsTxtAdditional": "",
    "shop": { "name": "Endora Demo" }
  }
}
```

- Schema: `storefrontCrawlerFilesSchema` / `storefrontCrawlerFilesResponseSchema`.
- `robotsTxtCustom` and `llmsTxtAdditional` are the values resolved for the channel (its own,
  else all-channels, else the empty default), each at most 65 536 bytes of UTF-8, returned
  exactly as stored. Line endings are not normalised by the backend.
- `index` / `follow` repeat §1 so that `llms.txt` (FR-027) needs one read.
- `shop.name` is the channel's configured shop name, or `""`. It is read through the settings
  read port, not by calling the `settings` module's `shop-info` route.
- `Cache-Control: no-store`; `503 MODULE_DISABLED` as §1.

## 3. How the storefront reads §1 and §2

One reader, `storefront/lib/seo/crawler-policy.ts`, used by the middleware (§1) and by both file
handlers (§2).

| Backend answer | Classification | Effect |
| --- | --- | --- |
| `200` with a valid body | **value** | cached per channel, fresh for 60 s; becomes the last-known value |
| `503` with `MODULE_DISABLED` | **none, definitively** | cached as "none" for 60 s; replaces any last-known value |
| `404` | **none, definitively** (a backend without this feature, or without `seo`) | as above |
| timeout (2 s), transport failure, any other status, a body that fails the schema | **unreadable** | the last-known value for that channel, of any age; if there is none, "unknown" |

"Unknown" is what the callers treat differently:

| Caller | On "none" | On "unknown" |
| --- | --- | --- |
| Middleware, any path | no header, no request header | **as "none"** (FR-017) |
| `robots.txt` | system rules alone, `200` | `503`, `Retry-After: 120`, `Cache-Control: no-store` (FR-022) |
| `llms.txt` | `404` | `503`, as above |

The cache is per process and per runtime; it is never written to disk or shared. A stale value
is refetched at most once per 5 s per channel while the backend keeps failing.

## 4. `GET /robots.txt`

```text
<system-generated rules, exactly as storefront/lib/seo/robots-system-rules.ts renders them>
<blank line>
<robotsTxtCustom, verbatim>
```

- Composition is `composeCrawlerFile(base, extra)` from `@endora-commerce/contracts`:
  - `extra` empty or whitespace-only → `base`, byte for byte (FR-019);
  - otherwise `base` with exactly one trailing line break, one blank line, then `extra` with its
    own line breaks untouched and exactly one trailing line break.
- `Content-Type: text/plain; charset=utf-8`. `Cache-Control: public, max-age=60` on `200`.
- `X-Endora-Crawler-Files: 1` on every answer, including `503`.
- **`?part=system`** → the system-generated rules alone, same headers. It is what the Admin UI's
  preview is built from (`admin-surfaces.md` §3) and it never calls the backend, so it answers
  while the backend is down.
- The rendered system rules are equivalent to what `MetadataRoute.Robots` produced before this
  feature: the same `User-agent`, `Allow`, `Disallow` lines in the same order and the same
  `Sitemap:` line. A fixture test holds the two to each other.
- The default policy does **not** change this file (FR-015). There is no code path from §1 to §4.

## 5. `GET /llms.txt`

- `404` when the channel's policy has `index: false` (FR-027), and when the answer of §2 is
  "none" (FR-030).
- Otherwise `composeCrawlerFile(base, llmsTxtAdditional)`, `Content-Type: text/plain;
  charset=utf-8`, `Cache-Control: public, max-age=60`, `X-Endora-Crawler-Files: 1`.
- The generated base, in this order:

  ```text
  # <shop.name, or the storefront's site host when empty>

  ## Pages

  - [Home](<absolute url of />)
  - [<one line per entry of SITEMAP_STATIC_ROUTES other than />](<absolute url>)

  ## Sitemap

  - [Sitemap](<absolute url of /sitemap.xml>)
  ```

  The list is `SITEMAP_STATIC_ROUTES` — the storefront's hand-written statement of its public,
  indexable, static addresses — and nothing else. No address is computed from the route tree and
  no address family closed in §4 can appear.
- **`?part=base`** → the generated base alone; `404` under the same conditions as the plain
  address.
- `llms.txt` and `robots.txt` are added to `RESERVED_TOP_LEVEL_SEGMENTS` (FR-028).

## 6. The directive on responses

Set by `storefront/middleware.ts`, for every path its matcher covers. The matcher covers
everything except `/_next/static/*`.

| Policy | `X-Robots-Tag` | Request header `x-robots-default` (documents only) | Extra `<meta name="robots">` in the root layout |
| --- | --- | --- | --- |
| none, unknown, or `index && follow` | not set | deleted | not rendered |
| `!index && follow` | `noindex` | `noindex` | `content="noindex"` |
| `index && !follow` | `nofollow` | `nofollow` | `content="nofollow"` |
| `!index && !follow` | `noindex, nofollow` | `noindex, nofollow` | `content="noindex, nofollow"` |

- The page's own `<meta name="robots">`, produced from its route declaration, is never read,
  replaced or suppressed by this feature. A document may therefore carry two robots meta tags and
  a header; a crawler applies the most restrictive of them (FR-012).
- The request header is written or deleted on **every** request the middleware handles, so a
  value supplied by a client never reaches the layout.
- A non-document path (a file extension, `robots.txt`, `sitemap.xml`, `manifest.webmanifest`,
  `/_next/image`) gets the response header and nothing else: no reachability probe, no
  `x-pathname`, no rewrite. Its behaviour before this feature is otherwise unchanged.
- The `503` rewrite the middleware already performs when the backend is unreachable is unchanged
  and takes precedence; it carries the header when a last-known value exists.

## 7. What is deliberately not in this contract

- No cache tag and no revalidation call. `packages/contracts/src/storefront-cache-tags.ts` gains
  nothing.
- No event. `seo` subscribes to nothing and emits nothing for this feature.
- No directive on any response the backend serves (owner ruling R2).
