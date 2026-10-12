# Feature Specification: Search engine robots — default page robots, `robots.txt` instructions and `llms.txt`, configured by the operator

**Feature Branch**: `spec/seo-search-engine-robots` (spec directory `specs/144-seo-search-engine-robots/`)
**Created**: 2026-10-11
**Status**: Accepted — amended twice on 2026-10-11 after the owner's rulings of that day (see
*Owner rulings*, R1 – R10). The three open questions are answered (R1 – R3), a preview of the
resulting `robots.txt` in the Admin UI is required (R4), a page is never failed because of this
setting (R5), and the five decisions the plan raised are ruled as recommended (R6 – R10), with
FR-008, FR-009 and FR-033 reworded to match. One choice remains a recommendation the owner can
still overturn: which of the two preview shapes the owner offered (A9)
**Input**: Owner's request (translated from Polish): *"Let's add this as a feature in the Admin
UI, e.g. as a setting in the Settings module, defined by the `seo` module, where you can set
whether it should be `noindex`, `nofollow`, or other relevant variants. You can take inspiration
from Magento 2's settings. Similarly there could be the possibility of setting additional content
in `robots.txt` and `llms.txt`."*

**Motivation**: the two public demo instances must not be indexed by search engines, and today
the product has no way to say so. An operator cannot change what a storefront tells crawlers
without editing code and rebuilding it.

**Benchmark**: Magento 2, *Stores → Configuration → Design → Search Engine Robots*, scope
`[website]` — a *Default Robots* dropdown (`INDEX, FOLLOW` / `NOINDEX, FOLLOW` /
`INDEX, NOFOLLOW` / `NOINDEX, NOFOLLOW`), an *Edit custom instruction of robots.txt File*
textarea, and a *Reset To Defaults* button that deletes the custom instructions.

## Vocabulary

- **Default robots** — the per-sales-channel policy this feature adds: whether search engines
  may index the channel's pages and follow their links, when the page itself does not already
  say something stricter.
- **Route declaration** — what a storefront page already says about itself today: either that
  it must not be indexed (account, cart, checkout, sign-in and similar surfaces) or that it is
  indexable and has a canonical address. It is written by the developer of the page and is not
  operator-configurable.
- **System-generated rules** — the part of `robots.txt` the storefront produces on its own
  today: the list of address families crawlers should not fetch, and the line naming the
  sitemap.
- **Custom instructions** — text the operator adds to `robots.txt`.
- **Additional content** — text the operator adds to `llms.txt`.
- **SEO is off** — the `seo` module is not effectively present: switched off by the operator,
  or not available on the platform (Constitution XVII treats the two as one for this purpose).

## What the product does today (measured on `origin/master` at `ca1e265a1`)

| Fact | Where |
| --- | --- |
| `seo` declares exactly one setting, its activation control `seo.enabled`, in the group `seo`. It declares no permission code of its own and no command-palette action | `packages/modules/seo/src/manifest.ts`; `backend/test/integration/_admin_surfaces/batch-eight-palette-off-state.test.ts` asserts `actions: []` |
| `seo`'s meta-tag overrides carry a title, a description and Open Graph fields. They carry **no** robots directive | `packages/modules/seo/src/backend/entities/seo-meta-override.entity.ts` |
| A setting may be a closed list rendered as a dropdown, may hold a value per sales channel, and resolves per-channel value → all-channels value → default. A value can be reset to its default from the Settings screen | `packages/contracts/src/settings.ts` (`enumOptions`, `salesChannelCodes`, `SettingDtoSchema`, `ResetValueQuerySchema`) |
| A plain text setting is edited in a **single-line** field. Nothing in the setting declaration asks for a multi-line editor | `packages/modules/settings/src/admin/components/SettingRowEditor.tsx` (`renderInput`) |
| The generic Settings screen renders a setting's name and description **verbatim from the declaration**, in one language | same file (`setting.name`, `setting.description`); `packages/modules/settings/src/backend/routes.admin.ts` (`serializeSetting`) |
| `robots.txt` is storefront-owned, hard-coded and fixed when the storefront is built. It does not consult the `seo` module, the sales channel or any setting | `storefront/app/robots.ts`; `storefront/.env.example`; `deploy/compose.prod.yml` |
| The storefront serves no `llms.txt` | no such route under `storefront/app/` |
| No response of the storefront or the backend carries an `X-Robots-Tag` header | repository-wide search |
| Every storefront page is required to declare whether it is indexable, and a static check holds the declarations and the sitemap to each other | `backend/scripts/check-storefront-indexability.ts` |
| The storefront learns which modules are present from the backend, per request, and treats an unreadable answer as "everything is present" | `storefront/lib/api/module-presence.ts` |
| The admin application already tells crawlers `noindex, nofollow` | `admin/index.html` |

The origin of the current `robots.txt` and of the indexability check is
`specs/098-storefront-ssr-seo-a11y-suite/` (FR-010 … FR-014), which is in the private historical
repository and is cited here as provenance only.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Keep a sales channel out of search engines (Priority: P1)

An operator running a demo, a staging shop or a shop that is not ready to launch opens the
Settings screen in the Admin UI, finds the SEO group, and sets *Default robots* to
`NOINDEX, NOFOLLOW` — for every sales channel, or for one. From then on every page of that
channel's storefront tells search engines not to index it and not to follow its links, without a
rebuild, a redeploy or a developer.

**Why this priority**: this is the motivating case. It is the whole value for the demo
instances and it stands alone: with only this story delivered, the demos can be taken out of
search results.

**Independent Test**: set *Default robots* to `NOINDEX, NOFOLLOW` for a channel, then fetch the
home page, a product page, a category page, a content page and the cart on that channel and read
what each tells a crawler; fetch `robots.txt` and confirm crawlers are still allowed to fetch the
pages.

**Acceptance Scenarios**:

1. **Given** a channel whose *Default robots* is `INDEX, FOLLOW` (the default), **When** any
   page is fetched, **Then** what it tells crawlers is exactly what it tells them today.
2. **Given** a channel whose *Default robots* is `NOINDEX, NOFOLLOW`, **When** an indexable page
   (home, product, category, content, blog, search, catalog, contact) is fetched, **Then** the
   page tells crawlers not to index it and not to follow its links, both in the document and in
   the response's headers.
3. **Given** a channel whose *Default robots* is `NOINDEX, FOLLOW`, **When** an indexable page is
   fetched, **Then** it tells crawlers not to index it and leaves link-following allowed.
4. **Given** a channel whose *Default robots* is `INDEX, NOFOLLOW`, **When** a page that already
   declares itself non-indexable (cart, checkout, account, sign-in) is fetched, **Then** it still
   tells crawlers not to index it — the setting has not made it indexable — and additionally
   tells them not to follow its links.
5. **Given** a channel whose *Default robots* is `NOINDEX, NOFOLLOW`, **When** `robots.txt` is
   fetched for that channel, **Then** it does **not** forbid crawlers from fetching the site as a
   whole because of that setting: the system-generated rules are the same as for an indexable
   channel.
6. **Given** two sales channels with different *Default robots* values, **When** a page is
   fetched on each, **Then** each answers with its own channel's policy and neither affects the
   other.
7. **Given** an operator who has just saved a new *Default robots* value, **When** a page of that
   channel is fetched a few minutes later, **Then** the new policy is in force, with nobody
   having rebuilt or restarted anything.
8. **Given** a channel whose *Default robots* is `NOINDEX, NOFOLLOW`, **When** a file the
   storefront serves that is not a web page (an image shipped with the storefront, the sitemap,
   the web-app manifest) is fetched, **Then** the response tells crawlers not to index it.

---

### User Story 2 — Add the operator's own instructions to `robots.txt` (Priority: P2)

An operator who wants to slow down an aggressive crawler, keep one crawler out of a section, or
refuse a specific AI crawler opens the SEO group in Settings and writes the instructions into
*Custom robots.txt instructions*. The storefront's `robots.txt` for that channel is then the
system-generated rules followed by the operator's text. While they type, a preview beside the
field shows the file as it will be served for the selected sales channel — the system-generated
rules and their own text together — so they never have to guess what the result is. If the
operator regrets it, *reset to default* removes their text and the file is the system-generated
rules again.

**Why this priority**: it is the second half of the Magento reference and a routine operator
need, but nothing depends on it: User Story 1 delivers the motivating case without it.

**Independent Test**: save several lines of custom instructions for a channel, fetch
`robots.txt`, confirm the system-generated rules are intact and the operator's lines follow them
unchanged; reset, fetch again, confirm only the system-generated rules remain.

**Acceptance Scenarios**:

1. **Given** no custom instructions (the default), **When** `robots.txt` is fetched, **Then** it
   says what it says today: the same address families closed to crawlers and the same sitemap
   line.
2. **Given** custom instructions of several lines, **When** `robots.txt` is fetched, **Then** the
   system-generated rules come first, complete and unaltered, and the operator's lines follow,
   line for line as written.
3. **Given** custom instructions saved for one channel only, **When** `robots.txt` is fetched on
   another channel, **Then** the other channel's file carries no trace of them.
4. **Given** custom instructions exist, **When** the operator resets the setting to its default,
   **Then** the custom instructions are gone, the system-generated rules remain, and the Admin UI
   shows the field as empty.
5. **Given** the operator has just saved or reset custom instructions, **When** `robots.txt` is
   fetched a few minutes later, **Then** it reflects the change with no rebuild or restart.
6. **Given** custom instructions that try to re-open an address family the system-generated
   rules close (for example the account area), **When** a page in that family is fetched,
   **Then** it still tells crawlers not to index it: whether a page may be indexed never depends
   on `robots.txt`.
7. **Given** an operator pastes text larger than the documented limit, **When** they save,
   **Then** the save is refused with a message naming the limit, and the previously saved
   instructions stay in force.
8. **Given** an operator opens *Custom robots.txt instructions* for a sales channel, **When** the
   field is shown, **Then** a preview beside it shows the whole file that channel's storefront
   serves: the system-generated rules, then the saved custom instructions, with the two parts
   told apart at a glance.
9. **Given** the operator types into the field without saving, **When** they look at the preview,
   **Then** it already shows the file as it would be with the unsaved text, marked as not yet
   saved, and what the storefront serves has not changed.
10. **Given** two sales channels with different custom instructions, **When** the operator
    switches the channel being edited, **Then** the preview switches to that channel's file,
    including that channel's own sitemap line.
11. **Given** a sales channel whose *Default robots* forbids indexing, **When** the operator looks
    at the preview, **Then** the system-generated rules are the same as for an indexable channel,
    and the preview says in words that this is deliberate: crawlers must be able to fetch a page
    to read that it must not be indexed.
12. **Given** the system-generated rules for a channel cannot be obtained (its storefront is
    unreachable, or its address is not configured), **When** the operator looks at the preview,
    **Then** it says so, still shows the operator's own part, shows no invented or remembered
    system part as if it were current, and saving remains possible.

---

### User Story 3 — Publish an `llms.txt` for AI assistants (Priority: P3)

An operator who wants AI assistants to understand what the shop is and where its public content
lives opens the SEO group in Settings and writes *Additional llms.txt content*. The storefront
then serves an `llms.txt` for that channel, following the same shape as `robots.txt`: what the
platform can say on its own, followed by what the operator added.

**Why this priority**: `llms.txt` is an emerging convention with no settled consumer behaviour;
it is the most speculative of the three and the storefront serves nothing at that address today,
so nothing regresses if it lands last. Constitution VII names LLM crawlers as an audience, which
is why it is in scope at all.

**Independent Test**: fetch `/llms.txt` on a channel with the default configuration, then write
additional content, fetch again and confirm it is included; set the channel's *Default robots*
to a non-indexable value and confirm the file is no longer offered.

**Acceptance Scenarios**:

1. **Given** an indexable channel and no additional content, **When** `/llms.txt` is fetched,
   **Then** a generated base is served: the shop's name and its main public entry points (owner
   ruling R1).
2. **Given** additional content of several lines, **When** `/llms.txt` is fetched, **Then** the
   generated base comes first and the operator's content follows, as written.
3. **Given** additional content saved for one channel, **When** `/llms.txt` is fetched on another
   channel, **Then** the other channel's file does not carry it.
4. **Given** a channel whose *Default robots* forbids indexing, **When** `/llms.txt` is fetched,
   **Then** nothing is served at that address: a shop that asks search engines to stay away does
   not at the same time invite AI assistants in.
5. **Given** the operator resets the additional content to its default, **When** `/llms.txt` is
   fetched, **Then** it is the generated base alone.
6. **Given** any configuration, **When** `/llms.txt` is fetched, **Then** it names no address
   from a family that is closed to crawlers (account, cart, checkout, sign-in and similar).
7. **Given** an operator edits *Additional llms.txt content* for a sales channel, **When** they
   look beside the field, **Then** a preview shows the file as it will be served for that channel
   — generated base and their text, including unsaved text — and, on a channel whose *Default
   robots* forbids indexing, says instead that no `llms.txt` is served for that channel.

---

### User Story 4 — With SEO switched off, the storefront behaves as if this feature did not exist (Priority: P2)

A deployment operator or a business operator switches the `seo` module off. The storefront keeps
serving a valid `robots.txt` — the system-generated one, as today — but nothing this feature adds
remains: no default robots policy is applied, no custom instructions are appended, no `llms.txt`
is served, and the settings are not editable and have no preview. Switching the module back on restores everything
exactly as it was configured.

**Why this priority**: Constitution XVII is non-negotiable, and this feature is unusual in that
it makes a module-owned capability out of something the storefront owns on its own today
(`robots.txt`). What survives when the module is off has to be decided here, not discovered
during implementation.

**Independent Test**: configure all three settings, switch `seo` off on the platform modules
screen, fetch a page, `robots.txt` and `/llms.txt`, open Settings; switch `seo` on again and
repeat.

**Acceptance Scenarios**:

1. **Given** a channel configured with `NOINDEX, NOFOLLOW`, custom instructions and additional
   content, **When** `seo` is switched off, **Then** pages tell crawlers exactly what their own
   route declarations say and nothing more; `robots.txt` is the system-generated rules alone;
   `/llms.txt` is not found; and no response carries a robots header added by this feature.
2. **Given** `seo` is off, **When** the operator opens Settings, **Then** the three settings
   cannot be edited, no preview of `robots.txt` or `llms.txt` is offered, and their stored values
   have not been deleted.
3. **Given** `seo` is switched on again, **When** a page, `robots.txt` and `/llms.txt` are
   fetched, **Then** each reflects the configuration saved before the module was switched off,
   with no repair step.
4. **Given** an operator is about to switch `seo` off, **When** they read the description of its
   activation control, **Then** it tells them that doing so withdraws the *Default robots* policy
   — that is, that a channel kept out of search engines by this feature becomes indexable again.
5. **Given** a storefront connected to a platform where `seo` was never installed, **When**
   `robots.txt` is fetched, **Then** it is the system-generated rules, as today.

---

### Edge Cases

- **The configuration cannot be read** (the backend is slow, or answers an error for this one
  read, while a page or a file is being produced). The answer differs by what is being served,
  because the cost of being wrong differs.
  - *A page.* The storefront uses the last *Default robots* value it knew for that channel.
    Where it knows none, it serves the page normally, with only the page's own route declaration
    — as if the default were `INDEX, FOLLOW`. A customer is never shown a failure because a
    crawler setting could not be read. This is the same direction in which the storefront already
    treats an unreadable module-presence answer (everything counts as present).
  - *`robots.txt` and `llms.txt`.* The storefront serves the last version it knew, and where it
    knows none, a temporary failure — which a crawler reads as "ask again later" and no customer
    sees.
  - **Residual risk, stated plainly.** A channel set to `NOINDEX` can serve indexable pages for a
    short time: a storefront process that has just started and has never read the setting, while
    the backend cannot answer that read. Three things bound it. A storefront whose backend is
    wholly unreachable already answers every page with a temporary-unavailable response, so the
    window is the narrower case of a backend that is up and failing this one read. Private pages
    are unaffected, since their own declaration does not depend on the setting. And a search
    engine that fetches a page inside the window and indexes it drops it again on its next fetch,
    when the page says `noindex`. An operator for whom even that window is unacceptable needs
    protection outside this feature (access control on the whole site), and the documentation
    says so.
- **A page that is both non-indexable by declaration and on an indexable channel.** The page's
  own declaration wins. The setting is never consulted as a way to loosen it.
- **`NOINDEX` combined with a site-wide crawl ban.** An operator may write `Disallow: /` in the
  custom instructions on a channel whose default is `NOINDEX`. That is their instruction and it is
  served; the preview, the documentation and the setting's description say why it defeats the
  purpose — a crawler that may not fetch a page never sees its `noindex`, and an address linked
  from elsewhere can then still appear in results.
- **The operator edits the all-channels value rather than one channel's.** The preview shows the
  result for one sales channel the operator picks, and says which channels hold a value of their
  own and are therefore not affected by the edit.
- **The storefront and the Admin UI run different versions**, so the storefront's
  system-generated rules differ from what an older or newer release would produce. The preview
  shows what that channel's storefront serves, because that is the only statement of those rules
  that is true for it.
- **Not-found, error and temporarily-unavailable documents.** They are never more permissive than
  the channel's default; a not-found page is non-indexable today and stays so.
- **The channel's default changes while a crawler is mid-crawl.** Pages fetched before the change
  carried the old policy; nothing retroactive is attempted. Search engines act on `noindex` only
  when they next fetch a page, and the documentation says so, so that an operator does not expect
  a shop to leave search results within minutes.
- **A sales channel with no value of its own.** It takes the all-channels value, and failing that
  the default — the ordinary resolution of every per-channel setting.
- **A storefront serving one channel behind a proxy that does not say which.** The system-default
  channel's configuration applies, exactly as for every other channel-scoped storefront read.
- **Custom instructions containing a second sitemap line, comments, blank lines or non-ASCII
  text.** Served as written; the platform does not parse, reorder, deduplicate or "correct"
  operator text.
- **Custom instructions or additional content containing markup or script.** Both files are
  served as plain text and are never rendered into a page, so the text is inert.
- **A content page whose address would be `llms.txt`.** The address belongs to this feature and
  cannot be taken by operator-authored content.
- **The sitemap on a non-indexable channel.** It is served unchanged and `robots.txt` keeps naming
  it. Listing addresses a crawler will be told not to index is harmless and is how the crawler
  finds them to read the instruction.
- **The canonical address on a page made non-indexable by the default.** It is still emitted.
  The page's classification has not changed — it is an indexable page on a channel that is, for
  now, kept out of search — and the canonical is what makes switching back to `INDEX` lossless.

## Requirements *(mandatory)*

### Functional Requirements

#### Configuration

- **FR-001**: The `seo` module MUST declare three settings in its own settings group, alongside
  its existing activation control: *Default robots*, *Custom robots.txt instructions* and
  *Additional llms.txt content*. They MUST be declared by the `seo` module itself, so that a
  platform without `seo` has none of them.
- **FR-002**: *Default robots* MUST be a closed choice among `INDEX, FOLLOW`, `NOINDEX, FOLLOW`,
  `INDEX, NOFOLLOW` and `NOINDEX, NOFOLLOW`, presented as a dropdown, with `INDEX, FOLLOW` as the
  default. A value outside the list MUST be refused. No other variant is offered in this
  feature (owner ruling R3).
- **FR-003**: Each of the three settings MUST be configurable for all sales channels at once and
  per sales channel, resolving in the platform's ordinary order: the channel's own value, else
  the all-channels value, else the default.
- **FR-004**: *Custom robots.txt instructions* and *Additional llms.txt content* MUST be edited
  in a multi-line field that shows the text as it will be served and preserves line breaks
  exactly. Both default to empty.
- **FR-005**: The operator MUST be able to reset each setting to its default, for all channels or
  for selected channels. Resetting *Custom robots.txt instructions* removes the operator's text
  and leaves the system-generated rules in force; it MUST NOT be possible, through this feature,
  to remove or edit the system-generated rules.
- **FR-006**: Saving custom instructions or additional content larger than a documented maximum
  MUST be refused with a message that names the limit, leaving the stored value unchanged. The
  maximum MUST be small enough that the whole served file stays within the size search engines
  read.
- **FR-007**: Changing any of the three settings MUST require the same administrator permission
  as changing any other setting, MUST be refused for an administrator without it, and MUST be
  recorded in the audit trail with who changed it, when, and the value before and after.
- **FR-008**: The name and the description of each setting MUST be available in English and in
  Polish. The four *Default robots* choices MUST be shown as the directive tokens themselves
  (`INDEX, FOLLOW`, `NOINDEX, FOLLOW`, `INDEX, NOFOLLOW`, `NOINDEX, NOFOLLOW`), identical in every
  language, with their meaning explained in the translated description. *(Changed by ruling R8:
  this requirement first asked for a translated label for each choice.)* The descriptions MUST state the
  consequence an operator needs before choosing: for *Default robots*, that it adds restrictions
  and never makes a private page indexable, and that search engines act on it only when they next
  fetch a page; for *Custom robots.txt instructions*, that the text is appended to the
  system-generated rules and that forbidding crawling does not remove pages from search results.
- **FR-009**: The configuration MUST be reachable from the admin command palette by every
  administrator who is allowed to see settings, and MUST NOT be offered there to one who is not.
  An administrator who may see but not change them arrives at a read-only view with the previews
  (FR-045). *(Changed by ruling R6: this requirement first offered the entry only to
  administrators allowed to change the configuration.)*
- **FR-010**: A saved change MUST take effect on the storefront without a rebuild, a redeploy or
  a restart, in every running storefront process, within five minutes.
- **FR-011**: After an upgrade to a version that contains this feature, with no setting touched,
  every page and `robots.txt` MUST say exactly what they said before the upgrade.

#### Default robots on pages

- **FR-012**: Every document the storefront serves on a sales channel MUST carry a robots
  directive that is the combination of the page's own route declaration and the channel's
  *Default robots*, taken restriction by restriction: the document is non-indexable if either
  says so, and tells crawlers not to follow links if either says so.
- **FR-013**: *Default robots* MUST NOT, under any value, make a page indexable or its links
  followable when the page's own route declaration says otherwise. The setting adds restrictions;
  it never removes one.
- **FR-014**: When the channel's *Default robots* forbids indexing or link-following, the same
  directive MUST also be sent as a response header on every response the storefront serves for
  that channel that a search engine could index — documents and non-document resources alike
  (files shipped with the storefront, the sitemap, the web-app manifest). Build-generated script
  and style files MAY be exempt. When the default is `INDEX, FOLLOW`, no such header is added.
  The requirement stops at the storefront's own responses: media and public API responses served
  from the backend's address are **not** covered by this feature (owner ruling R2), and the
  documentation MUST say so (FR-037).
- **FR-015**: A non-indexable *Default robots* MUST NOT change `robots.txt` into a site-wide ban
  on crawling, and MUST NOT alter the system-generated rules in any way. **Reason**: `robots.txt`
  governs fetching and the page directive governs indexing; a crawler has to be allowed to fetch
  a page in order to read that it must not be indexed, and a page that may not be fetched can
  still be listed in results from links elsewhere.
- **FR-016**: *Default robots* MUST NOT change the sitemap, a page's canonical address or its
  structured data.
- **FR-017**: When the storefront cannot determine a channel's *Default robots* while producing a
  document, it MUST use the last value it knew for that channel. Where it knows none, it MUST
  serve the document normally with only the page's own route declaration, exactly as if the
  default were `INDEX, FOLLOW`. A document MUST NOT be answered with a failure, delayed beyond its
  ordinary time, or withheld because this setting could not be read (owner ruling R5). The page's
  own non-indexable declaration is unaffected in every case (FR-013, FR-036). The residual risk
  this accepts is stated under *Edge Cases*.

#### `robots.txt`

- **FR-018**: The storefront's `robots.txt` MUST consist of the system-generated rules — the same
  closed address families and the same sitemap line as today — followed by the sales channel's
  custom instructions, verbatim, when there are any.
- **FR-019**: With no custom instructions, `robots.txt` MUST be equivalent to today's file: the
  same rules and the same sitemap line.
- **FR-020**: `robots.txt` MUST reflect the configuration of the sales channel the request
  resolves to, and MUST never contain another channel's custom instructions.
- **FR-021**: `robots.txt` MUST reflect the current configuration rather than the configuration
  at the time the storefront was built. This is a deliberate change: the file is fixed at build
  time today. It MUST remain cheap to serve and cacheable, and no page of the storefront may lose
  its ability to be server-rendered because of this feature (Constitution VII).
- **FR-022**: When the storefront cannot read a channel's custom instructions, it MUST NOT answer
  successfully with a file that silently omits them. It MUST serve the last version it knew, and
  where it knows none, answer with a temporary failure — which search engines treat as "ask again
  later" rather than as permission. Unlike FR-017 this fails closed, because no customer reads
  this file.
- **FR-023**: Whether a page may be indexed MUST NOT depend on `robots.txt`. No custom
  instruction, however written, may cause a page that declares itself non-indexable to be served
  as indexable.

#### `llms.txt`

- **FR-024**: The storefront MUST serve an `llms.txt` at the root of each sales channel's
  address, as plain text, composed of a generated base followed by the channel's additional
  content (owner ruling R1).
- **FR-025**: The generated base MUST identify the shop by its configured name and list its main
  public entry points with absolute addresses — the home page, the catalog, search, the blog and
  contact page where those exist, and the sitemap. It MUST contain only addresses that are public
  and indexable, and MUST NOT name any address from a family closed to crawlers.
- **FR-026**: The additional content MUST be served after the generated base, verbatim.
- **FR-027**: When the sales channel's *Default robots* forbids indexing, `/llms.txt` MUST NOT be
  served for that channel (it answers as not found), whatever the additional content holds.
- **FR-028**: The address `/llms.txt` MUST be reserved: operator-authored content (a content
  page) MUST NOT be able to take it.
- **FR-029**: `llms.txt` MUST reflect the current configuration on the same terms as `robots.txt`
  (FR-010, FR-020, FR-022 applied to it). *(Added 2026-10-12, with slice 5:)* One case departs
  from FR-022's "serve the last version it knew", on purpose. When the platform answers that the
  channel's stored *Default robots* — or its stored additional content — cannot be read, the
  storefront answers `/llms.txt` with a temporary failure **even when it holds an earlier
  version**. That answer is a statement about the configuration as it is now, not a failure to
  ask, and the earlier version may be exactly what is wrong: the unreadable value may be an
  attempt to take the channel out of search. Publishing an invitation on a channel that may be
  non-indexable is the worse error (FR-027). When the platform cannot be asked at all, FR-022
  applies unchanged and the last version is served.

#### When SEO is off

- **FR-030**: When the `seo` module is not effectively present, the storefront MUST behave as if
  this feature did not exist: no *Default robots* policy is applied to any document, no robots
  response header is added, `robots.txt` is the system-generated rules alone, and `/llms.txt`
  answers as not found.
- **FR-031**: `robots.txt` MUST remain available, with the system-generated rules, in every state
  of the `seo` module — present, switched off, unavailable on the platform, or never installed.
  The system-generated rules belong to the storefront and are not withdrawn with the module.
- **FR-032**: While `seo` is off, its three settings MUST NOT be editable, their previews
  (FR-038 – FR-045) MUST NOT be offered, and they MUST NOT be offered in the command palette; their stored values MUST be preserved and MUST be in force again, with
  no repair step, as soon as the module is switched back on.
- **FR-033**: The operator MUST be told that switching the `seo` module off withdraws the
  *Default robots* policy and the custom `robots.txt` and `llms.txt` content, so that an operator
  relying on `NOINDEX` learns the consequence before the switch rather than from a search result.
  The statement MUST appear in the module's description on the platform modules screen, where the
  switch is, in English; and in the description of the module's activation setting on the
  Settings screen, in English and in Polish. *(Changed by ruling R7: this requirement first asked
  for English and Polish at the switch itself, which that screen cannot show; translatable module
  descriptions there are a separate, platform-wide change.)*
- **FR-034**: The module's off-state verification MUST cover this feature in the
  switched-off-while-available case specifically: pages, `robots.txt`, `/llms.txt`, the response
  header, the editability of the settings and the absence of their previews while off, and their full restoration when switched
  back on.

#### Relation to the existing indexability rule

- **FR-035**: Every storefront page MUST continue to declare, in its own source, whether it is
  indexable, and the existing static verification of those declarations and of the sitemap MUST
  keep its present meaning and verdicts whatever value *Default robots* holds. The setting is a
  channel-wide policy applied on top of a page's classification; it is never a substitute for
  one. A page that declares nothing remains a defect even on a platform whose default is
  `NOINDEX`.
- **FR-036**: The protection of private pages (account, cart, checkout, sign-in and similar) MUST
  NOT rely on this feature in any state. With `seo` off, with the default at `INDEX, FOLLOW`, and
  with any custom instructions, those pages are exactly as non-indexable as they are today.

#### Documentation

- **FR-037**: The `seo` module's documentation page MUST describe the three settings, how the
  default combines with a page's own declaration, why `NOINDEX` does not close `robots.txt`, what
  `robots.txt` and `llms.txt` contain and in what order, what happens when the module is off, and
  how long search engines take to act on a change. It MUST also state the two limits of the
  feature: that media and public API responses served from the backend's address are not covered
  by a non-indexable default (FR-014), and that a channel can briefly serve indexable pages when
  the setting cannot be read and no earlier value is known (FR-017). The operator-facing
  documentation MUST be available in English and in Polish.

#### Preview in the Admin UI

Required by the owner on 2026-10-11 (ruling R4). The shape — a preview beside the field, rather
than a field pre-filled with the system-generated rules — is a recommendation (A9).

- **FR-038**: Beside *Custom robots.txt instructions*, the Admin UI MUST show a preview of the
  `robots.txt` the selected sales channel's storefront serves: the system-generated rules followed
  by the custom instructions, in the order and form in which they are served. The two parts MUST
  be distinguishable at a glance, by more than colour alone, and the system-generated part MUST
  NOT be editable.
- **FR-039**: The preview MUST follow the text in the field as the operator edits it, before
  saving. While it shows unsaved text it MUST say that what is shown is not yet served. Previewing
  MUST NOT change what the storefront serves.
- **FR-040**: The preview MUST be per sales channel. It MUST show the custom instructions that
  resolve for that channel (its own value, else the all-channels value, else none) and that
  channel's own sitemap line. When the operator edits the all-channels value, the preview MUST
  show the result for one channel the operator chooses and MUST name the channels that hold a
  value of their own and are therefore unaffected.
- **FR-041**: The system-generated rules shown in the preview MUST be the rules that channel's
  storefront actually serves. They are owned by the storefront (FR-031) and MUST NOT be restated
  in, or remembered by, the Admin UI or the backend as a second copy. How the Admin UI obtains
  them is for the plan; the constraint is that there remains exactly one statement of them.
- **FR-042**: When the system-generated rules for a channel cannot be obtained — the storefront
  does not answer, or its address is not known — the preview MUST say so, MUST still show the
  operator's own part, MUST NOT present an invented, remembered or example system part as
  current, and MUST NOT prevent saving.
- **FR-043**: On a sales channel whose *Default robots* forbids indexing, the preview MUST state
  in words that `robots.txt` deliberately stays open to crawlers and why (FR-015), so that an
  operator who expected to see a site-wide ban is not left believing the setting failed. Where
  the operator's own text contains a site-wide ban on such a channel, the preview SHOULD point out
  that it prevents crawlers from reading the `noindex`.
- **FR-044**: Beside *Additional llms.txt content*, the Admin UI MUST show a preview of that
  channel's `llms.txt` on the same terms as FR-038 – FR-042, the generated base taking the place
  of the system-generated rules. On a channel whose *Default robots* forbids indexing it MUST say
  instead that no `llms.txt` is served for that channel (FR-027).
- **FR-045**: The previews MUST be available to every administrator who may see the settings,
  including one who may not change them, and MUST be available in English and in Polish. They
  show nothing that is not already public on the storefront.

### Key Entities

- **Default robots policy** — one of four values, held per sales channel with an all-channels
  value and a default. It is configuration, not a business record: it has no identity of its own
  and no history beyond the audit trail.
- **Custom `robots.txt` instructions** — free text, held per sales channel on the same terms,
  empty by default.
- **Additional `llms.txt` content** — free text, held per sales channel on the same terms, empty
  by default.
- **Route declaration** (existing, unchanged) — a page's own statement of whether it is
  indexable; the input the default policy is combined with, and never an output of this feature.
- **System-generated `robots.txt` rules** (existing, unchanged in content) — the closed address
  families and the sitemap line; storefront-owned and present in every state of the `seo`
  module.

No new kind of stored record is expected: all three values are settings. Whether that holds is
for the plan to confirm.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator with no developer access can take a sales channel out of search engine
  indexing in under two minutes, from opening the Admin UI to saving.
- **SC-002**: Within five minutes of that save, with the backend answering, 100% of the documents
  the storefront serves on that channel — sampled across every kind of page the storefront has —
  tell crawlers not to index them, and no rebuild, redeploy or restart has taken place.
- **SC-003**: On a channel set to `NOINDEX`, `robots.txt` still allows crawlers to fetch the
  site's public pages: the system-generated rules are identical to those of an indexable channel.
- **SC-004**: Across every value of *Default robots* and any custom instructions, zero pages that
  declare themselves non-indexable are served as indexable.
- **SC-005**: With all three settings at their defaults, every page and `robots.txt` are
  equivalent to what the storefront served before this feature — zero differences in what a
  crawler is told.
- **SC-006**: An operator can add, change and remove custom `robots.txt` instructions and see
  each change served within five minutes, and one reset action returns the file to the
  system-generated rules.
- **SC-007**: With the `seo` module switched off, zero observable traces of this feature remain
  on the storefront, and after switching it back on 100% of the previously saved configuration
  is in force without re-entry.
- **SC-008**: Every setting name and description of this feature is readable in English and in
  Polish on the Settings screen, with no untranslated key or other-language text shown to an
  administrator; the four *Default robots* choices are language-neutral directive tokens (R8).
- **SC-009**: Both public demo instances can be configured as non-indexable using the product
  alone — no code change, no custom build and no proxy rule. (Performing that configuration is an
  operational follow-up, not part of this feature.)
- **SC-010**: An operator can tell what a sales channel's `robots.txt` will contain before saving,
  from the Admin UI alone: in a comparison of the preview with the file the storefront then
  serves, the two are identical in every case where the preview showed the system-generated
  rules.
- **SC-011**: No customer-facing page is ever answered with a failure because the *Default
  robots* setting could not be read: with that read made to fail, 100% of pages are still served.

## Assumptions

Each of these is a recommendation applied as a default, not an owner ruling, unless it names one.
On 2026-10-11 the owner accepted them as written ("the rest as recommended") with one exception,
A9, which was overturned and is rewritten below. Any of them can still be overturned without
invalidating the rest of the specification unless it says otherwise.

- **A1 — Scope is the sales channel.** The platform's analogue of Magento's `[website]` scope is
  the sales channel, and the settings store already resolves per-channel values. *Rejected*: a
  single platform-wide value (cannot keep one channel private while another is live); a
  per-language or per-page value (see *Out of scope*).
- **A2 — The default is `INDEX, FOLLOW`.** It preserves today's behaviour on upgrade and matches
  Magento. *Rejected*: defaulting a fresh installation to `NOINDEX` — it protects a demo by
  default but silently hides every real shop whose operator did not know to change it, which is
  the more expensive mistake.
- **A3 — The setting restricts, never loosens** (FR-012, FR-013). Magento's dropdown is a default
  that a page may override in either direction; here the only override that exists is a page's
  own non-indexable declaration, and treating the setting as able to loosen it would turn a
  configuration field into a way to publish account and checkout pages.
- **A4 — `NOINDEX` does not close `robots.txt`** (FR-015), for the reason given there.
- **A5 — The directive also travels as a response header** (FR-014), because a non-document
  resource has no place to carry it otherwise.
- **A6 — `robots.txt` is system-generated rules plus appended operator text** (FR-018). Magento
  lets the operator replace the whole file; here the system-generated rules are a mirror of the
  pages' own declarations and exist to save crawl budget, so they are not the operator's to
  delete. An operator who needs to re-open one of those families can do so with a later rule in
  their own text, and FR-023 keeps that from affecting indexing.
- **A7 — Operator text is served verbatim and is not validated for syntax.** Magento does not
  validate it either, the format is tolerant by design, and a validator would have to be kept
  current with every crawler's extensions. Only size is limited (FR-006).
- **A8 — The settings live on the generic Settings screen** and are changed with the existing
  settings permission, which is what the owner asked for ("a setting in the Settings module,
  defined by the `seo` module"). *Rejected*: a dedicated panel on the `seo` module's own screen,
  which would put them behind the catalog-editing permission that screen uses today and split
  SEO configuration across two places. Two consequences follow and are requirements rather than
  assumptions: the Settings screen must be able to edit multi-line text (FR-004), and it must be
  able to show a setting's name and description in the administrator's language (FR-008) — it
  does neither today.
- **A9 — The preview is a preview, not a pre-filled field** (FR-038 – FR-043). *This replaces
  the original A9, "no preview", which the owner overturned on 2026-10-11 (ruling R4).* The owner
  offered two shapes and left the choice open: a field pre-filled with the system-generated rules
  that the operator may freely overwrite, or a preview showing the system rules mixed with the
  operator's own. This specification applies the second, as a recommendation the owner can still
  overturn. *Rejected, with the reason checked against the tree*: the pre-filled, overwritable
  field. (1) The system-generated rules are written in the storefront as a mirror of its own
  private route families (`storefront/app/robots.ts`, whose own comment calls them that), so
  they change whenever a release adds such a family; a copy an operator once saved does not, and
  a new private family is then silently left open to crawlers on every shop that ever touched the
  field. (2) *Reset* would become the only way to receive new rules, and nothing would tell the
  operator when to use it. (3) The Admin UI and the backend would have to hold their own
  statement of rules the storefront owns, to pre-fill the field — a second copy of one fact, in a
  product whose storefront is installable and upgradeable separately from its backend. One part
  of the argument as first put does **not** hold and is not relied on: it is not true that a
  separately hosted backend cannot know the rules — it holds each channel's storefront address
  and can ask. What it cannot do is keep a copy that stays true. If the owner prefers the
  pre-filled field after all, A6, FR-005, FR-018, FR-031, FR-041 and the last item of *Out of
  scope* are the ones that change.
- **A10 — `llms.txt` follows the `robots.txt` shape** — a generated base plus appended operator
  text — and is withdrawn on a channel whose default forbids indexing (FR-027). The first half is
  settled by ruling R1; the second is an assumption: the two demo instances are the motivating case, and an
  instance that asks search engines to stay away should not, by default, publish an invitation to
  AI assistants. *Rejected*: making `llms.txt` independent of *Default robots* — coherent, but it
  gives the demos a second switch to forget.
- **A11 — The sitemap and canonical addresses are unaffected** (FR-016), for the reasons in *Edge
  Cases*.
- **A12 — The five-minute bound** (FR-010) is the backstop the storefront already uses for
  configuration it reads from the backend; under normal operation a change is expected within
  seconds. The plan may tighten it; it may not loosen it.
- **A13 — The storefront reads the configuration from the backend over its public API**, like
  every other piece of channel configuration it uses, and the `seo` module is what answers. The
  shape of that exchange is for the plan and its contract.
- **A14 — The system-generated rules stay storefront-owned** (FR-031). They are derived from the
  storefront's own route families; moving them into the `seo` module would make the storefront's
  `robots.txt` disappear, or fall back to "everything allowed", whenever the module is off.
- **A15 — `llms.txt` gets the same preview as `robots.txt`** (FR-044). **No longer an
  assumption: the owner ruled it on 2026-10-11 (R10).** As first written: the owner asked for the
  `robots.txt` preview only. The two fields sit side by side and behave identically; a preview on
  one and not the other would read as a defect. *Rejected*: previewing `robots.txt` alone — less
  work, and the cheaper choice if `llms.txt` is delivered later than the rest.
- **A16 — The preview needs the storefront to be reachable, and degrades when it is not**
  (FR-042). The alternative that never degrades is a copy of the rules held next to the Admin UI,
  which is what A9 rejects.

## Out of scope

- **Per-page, per-product, per-category or per-entity robots overrides.** The `seo` module's
  meta-tag overrides do not carry a robots directive today, and adding one is a separate feature.
- **Loosening a page's own declaration from configuration** — making an account, cart or checkout
  page indexable — in any form.
- **The admin application**, which already tells crawlers `noindex, nofollow` and is not served
  per sales channel.
- **Configuring the demo instances.** Once this feature is released, setting both demos to a
  non-indexable default is an operational step, tracked separately.
- **Removing already-indexed pages from search engines.** The feature controls what the
  storefront says; removal requests to a search engine are the operator's.
- **Per-crawler configuration fields** (a list of AI crawlers to refuse, a crawl-delay field).
  The custom instructions field is how an operator expresses these.
- **An environment-level override** (for example "every non-production deployment is
  non-indexable"). The operator's setting is the one control.
- **Replacing or editing the system-generated `robots.txt` rules** from the Admin UI. They are
  shown in the preview and are read-only there.
- **A non-indexable default on backend-served media and public API responses** (owner ruling R2).
  A possible follow-up if the demo instances show that it matters.
- **Further robots variants** — `noarchive`, `nosnippet`, `noimageindex`, snippet-length limits
  (owner ruling R3).

## Owner rulings

Given on 2026-10-11, in the owner's words (translated from Polish): *"In the admin there should
be a preview of the resulting robots.txt. So either we make the form field pre-filled by default
with the system instructions, which can be freely overwritten, or a preview window showing the
mix of system instructions with our own. The rest as recommended."* That answer is R1 – R5; a
second answer the same day, on the five decisions the plan raised, is R6 – R10 and is quoted
under its own heading below. The rejected alternative is kept beside each ruling as provenance.
No question remains open; one choice inside R4 is a recommendation rather than a ruling.

- **R1 (was Q1) — The `llms.txt` base is generated, and the operator's content follows it**
  (FR-024 – FR-026). *Rejected*: a file that is entirely the operator's and is not served while
  empty — smaller, and no judgement by the platform about what belongs in the file, but most
  shops would then never have one.
- **R2 (was Q2) — A non-indexable default covers the storefront's own responses only** (FR-014).
  Media and public API responses served from the backend's address are documented as not covered
  (FR-037); product images of a non-indexable channel can therefore still appear in image search
  if their addresses are discovered. *Rejected for this feature, possible as a follow-up*:
  requiring the backend to send the same directive on public media and API responses — closer to
  what "the demo is not in Google" means, but it reaches into modules other than `seo` and needs
  a rule for media shared by an indexable and a non-indexable channel.
- **R3 (was Q3) — *Default robots* offers the four Magento combinations and nothing else**
  (FR-002). *Rejected*: independent switches for `noarchive`, `nosnippet`, `noimageindex` or
  snippet-length limits — honoured unevenly, not needed by the motivating case, and addable later
  because each is one more restriction combined the same way as FR-012.
- **R4 — A preview of the resulting `robots.txt` in the Admin UI is required.** This overturns
  the original assumption A9. The owner named two acceptable shapes and did not choose between
  them; the choice applied here, and its reasons, are in A9, and the requirements are FR-038 –
  FR-045.
- **R5 — A page is never failed because the default could not be read** (FR-017). Raised with
  the owner as a recommendation and covered by "the rest as recommended". The first draft of this
  specification answered a page with a temporary failure when the default could not be determined
  and no earlier value was known, which traded the shop's availability for a crawler's
  correctness. *Rejected*: that first draft; and failing closed to `NOINDEX`, which would tell
  search engines to drop a live shop's pages during a backend fault. `robots.txt` and `llms.txt`
  keep the fail-closed answer (FR-022), since no customer reads them.

### Rulings on the plan's five decisions

Given later on 2026-10-11, in the owner's words (translated from Polish): *"Do it with the
recommendations."* — in reply to the five decisions `plan.md` left for the owner (tagged OD1 – OD5
in `tasks.md`). Where a ruling changed a requirement — FR-008, FR-009 and FR-033 — the
requirement has been reworded to match, and says in its own text what the ruling changed.

- **R6 (OD1, plan D2) — The palette entry for this configuration is offered to every
  administrator who may *see* settings, not only to those who may change them.** FR-009 now says
  so: such an administrator lands on a read-only view with the previews (FR-045).
  *Rejected*: offering it only to those who may change settings — the entry's target is the
  Settings screen, which is gated by the read permission, so a stricter palette gate would
  disagree with the route it opens and would need a new, write-gated settings route.
- **R7 (OD2, plan D3) — The warning that switching SEO off withdraws the default robots policy
  is English-only on the platform modules screen**, and is in English and Polish on the
  `seo.enabled` setting's row of the Settings screen. FR-033 now states the two places and their
  languages. Translatable module descriptions on the platform modules screen are to be filed
  as a separate, platform-wide change. *Rejected for this feature*: making that screen translate
  module descriptions as part of this work.
- **R8 (OD3, plan D4) — The four *Default robots* choices are shown as the directive tokens
  themselves, untranslated; their meaning is in the translated description.** FR-008 now says
  so. *Rejected*:
  translated choice labels, which would make the stored values machine tokens and add a third
  generic change to the Settings screen for one user.
- **R9 (OD4) — The *Default robots* row also tells the operator when the channel's storefront is
  too old to apply the setting**, in the slice that delivers the preview. *Rejected*: showing
  that notice only beside the two text settings, which leaves an operator of an older instance
  able to believe a shop is kept out of search when it is not.
- **R10 (OD5) — `llms.txt` gets the same preview as `robots.txt`.** Assumption A15 is now a
  ruling (FR-044). *Rejected*: previewing `robots.txt` alone.

## Constraints from the constitution and the conventions

Recorded so the plan starts from them; none is decided here beyond what the requirements say.

- **VII (SEO, performance)** — `robots.txt` stops being fixed at build time (FR-021); pages must
  stay server-rendered. The storefront's documents are already rendered per request, so the
  default policy costs no page its rendering mode; the plan confirms this per route.
- **XII (sales-channel scoping)** — the policy and both texts are channel-scoped reads and
  resolve through the request's channel, failing closed to the system-default channel's
  configuration, never to "no policy" (FR-003, FR-020).
- **XIII (write auditing)** — changes are audited (FR-007). The settings store audits its value
  writes itself rather than through the Command Bus today; this feature adds no new write path
  and inherits that, and the plan states so in its Constitution Check.
- **XVI (command palette)** — `seo` has an admin surface and declares no palette action today.
  FR-009 requires this configuration to be reachable from the palette; whether the same change
  also gives the module's existing screen its missing entry is for the plan.
- **I (modular architecture)** — the preview (FR-038 – FR-045) sits beside settings that the
  `settings` module's screen renders, and it is about `seo`'s settings and the storefront's
  output. The `settings` module must not come to know what `robots.txt` is in order to show it,
  and the preview must vanish with `seo` (FR-032). How a module contributes something beside its
  own setting on that screen is new, and is the plan's largest open design point after FR-041.
- **Separately installable components** — the storefront is installable and upgradeable apart
  from the backend and the Admin UI, and it owns the system-generated rules. The preview
  (FR-041) therefore has to show another component's output without copying it, across what may
  be different hosts and different versions; the backend already holds each sales channel's
  storefront address, with a fallback when none is configured, which FR-042 has to survive.
- **XVII (module off means absent)** — User Story 4 and FR-030 – FR-034. The module's lifecycle
  dependencies (`auth`, `catalog`, `cms`) mean a platform that runs without `catalog` or `cms`
  cannot have `seo`, and therefore cannot use this feature to keep itself out of search engines.
- **i18n convention** — names, descriptions and choice labels in English and Polish (FR-008). The
  generic Settings screen shows a setting's declared name and description untranslated today, so
  meeting FR-008 on that screen is new work rather than a matter of adding keys.
- **Reference storefront** — the storefront in this repository is the template client instances
  are scaffolded from; an instance scaffolded before this feature keeps its own `robots.txt`
  until it takes the change through the instance upgrade path.
- **Documentation and release intent** — the module's documentation page changes with the module
  (FR-037), and the packages this feature touches publish a change that needs release intent.
