# Contract: crawler policy — what the backend tells the storefront, and what the storefront serves

**Feature**: `specs/144-seo-search-engine-robots/` · **Owner of §1–§2**: `seo` · **Owner of
§3–§6**: the storefront.

The Zod schemas named here are written in `packages/contracts/src/seo.ts` **before** either side
is implemented (Principle II); this document is their prose. Names are final unless a test in the
owning slice refutes one.

**Brought in line with what shipped on 2026-10-11** (slices 1 and 3) **and on 2026-10-12**
(slice 5: §2.2, §5, and the `llms.txt` rows of §3 and §6). Where the first version of
this document said something else, the difference is marked *(as shipped)* and the reason is
beside it; `tasks.md` records each as a deviation on the task that made it.

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
- **The schemas are strict about the members they name and tolerant of any they do not** *(as
  shipped)*: `index` and `follow` must be present booleans; an unknown member, in `data` or beside
  it, is dropped rather than refused. A storefront is deployed apart from its backend and is
  usually the older of the two, so a strict schema would turn the first additive change into an
  unreadable answer on every storefront already in the field. Additive changes to this response
  are therefore non-breaking; removing or retyping a named member is breaking.
- The stored token never appears on the wire; a consumer branches on two booleans.
- **`500` when the stored value is not one of the four tokens** *(as shipped)* — never a
  permissive `200`. The settings API refuses such a value on write, so this takes a row written
  around it. A `200` saying "no restriction" would be definitive and would make a storefront
  replace a last-known `noindex`; a `500` is "unreadable" in §3 and the storefront keeps what it
  knew.
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
    "llmsTxtAdditional": "## About\n\nWe sell bolts.\n",
    "shop": { "name": "Endora Demo" }
    // "unreadable": ["policy"]   — only when something could not be read; see §2.2
  }
}
```

- Schema: `storefrontCrawlerFilesSchema` / `storefrontCrawlerFilesResponseSchema`, tolerant of
  unknown members exactly as §1. The five members above are required; `unreadable` is optional.
- `robotsTxtCustom` and `llmsTxtAdditional` are the values resolved for the channel (its own,
  else all-channels, else the empty default), each at most `CRAWLER_TEXT_MAX_BYTES` = 65 536
  bytes of UTF-8, returned exactly as stored. Line endings are not normalised by the backend;
  §4 says what a served file does with them. An empty channel value is a value: it overrides a
  non-empty all-channels text.
- `llmsTxtAdditional` was `""` until slice 5 declared `seo.llms_txt_additional`; the member has
  been in the contract from the first release that has the endpoint, so a storefront reads one
  shape.
- The schema bounds each text at 65 536 **characters**. That is deliberately the looser test —
  a text within the byte limit never has more characters than that — and it is what a consumer
  can check without encoding the text.
- `index` / `follow` repeat §1 so that `llms.txt` (FR-027) needs one read.
- `shop.name` is the channel's configured shop name, or `""` — also when the setting is not
  registered or does not hold a string. It is read through the settings read port, not by calling
  the `settings` module's `shop-info` route.
- `Cache-Control: no-store`; `503 MODULE_DISABLED` as §1.
- **`500`, never an empty text at `200`, when the stored `robots.txt` instructions cannot be
  served** — not a string, or over the byte limit. It takes a row written around the settings API.
  An empty text at `200` would be definitive: the storefront would serve a `robots.txt` without
  the operator's instructions and call it current. *(Slices 3 and 4 answered `500` for an
  unreadable `seo.default_robots` as well; §2.2 is what replaced that.)*

### 2.2 The parts of the answer fail apart — `unreadable` *(slice 5)*

`robots.txt` is built from the texts and never from the policy (§4, FR-015). As first shipped, a
`seo.default_robots` row holding a value outside the four tokens failed the whole answer, so a
storefront that knew nothing answered that channel's `robots.txt` `503` — for a setting the file
has no path from. `llms.txt` is the first reader of `index` / `follow`, and with it the coupling
had to be decided (`tasks.md`, the note before T093).

**The endpoint answers `200` and names what it could not read**, in an optional member:

| In `unreadable` | Means | The members it concerns then read |
| --- | --- | --- |
| `"policy"` | the stored `seo.default_robots` is not one of the four tokens | `index: false`, `follow: false` — "not known", not a value |
| `"llmsTxtAdditional"` | the stored `seo.llms_txt_additional` is not a string, or is over the byte limit | `""` — "not known", and never a part of the text |

- Absent when everything was read; never an empty list. A list of **names**, not a closed enum, so
  that a later backend can name something else: a consumer ignores a name it does not know.
- **Additive.** A backend older than the member never sends it (it answered `500`); a storefront
  older than it ignores it, and reads neither thing it can name — which is why those two, and only
  those, may be answered this way. Such a storefront now serves `robots.txt` on a channel with an
  unreadable policy too.
- `false, false` is not a guess at the policy. It is the reading under which a consumer that does
  not know `unreadable` errs towards keeping a channel out.
- `robotsTxtCustom` is deliberately **not** nameable: every storefront that has the endpoint reads
  it. So unreadable `robots.txt` instructions still cost a cold storefront the channel's
  `llms.txt` as well as its `robots.txt`; that direction fails closed and is left.
- "Unreadable" is about the stored **value**. A settings store that cannot be asked, or has no
  such setting, is still a `500`.
- §1 is unchanged: `robots-policy` answers `500` for the same row, and pages keep the directive
  they last knew.
- Each such answer is logged at `error`, naming the channel and the members — never a value.

### 2.1 The size limit, on write

`seo` contributes a `SettingWriteValidator` for `seo.robots_txt_custom` (and for
`seo.llms_txt_additional` once declared). A text over `CRAWLER_TEXT_MAX_BYTES` is refused with
`400`, `error.code: "SEO_CRAWLER_TEXT_TOO_LARGE"`, `details: { settingCode, maxBytes,
actualBytes }` and a sentence, in `en` and `pl`, that names both numbers. The stored value is
unchanged.

The validator measures **the value being written**, which `SettingWriteValidationInput` carries
as `proposedValue` *(added in slice 3)*. The channel projection alone is not enough: an
all-channels write reaches no channel that has a row of its own, so on an instance where every
channel has one the proposed text is in no channel's projection and would be stored unmeasured.

## 3. How the storefront reads §1 and §2

One reader, `storefront/lib/seo/crawler-policy.ts`, used by the middleware (§1) and by both file
handlers (§2).

| Backend answer | Classification | Effect |
| --- | --- | --- |
| `200` with a valid body | **value** | cached per channel, fresh for 60 s; becomes the last-known value |
| `503` with `MODULE_DISABLED` | **none, definitively** | cached as "none" for 60 s; replaces any last-known value |
| `404` | **none, definitively** (a backend without this feature, or without `seo`) | as above |
| timeout (2 s), transport failure, any other status (a `500`, a `400` for an unknown channel, a `503` without the module code), a body that fails the guard | **unreadable** | the last-known value for that channel, of any age; if there is none, "unknown" |

*(As shipped.)* The two reads share every rule and no state: each has its own entries, keyed by
channel, and an answer to one is never an answer to the other.

- **The body is checked by a hand-written guard, not by the Zod schema.** The reader is in the
  middleware bundle, and the schema cost it 26 kB. `isRobotsPolicyResponse` and
  `isCrawlerFilesResponse` are held to the contract schemas by a unit test over shared fixtures;
  the schemas stay the statement of what the answers are.
- **A stale value is not "refetched, then served".** The request that finds it stale starts the
  refresh and waits for it for at most **150 ms**; a backend that answers inside that — a healthy
  one always does — is served fresh on the same request. Otherwise the known value is served and
  the refresh finishes in the background, replacing the value when it arrives. The budget is the
  refresh's, not each request's.
- **Only a process that knows nothing waits for a read** — up to the 2 s timeout, once, after
  which the back-off spares later requests.
- **"No channel" is its own key**, distinct from every code a request can carry, a channel
  literally coded `default` included.
- **The cache is bounded** at 256 channels per read. What is dropped to make room: an entry that
  holds nothing first, then one that holds "none", and only then the value read longest ago — so
  a client inventing channel codes cannot make the process forget a real channel.
- **A read in progress for 5 s or more is taken for dead** *(slice 3)* — longer than any read
  can take, so it happens only to a process frozen under a request. The next request starts a
  new read, and the abandoned one's answer, should it arrive, is ignored.
- **A read whose entry was evicted while it ran tells its callers and is not kept** *(slice 3,
  after review; the defect was slice 1's)*. An entry holding nothing is the first to be evicted,
  so many distinct codes asked for at once each lost their entry before their answer arrived —
  and each then put it back, growing the cache past its bound and letting a late answer replace a
  newer one. A completed read now refreshes its entry's place only if the entry still holds it.

"Unknown" is what the callers treat differently:

| Caller | On "none" | On "unknown" |
| --- | --- | --- |
| Middleware, any path | no header, no request header | **as "none"** (FR-017) |
| `robots.txt` | system rules alone, `200` | `503`, `Retry-After: 120`, `Cache-Control: no-store` (FR-022) |
| `llms.txt` | `404` | `503`, as above |

And one case only `llms.txt` has *(slice 5)*: a **value** that names `policy` or
`llmsTxtAdditional` in `unreadable` (§2.2) is, to that file, "unknown" — `503`, as above. To
`robots.txt` it is a value like any other.

The cache is per process and per runtime; it is never written to disk or shared. A stale value
is refetched at most once per 5 s per channel while the backend keeps failing.

## 4. `GET /robots.txt`

Served by `storefront/app/robots.txt/route.ts` (`dynamic = 'force-dynamic'`); the decision is
`storefront/lib/seo/robots-txt.ts`. `storefront/app/robots.ts` is deleted.

```text
<system-generated rules, exactly as storefront/lib/seo/robots-system-rules.ts renders them>
<blank line>
<robotsTxtCustom, verbatim>
```

- Composition is `composeCrawlerFile(base, extra)` from `@endora-commerce/contracts`:
  - `extra` empty or whitespace-only → `base`, byte for byte (FR-019);
  - otherwise `base` with exactly one trailing line break, one blank line, then `extra` and
    exactly one trailing line break.
- **"Verbatim" is defined in that function** *(as shipped; the first version of this document
  said `extra`'s own line breaks were untouched)*: every character of `extra` is kept, unchanged
  and in order, except that **every line break — `LF`, `CRLF` or a lone `CR` — is served as
  `LF`**, and line breaks at the end of the text become exactly one. A browser's text field sends
  `LF` and the settings API stores what it is sent, so without this one file could carry two
  conventions and the same text would be served as different bytes depending on which client
  saved it. **And exactly one byte order mark (`U+FEFF`) at the very start of `extra` is not
  served** *(after review)*: a crawler does not recognise `\uFEFFUser-agent: …` as the start of a
  group, so the rules under it would attach to the generated `*` group. Nothing else is trimmed,
  escaped, validated or reordered.
- **"The system rules cannot be edited" is true of the bytes, not of their effect.** Under RFC
  9309 a group that names a crawler replaces the `*` group for that crawler, and an `Allow` as
  long as a `Disallow` wins. The setting's description and the module page say so and tell the
  operator to repeat the generated rules in a crawler-specific group. FR-023 is unaffected:
  whether a page is indexable never depended on this file.
- `Content-Type: text/plain; charset=utf-8`. `Cache-Control: public, max-age=60` on `200`.
- `X-Content-Type-Options: nosniff` and `Vary: X-Sales-Channel` on every answer: the body is an
  operator's text and one sales channel's. `Vary` is only as good as what stands in front of the
  storefront: a proxy serving several channels must set `X-Sales-Channel` itself rather than pass
  a client's through, and a shared cache that ignores `Vary` on a custom header must key on it or
  not cache the file. The module page says so; `deploy/nginx.example.conf` shows the lines.
- The operator's text reaches the response body and nothing else — the status, every header and
  the content type are constants.
- `X-Endora-Crawler-Files: 1` on every answer, including `503`.
- The `503` (§3, "unknown") carries `Retry-After: 120`, `Cache-Control: no-store` and a one-line
  plain-text body that is not shaped like a rule.
- The middleware still handles `/robots.txt` as a non-document path (§6): it adds `X-Robots-Tag`
  when the channel's policy restricts something, and nothing else. The body is unaffected.
- `robots.txt` is in `RESERVED_TOP_LEVEL_SEGMENTS` (the route is now a directory under `app/`).
- **`?part=system`** → the system-generated rules alone, with the same headers except
  **`Cache-Control: no-store`** *(as shipped after review)*: it is the file without the operator's
  text at an address that differs from the real one by a query string only, and a cache set up to
  ignore query strings would store it as `/robots.txt`. It is what the Admin UI's preview is built
  from (`admin-surfaces.md` §3).
  - **The route handler asks the backend nothing for it**, so the handler answers while the
    backend is down. *The request as a whole is not independent of the backend*: the middleware in
    front of the route (§6) still reads the channel's policy for the response header, and on a
    process that knows nothing it waits for that read — up to the 2 s timeout when the backend
    accepts the connection and does not answer, then nothing inside the 5 s back-off.
- **Cold-path cost, measured** *(review, 2026-10-11)*: a first `/robots.txt` on a fresh process
  against a backend whose endpoints hang takes **4 to 5 s** (about 4 s in the review; 5.1 s as
  the very first request of a just-started process) — the middleware's policy read, then the
  route's crawler-files read, each to its 2 s timeout, in sequence — and the next request inside
  the back-off 7 to 19 ms. A cold `?part=system` under the same conditions takes 2.0 s, the
  middleware's read alone. The two reads cannot be run concurrently as built: they are made
  by two runtimes (the middleware's and the route's), each with its own copy of the reader, and
  the middleware has finished before the route starts. Skipping the middleware's read is not
  acceptable, because the header is owed on this file too (FR-014). Left as it is; the cost is
  bounded, paid once per channel per process, and only while the backend is not answering.
- **Composition is linear in the text, and kept.** `composeCrawlerFile` does no backtracking (a
  `/\n+$/` trim took 4.5 s on 64 KiB of line breaks that were not at the end), and the handler
  keeps the composed file per configuration object, so a hot `/robots.txt` composes once per
  refresh.
- The rendered system rules are equivalent to what `MetadataRoute.Robots` produced before this
  feature: the same `User-agent`, `Allow`, `Disallow` lines in the same order and the same
  `Sitemap:` line. A fixture test holds the two to each other.
- The default policy does **not** change this file (FR-015). There is no code path from §1 to §4.

## 5. `GET /llms.txt`

Served by `storefront/app/llms.txt/route.ts` (`dynamic = 'force-dynamic'`); the decision is
`storefront/lib/seo/llms-txt.ts`, the generated base `lib/seo/llms-txt-base.ts`. *(As shipped in
slice 5; the first version of this section is what the differences below are marked against.)*

| What is known about the channel | Answer |
| --- | --- |
| it may be indexed, and its configuration was read now or is remembered | `200`, `composeCrawlerFile(base, llmsTxtAdditional)` |
| its policy has `index: false` (FR-027) | `404`, whatever the content holds |
| the answer of §2 is "none" (FR-030) | `404` |
| "unknown", or a value naming `policy` or `llmsTxtAdditional` unreadable (§2.2) | `503`, `Retry-After: 120` |

- `Content-Type: text/plain; charset=utf-8`, `X-Content-Type-Options: nosniff`,
  `Vary: X-Sales-Channel` and `X-Endora-Crawler-Files: 1` on **every** answer, `404` and `503`
  included — the constants `robots.txt` answers with, written once in
  `lib/seo/crawler-file-response.ts`. `Cache-Control: public, max-age=60` on the `200`;
  **`no-store` on the `404`** *(as shipped)*, so that a withdrawn file is seen withdrawn and an
  allowed one is seen back without a cache's say; `no-store` on the `503`.
- **The capability header on the `404` is load-bearing**: it is how the Admin UI's preview tells
  "no `llms.txt` for this channel" from a storefront that has no such route
  (`admin-surfaces.md` §3).
- Only `index` withdraws the file. `follow: false` alone does not.
- Composition, "verbatim", the byte order mark and the linear cost are §4's, unchanged: one
  function. The composed file is kept per configuration object, as §4's is.
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
  indexable, static addresses — and nothing is ever added to it. No address is computed from the
  route tree and no address family closed in §4 can appear; a test holds every address the base
  writes against `ROBOTS_SYSTEM_RULES.disallow` itself.
  - **Less a page that would answer "not found" right now** *(as shipped; FR-025's "where those
    exist")*. `LLMS_TXT_CONDITIONAL_PAGES` names the listed pages that depend on something behind
    them — today `/blog`, which is `404` while the `blog` module is off **or** the channel's
    `blog.enabled` is `false`. `lib/seo/llms-txt-pages.ts` asks about each the way the page asks
    about itself (`getBlogIndex`), within the 2 s a read is given. The answer is kept with the
    configuration object — once per refresh, not per request, and no cache of its own. A page that
    cannot be asked about is left out for that request and asked about again on the next. This
    can remove a line and can never add one.
  - **The shop name is one line** *(as shipped)*: surrounding whitespace removed, every run of
    whitespace inside — line breaks included — one space, in time linear in the name. A name
    cannot start a line of its own, so it cannot become a list entry.
  - Titles are English constants (`LLMS_TXT_PAGE_TITLES`), keyed by the static routes; a test holds
    the two sets equal, so a route added to the sitemap is named in the same change.
  - No summary blockquote: the storefront has no description of the shop to offer. An operator
    writes one in the additional content.
- **`?part=base`** → the generated base alone, `no-store`; `404` and `503` under exactly the
  conditions of the plain address. Unlike `?part=system` of §4 it **does** read §2: whether there
  is a file to preview is part of the answer.
- **`/llms.txt` is a non-document path to the middleware** *(as shipped; §6)*. The matcher the
  document classification is taken from knew no such address — `.txt` is not among the extensions
  it excluded — so the path was gated as a page, and a process holding the last-known file would
  have answered the outage notice instead of serving it while the backend is down.
  `isDocumentPath` answers `false` for that exact address and nothing near it.
- `llms.txt` and `robots.txt` are in `RESERVED_TOP_LEVEL_SEGMENTS` (FR-028).
- **A `public/llms.txt` shadows the route** *(measured on the standalone server: `200`, the
  file's bytes, no capability header)* — for every channel, on a `NOINDEX` channel too. Next has
  no metadata-file convention for this address, which is what let `app/robots.ts` shadow §4's
  route; the route test holds that neither exists. Not measured: a build made with the file
  present.

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
- A non-document path (a file extension, `robots.txt`, `llms.txt` *(slice 5)*, `sitemap.xml`,
  `manifest.webmanifest`, `/_next/image`) gets the response header and nothing else: no reachability probe, no
  `x-pathname`, no rewrite. Its behaviour before this feature is otherwise unchanged.
- The `503` rewrite the middleware already performs when the backend is unreachable is unchanged
  and takes precedence; it carries the header when a last-known value exists.

## 7. What is deliberately not in this contract

- No cache tag and no revalidation call. `packages/contracts/src/storefront-cache-tags.ts` gains
  nothing.
- No event. `seo` subscribes to nothing and emits nothing for this feature.
- No directive on any response the backend serves (owner ruling R2).
