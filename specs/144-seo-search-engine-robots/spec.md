# Feature Specification: Search engine robots — default page robots, `robots.txt` instructions and `llms.txt`, configured by the operator

**Feature Branch**: `spec/seo-search-engine-robots` (spec directory `specs/144-seo-search-engine-robots/`)
**Created**: 2026-10-11
**Status**: Draft — three questions are open for the owner (see *Open questions for the owner*);
every other decision below is an assumption the owner can overturn
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
system-generated rules followed by the operator's text. If the operator regrets it, *reset to
default* removes their text and the file is the system-generated rules again.

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
   **Then** a generated base is served: the shop's name and its main public entry points. (This
   is the recommended answer to open question Q1; under the alternative, nothing is served until
   the operator writes something, and scenarios 2 and 5 lose their "generated base".)
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

---

### User Story 4 — With SEO switched off, the storefront behaves as if this feature did not exist (Priority: P2)

A deployment operator or a business operator switches the `seo` module off. The storefront keeps
serving a valid `robots.txt` — the system-generated one, as today — but nothing this feature adds
remains: no default robots policy is applied, no custom instructions are appended, no `llms.txt`
is served, and the settings are not editable. Switching the module back on restores everything
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
   cannot be edited, and their stored values have not been deleted.
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

- **The configuration cannot be read** (the backend is slow, unreachable or answers an error
  while a page or `robots.txt` is being produced). The storefront must not guess in either
  direction: answering as if the channel were indexable would expose a demo to indexing, and
  answering as if it were not would tell crawlers to drop a live shop's pages. It answers with
  the last value it knew, and where it knows none, with a temporary-failure response rather than
  a successful one built on a guess. This is deliberately different from how the storefront
  treats an unreadable module-presence answer (everything counts as present): there the cost of
  failing closed is an empty shop, here the cost of guessing is a wrong instruction to a search
  engine that takes weeks to undo.
- **A page that is both non-indexable by declaration and on an indexable channel.** The page's
  own declaration wins. The setting is never consulted as a way to loosen it.
- **`NOINDEX` combined with a site-wide crawl ban.** An operator may write `Disallow: /` in the
  custom instructions on a channel whose default is `NOINDEX`. That is their instruction and it is
  served; the documentation and the setting's description say why it defeats the purpose — a
  crawler that may not fetch a page never sees its `noindex`, and an address linked from
  elsewhere can then still appear in results.
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
  default. A value outside the list MUST be refused. [NEEDS CLARIFICATION: Q3 — the owner's
  words were "or other relevant variants". The recommended answer is these four and no others in
  this feature; see *Open questions for the owner*.]
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
- **FR-008**: The name and the description of each setting, and the label of each *Default
  robots* choice, MUST be available in English and in Polish. The descriptions MUST state the
  consequence an operator needs before choosing: for *Default robots*, that it adds restrictions
  and never makes a private page indexable, and that search engines act on it only when they next
  fetch a page; for *Custom robots.txt instructions*, that the text is appended to the
  system-generated rules and that forbidding crawling does not remove pages from search results.
- **FR-009**: The configuration MUST be reachable from the admin command palette by an
  administrator who is allowed to change it, and MUST NOT be offered there to one who is not.
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
- **FR-015**: A non-indexable *Default robots* MUST NOT change `robots.txt` into a site-wide ban
  on crawling, and MUST NOT alter the system-generated rules in any way. **Reason**: `robots.txt`
  governs fetching and the page directive governs indexing; a crawler has to be allowed to fetch
  a page in order to read that it must not be indexed, and a page that may not be fetched can
  still be listed in results from links elsewhere.
- **FR-016**: *Default robots* MUST NOT change the sitemap, a page's canonical address or its
  structured data.
- **FR-017**: When the storefront cannot determine a channel's *Default robots*, it MUST NOT
  answer successfully with a directive it guessed. It MUST use the last value it knew, and where
  it knows none, answer with a temporary failure.

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
  later" rather than as permission.
- **FR-023**: Whether a page may be indexed MUST NOT depend on `robots.txt`. No custom
  instruction, however written, may cause a page that declares itself non-indexable to be served
  as indexable.

#### `llms.txt`

- **FR-024**: The storefront MUST serve an `llms.txt` at the root of each sales channel's
  address, as plain text, composed of a generated base followed by the channel's additional
  content. [NEEDS CLARIFICATION: Q1 — whether a base is generated at all, or the file is entirely
  the operator's and absent while empty. FR-025 and FR-027 assume the recommended answer, a
  generated base.]
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
  (FR-010, FR-020, FR-022 applied to it).

#### When SEO is off

- **FR-030**: When the `seo` module is not effectively present, the storefront MUST behave as if
  this feature did not exist: no *Default robots* policy is applied to any document, no robots
  response header is added, `robots.txt` is the system-generated rules alone, and `/llms.txt`
  answers as not found.
- **FR-031**: `robots.txt` MUST remain available, with the system-generated rules, in every state
  of the `seo` module — present, switched off, unavailable on the platform, or never installed.
  The system-generated rules belong to the storefront and are not withdrawn with the module.
- **FR-032**: While `seo` is off, its three settings MUST NOT be editable and MUST NOT be offered
  in the command palette; their stored values MUST be preserved and MUST be in force again, with
  no repair step, as soon as the module is switched back on.
- **FR-033**: The description of the `seo` module's activation control MUST state, in English and
  in Polish, that switching the module off withdraws the *Default robots* policy and the custom
  `robots.txt` and `llms.txt` content, so that an operator relying on `NOINDEX` learns the
  consequence before the switch rather than from a search result.
- **FR-034**: The module's off-state verification MUST cover this feature in the
  switched-off-while-available case specifically: pages, `robots.txt`, `/llms.txt`, the response
  header and the editability of the settings while off, and their full restoration when switched
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
  how long search engines take to act on a change. The operator-facing documentation MUST be
  available in English and in Polish.

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
- **SC-002**: Within five minutes of that save, 100% of the documents the storefront serves on
  that channel — sampled across every kind of page the storefront has — tell crawlers not to
  index them, and no rebuild, redeploy or restart has taken place.
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
- **SC-008**: Every setting name, description and choice of this feature is readable in English
  and in Polish, with no untranslated key or other-language text shown to an administrator.
- **SC-009**: Both public demo instances can be configured as non-indexable using the product
  alone — no code change, no custom build and no proxy rule. (Performing that configuration is an
  operational follow-up, not part of this feature.)

## Assumptions

Each of these is a recommendation applied as a default, not an owner ruling. Any of them can be
overturned without invalidating the rest of the specification unless it says otherwise.

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
- **A9 — No preview of the effective `robots.txt` in the Admin UI.** The file is public; opening
  it on the storefront is the preview. A preview pane can follow if operators ask for one.
- **A10 — `llms.txt` follows the `robots.txt` shape** — a generated base plus appended operator
  text — and is withdrawn on a channel whose default forbids indexing (FR-027). The first half is
  open as Q1; the second is an assumption: the two demo instances are the motivating case, and an
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
- **Replacing or editing the system-generated `robots.txt` rules** from the Admin UI.

## Open questions for the owner

At most three are left open, by the specification convention; each carries a recommended answer,
and the specification is written as if the recommendation were accepted.

- **Q1 — Is the `llms.txt` base generated, or is the file entirely the operator's?**
  *Recommended: generated base plus operator content* (FR-024 – FR-026), mirroring `robots.txt`.
  It gives every shop a correct file with no effort, and Constitution VII already names LLM
  crawlers as an audience the storefront serves. *Alternative*: the file is entirely
  operator-authored and is not served while empty — smaller, no judgement by the platform about
  what belongs in the file, but most shops would then never have one. Under the alternative,
  FR-025 is dropped and FR-024 reads "served only when the channel has content".
- **Q2 — How far does a non-indexable default reach beyond the storefront's own address?**
  A shop is usually served from more than one address: the storefront, and the backend that
  answers the public API and may serve product images and other media. This specification covers
  everything the storefront serves (FR-014). *Recommended: stop there in this feature*, and state
  in the documentation that media and API addresses on another host are not covered. Product
  images of a non-indexable channel could then still appear in image search if their addresses
  are discovered. *Alternative*: also require the backend to send the same header on public media
  and API responses for a non-indexable channel — closer to what "the demo is not in Google"
  means, but it reaches into modules other than `seo` and needs a rule for media shared by an
  indexable and a non-indexable channel. [NEEDS CLARIFICATION: Q2 — recommended answer: the
  storefront's own responses only; backend-served media as a follow-up if the demos show it
  matters.]
- **Q3 — Which "other relevant variants" does *Default robots* offer?** *Recommended: the four
  Magento combinations and nothing else* (FR-002). They are the two directives every search
  engine honours; the rest (`noarchive`, `nosnippet`, `noimageindex`, snippet-length limits) are
  honoured unevenly, multiply the choices, and are not needed by the motivating case.
  *Alternative*: add independent switches for some of them — additive later, since each is
  another restriction combined the same way as FR-012.

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
