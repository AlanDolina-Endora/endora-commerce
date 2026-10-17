# Feature Specification: Page Builder "Translate" action

**Feature Branch**: `feat/151-page-builder-translate`
**Created**: 2026-10-17
**Status**: Clarified — the owner answered every open question on 2026-10-17 (see *Clarifications*)
**Input**: Product owner's request (Polish, verbatim): "Dodać dodatkowy element w Page Builder,
który dodaje przycisk `Przetłumacz`. Kliknięcie na przycisk uruchamia tłumaczenie zawartości
edytowanej w Page Builder na aktualnie edytowany język. Do tłumaczenia wykorzystywany jest model,
którego Poświadczenia są ustawione dla tej funkcji w sekcji Ustawień (Settings) Page Buildera.
Również powinna być możliwość włączania/wyłączania tej funkcji Page Builder w sekcji Settings."

English: add a **Translate** button to the Page Builder. Clicking it translates the content being
edited in the Page Builder into the language currently being edited. The translation uses a model
whose Credentials are configured for this function in the Page Builder section of Settings. The
function can be switched on and off in Settings.

## Context

Content edited in the Page Builder is stored **once per content language**: a page, a block or a
template carries a separate canvas for every language it is published in, and the editor shows one
language tab at a time. Today the only help an editor gets when filling a second language is
**Copy from language**, which duplicates another tab's canvas verbatim; every text on it then has
to be retyped by hand. This feature closes that gap with a machine translation of the canvas,
performed by a language model the operator has chosen and paid for.

The platform already stores reusable model credentials (provider, model, API key) on the
**Credentials** screen, and already lets a setting point at one of them. This feature adds such a
setting to the Page Builder's settings group, beside an on/off switch.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Translate the canvas into the language being edited (Priority: P1)

A content editor opens a page in the Page Builder on its **English** tab. The canvas holds the
Polish text they copied there from the Polish tab (or wrote in Polish by mistake). They click
**Translate**, confirm, and after a short wait every piece of text on the canvas — headings,
paragraphs, button labels, list items, image descriptions — is in English. Layout, styles, images,
links and every other setting of every block are exactly as they were. Nothing is saved yet: the
editor reads the result, fixes what they want, and saves as usual.

**Why this priority**: it is the whole request. Without it nothing else in this feature has value.

**Independent Test**: with the function switched on and a working model configured, open a page
whose English canvas holds Polish text in five different kinds of blocks, click Translate, and
verify that every text is English, that nothing but text changed, and that leaving without saving
leaves the stored page unchanged.

**Acceptance Scenarios**:

1. **Given** the function is on and configured and the editor may use it, **When** the editor opens
   any content in the Page Builder on a language tab, **Then** a **Translate** button is shown in the
   Page Builder toolbar beside **Copy from language**.
2. **Given** a canvas with text in any language, **When** the editor clicks Translate and confirms,
   **Then** every translatable text on the canvas is replaced by its translation into the tab's
   language and the editor is told how many texts were translated.
3. **Given** a translated canvas, **When** the editor compares it with the canvas before, **Then**
   block order, nesting, layout, styles, colours, spacing, images, link targets, product and
   category references, embedded block codes and visibility settings are identical.
4. **Given** a translated canvas, **When** the editor leaves without saving, **Then** the stored
   content is unchanged; **When** they save, **Then** the translated content is stored exactly as
   any manual edit would be.
5. **Given** formatted text (bold, italic, links, lists, headings inside rich text), **When** it is
   translated, **Then** the formatting is kept on the corresponding words of the translation and
   every link still points where it pointed before.
6. **Given** a translation in progress, **When** the editor waits, **Then** they see that the
   translation is running, the button cannot be clicked again, and they can cancel it, which
   leaves the canvas untouched.

---

### User Story 2 — Switch the function on and choose its model (Priority: P1)

An administrator opens **Settings**, finds the **Page Builder** group and sees two new entries:
**Translation enabled** and **Translation credentials**. They pick one of the LLM configurations
from the Credentials screen and switch the function on. From the next time an editor opens the
Page Builder, the Translate button is there. Switching it off removes the button again; nothing
else in the Page Builder changes, and no content is touched.

**Why this priority**: the request makes the switch and the per-function credentials explicit
requirements, and an operator must be able to decide whether content leaves the platform for a
third-party model at all.

**Independent Test**: toggle the setting and change the referenced credentials, and verify the
button's presence and the model used, without touching any content.

**Acceptance Scenarios**:

1. **Given** a fresh installation or an upgraded one, **When** nobody has changed the new settings,
   **Then** the function is **off** and no Translate button is shown anywhere.
2. **Given** the function is switched on, **When** no credentials are chosen, or the chosen ones
   were deleted, or they belong to a provider the function cannot use, **Then** the Translate button
   is shown **disabled** with an explanation that the translation model is not configured and where
   to configure it — the editor never reaches a failure only after clicking.
3. **Given** credentials are chosen, **When** an administrator points the setting at different
   credentials, **Then** the next translation uses the newly chosen provider and model without a
   restart.
4. **Given** the function is switched off, **When** any caller asks for a translation anyway,
   **Then** the request is refused with a message saying the function is switched off.
5. **Given** the Credentials function of the platform is switched off as a whole, **When** an
   editor opens the Page Builder, **Then** the Translate button is shown disabled with an explanation
   naming Credentials, and every other Page Builder function works as before.
6. **Given** the settings screen, **When** an administrator reads the two settings, **Then** their
   names and descriptions are available in English and in Polish and say that the page content is
   sent to the chosen model's provider.

---

### User Story 3 — Translate from another language's content (Priority: P2)

The editor is on the **German** tab of a page that has a finished **Polish** version and an empty
German canvas. Instead of copying first and translating second, they open Translate, choose
**Polish** as the source, and get the Polish canvas translated into German on the German tab in one
step.

**Why this priority**: it is the most common real workflow and saves a step, but User Story 1 plus
the existing Copy from language already covers it in two clicks.

**Independent Test**: on a page with a filled Polish tab and an empty German tab, translate from
Polish while on the German tab and verify the German tab holds the translated Polish canvas while
the Polish tab is untouched.

**Acceptance Scenarios**:

1. **Given** content in more than one language, **When** the editor opens Translate, **Then** they
   can choose the source: **the current canvas of this tab** (the default) or **the content of any
   other language tab** of the same content.
2. **Given** another tab is chosen as source, **When** the translation completes, **Then** the
   current tab's canvas is replaced by the translated copy of that tab's content, including its
   unsaved edits, and the source tab is not changed.
3. **Given** the current canvas is not empty and another tab is chosen as source, **When** the
   editor confirms, **Then** they were warned beforehand that the current canvas will be replaced.
4. **Given** the source tab is empty, **When** the editor tries to translate from it, **Then** they
   are told there is nothing to translate and nothing changes.

---

### User Story 4 — Review and undo a translation (Priority: P2)

The translation of a long page came back with a tone the editor does not like. Before saving they
click **Restore previous content** in the translation notice and the canvas is exactly as it was
before they clicked Translate.

**Why this priority**: a model's output is not always acceptable, and the Page Builder's own undo
history does not survive a whole-canvas replacement.

**Independent Test**: translate, then restore, and verify the canvas equals the pre-translation
canvas; translate, edit, save, and verify the restore action is gone.

**Acceptance Scenarios**:

1. **Given** a translation was just applied, **When** the editor chooses Restore previous content,
   **Then** the canvas is exactly the canvas from before the translation, unsaved edits included.
2. **Given** the editor switches tab, saves, or translates again, **When** they look for the restore
   action, **Then** it refers only to the most recent translation on this tab, or is gone after a
   save.
3. **Given** some texts could not be translated (for example the model returned an unusable answer
   for them), **When** the translation is applied, **Then** those texts keep their original wording
   and the editor is told how many were left untranslated.

---

### User Story 5 — Governance: who may translate, where it is found, what is recorded (Priority: P3)

An administrator decides which roles may use machine translation, because it costs money and sends
content to a third party. They grant it in **Admin roles**. Later, an auditor wants to know who sent
which page to which model and when.

**Why this priority**: required for a responsible rollout but not for the first demonstration.

**Independent Test**: with and without the permission, check the button's presence and the
endpoint's answer; perform a translation and find its record in the audit log.

**Acceptance Scenarios**:

1. **Given** an editor whose roles do not include the translation permission, **When** they open the
   Page Builder, **Then** no Translate button is shown, and a direct request is refused.
2. **Given** the role editor, **When** an administrator looks for the permission, **Then** it is
   listed under CMS with a label in English and Polish.
3. **Given** a translation that sent content to the provider, **When** an auditor opens the audit
   log, **Then** there is one entry naming the editor, the time, the content that was translated (type and identifier where it
   is a saved record), the source and target languages, the provider and model, and how many texts
   and characters were sent — and **not** the text itself.
4. **Given** the command palette (⌘K / CTRL+K), **When** an administrator searches for "translate",
   "tłumacz", "AI" or "Page Builder translation", **Then** an entry leads to the settings where the
   function is switched on and its credentials are chosen.

---

### Edge Cases

- **Empty canvas**: Translate is disabled with an explanation; nothing is sent.
- **Canvas with no translatable text** (only images, spacers, product grids): the editor is told
  there is nothing to translate; nothing is sent to the model.
- **A block the platform does not know how to translate** (a block from an extension that declares
  no translatable texts, or a block whose owning module is switched off and renders as a
  placeholder): its content is left untouched and counted in the result notice as "not translated".
- **Text that must not change**: link targets, e-mail addresses, product and category references,
  embedded block and template codes, colours, icon names, custom HTML and custom script blocks,
  and the editor-only block names are never sent and never changed.
- **Placeholders and variables** written inside text (for example `{{customer.firstName}}`) are
  kept verbatim in the translation.
- **The text is already in the target language**: the result is returned unchanged or lightly
  edited by the model; no special handling.
- **Very large content**: above the size the function accepts in one go, the editor is told the
  content is too large to translate at once and nothing is sent.
- **The model provider fails** (wrong key, quota exhausted, rate limit, outage, timeout): the editor
  sees a message naming the cause in plain words, the canvas is unchanged, and they can retry.
- **The model answers but part of the answer is unusable**: usable texts are applied, the rest keep
  their original wording, and the notice says how many were left untranslated (User Story 4, 3).
- **Two editors** translating the same page at once: each works on their own unsaved canvas; the
  existing save conflict protection applies when they save.
- **The content language tab is removed** from the content while a translation is running: the
  result is discarded.
- **The CMS module is switched off**: the Page Builder and its Translate button are gone with it,
  and the translation endpoint answers as for every switched-off module.

## Requirements *(mandatory)*

### Functional Requirements

**Availability and configuration**

- **FR-001**: The platform MUST offer a Page Builder setting that switches the translation function
  on and off platform-wide. Its default MUST be **off**, on fresh installations and upgrades alike.
- **FR-002**: The platform MUST offer a Page Builder setting that references one reusable LLM
  credential configuration from the Credentials screen; it MUST be the only source of the provider,
  model and key the function uses. No key is stored in the setting itself.
- **FR-003**: Both settings MUST appear in the Page Builder group of the Settings screen, with names
  and descriptions in English and Polish; the descriptions MUST state that translated content is
  sent to the provider of the chosen model.
- **FR-004**: A change to either setting MUST take effect for the next translation request and the
  next opening of an editor, without a restart.
- **FR-005**: The function MUST determine, before an editor clicks, whether it is *ready*,
  *switched off*, *not configured* (no reference, a dangling reference, incomplete credentials, or a
  provider it cannot use), or *unavailable* (the Credentials function is switched off), and the
  editor MUST show the button accordingly: absent when switched off, disabled with an explanation in
  the other two non-ready states.
- **FR-006**: The function MUST support the LLM providers OpenAI, Anthropic and Google, **and any
  OpenAI-compatible endpoint** (for example DeepSeek, or a self-hosted or proxy endpoint speaking the
  OpenAI chat-completions protocol), reached through the **Base URL** of the chosen credential
  configuration. The platform's AI assistant MUST gain the same OpenAI-compatible support, from the
  same implementation (FR-043).
- **FR-007**: The Credentials screen MUST offer an **OpenAI-compatible** provider for LLM
  configurations whose Base URL is required, and MUST refuse a Base URL that is not an absolute
  `http` or `https` address for every LLM provider, before it is stored. A DeepSeek configuration
  with no Base URL MUST reach DeepSeek's public endpoint; an OpenAI configuration with a Base URL
  MUST reach that address instead of OpenAI's.

**The Translate action**

- **FR-010**: Every Page Builder canvas in scope MUST show a Translate action in the editor's toolbar
  when the function is ready or configured-but-not-ready, the editor holds the translation permission,
  and the editor knows which language is being edited. The canvases in scope are **every CMS Page
  Builder canvas**: CMS pages, blocks and templates, catalogue category content, blog posts and blog
  categories.
- **FR-011**: The target language MUST be the language of the tab being edited; the editor MUST NOT
  be able to choose another target.
- **FR-012**: The source MUST default to the current canvas of the tab being edited, whose language
  is detected by the model; the editor MAY instead choose the content of any other language tab of
  the same content, in which case that tab's language is the known source language and its
  unsaved edits are included.
- **FR-013**: The action MUST ask for confirmation before sending content, stating the target
  language, the provider and model that will be used, and — when another tab is the source and the
  current canvas is not empty — that the current canvas will be replaced.
- **FR-014**: The translation MUST replace only translatable texts; the structure of the canvas and
  every non-text setting MUST be identical before and after (acceptance scenario US1-3).
- **FR-015**: Translatable texts MUST include the human-readable texts of every block in scope —
  headings, paragraphs, rich text, button labels, list and tab and accordion items, quotes and their
  attribution, statistics labels, table headers and cells, image descriptions (alternative text),
  slide titles and form labels — and MUST exclude links, addresses, codes, references, colours,
  icon names, custom HTML, custom scripts and editor-only block names. **Only the canvas** is
  translated: SEO fields (meta title, description, keywords) and per-language names are not.
- **FR-016**: Formatting inside rich text (bold, italic, underline, links, lists, headings, quotes)
  MUST be preserved on the translated text, and link targets MUST be unchanged.
- **FR-017**: Placeholders written inside text in double braces MUST be preserved verbatim.
- **FR-018**: The result MUST be applied to the canvas as an **unsaved** change; nothing is stored
  until the editor saves through the editor's existing save action.
- **FR-019**: After applying, the editor MUST be told how many texts were translated and how many
  were left untranslated, and MUST be offered a way to restore the canvas exactly as it was before
  the translation, available until the next save, translation or tab change.
- **FR-020**: Texts the model did not return usably MUST keep their original wording; a translation
  in which some texts fail MUST NOT be rejected as a whole.
- **FR-021**: The editor MUST be able to cancel a translation in progress; a cancelled translation
  MUST leave the canvas unchanged.
- **FR-022**: A canvas with no translatable text MUST NOT be sent to the model, and the editor MUST
  be told there is nothing to translate.
- **FR-023**: Content above the size limit for one translation MUST be refused before anything is
  sent, with a message saying the content is too large to translate at once.
- **FR-024**: A failure of the model provider MUST leave the canvas unchanged and produce a message
  that distinguishes at least: invalid credentials, quota or rate limit, provider unreachable or
  too slow, and an unusable answer.
- **FR-025**: A block whose texts the platform does not know how to translate MUST be left untouched
  and reported in the result as not translated.

**Governance**

- **FR-030**: Using the translation MUST require a dedicated permission, listed under CMS in the
  role editor with an English and a Polish label; an editor without it sees no Translate action and
  is refused if they call the function directly.
- **FR-031**: Every translation attempt in which content was sent to the provider — completed,
  partly completed or failed — MUST leave one audit entry carrying the actor, the time, the content
  type and identifier when the content is a saved record, the source language (or "detected"), the
  target language, the provider and model, the number of texts and characters sent and the outcome —
  and MUST NOT carry the content itself or any secret. An attempt refused before sending (switched
  off, not configured, too large) leaves no entry.
- **FR-032**: The command palette MUST offer an entry, findable in English and Polish, that leads to
  the settings of the translation function.
- **FR-033**: Every user-facing string the feature adds MUST be available in English and Polish.
- **FR-034**: The module documentation MUST describe the function, its settings, its permission and
  the fact that content is sent to a third party, in English and Polish.

**Module presence**

- **FR-040**: With the CMS module switched off, the translation function MUST be absent exactly like
  the rest of the module.
- **FR-041**: With the Credentials module switched off, the CMS module and the Page Builder MUST keep
  working; only the translation MUST report itself unavailable (US2-5).
- **FR-042**: The platform's AI assistant MUST behave exactly as before this feature for every
  credential configuration it could already use (OpenAI, Anthropic, Google without a Base URL).
- **FR-043**: The platform's AI assistant MUST additionally accept DeepSeek and OpenAI-compatible
  credential configurations and an OpenAI configuration's Base URL, through the same
  implementation the translation uses; a configuration whose Base URL is missing (where required)
  or invalid MUST make the assistant report itself not configured, as today.

### Key Entities

- **Translation settings** — two Page Builder settings: the on/off switch and the reference to one
  LLM credential configuration. Platform-wide, not per sales channel.
- **Translation request** — what the editor sends: the canvas to translate, the target language,
  optionally the known source language, and optionally which saved content it belongs to.
- **Translation result** — the translated canvas plus a report: texts translated, texts left
  untranslated, blocks not translatable, provider and model used.
- **Translatable text declaration** — for every kind of Page Builder block, which of its texts are
  translatable and whether they are plain or formatted text; declared by the module that owns the
  block.
- **Translation audit entry** — one per completed translation, metadata only.

No new kind of stored business record is expected.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An editor fills a second language of a typical page (up to 30 blocks, about 5 000
  characters of text) in under 1 minute of waiting, against 20+ minutes of retyping today.
- **SC-002**: In 100% of translations, every non-text setting of every block is identical before and
  after (checked automatically over a fixture covering every block in scope).
- **SC-003**: In 100% of translations, every link target, placeholder and reference is unchanged.
- **SC-004**: A translation of a typical page completes within 30 seconds for 95% of attempts with a
  healthy provider.
- **SC-005**: With the function switched off, no editor in any role sees the Translate action and no
  content leaves the platform.
- **SC-006**: Every completed translation is traceable in the audit log to a person, a time, a model
  and a content item.
- **SC-007**: A failed or cancelled translation never changes the canvas.

## Assumptions

- **A1** — The default language model behaviour (auto-detecting the source language) is adequate for
  the in-place case; the editor is not asked to name the language of the text on the canvas.
- **A2** — The translation is interactive: the editor waits for it in the editor, typically seconds
  to tens of seconds. Translating many pages or a whole site in the background is out of scope.
- **A3** — The function is platform-wide; it is not switched per sales channel or per language.
- **A4** — Credentials, providers and models are the ones the Credentials screen manages; this
  feature adds no new kind of credential, but adds one provider (**OpenAI-compatible**) to the
  existing LLM kind and starts honouring its Base URL field (owner decision, Clarifications Q4).
- **A5** — Cost control is by permission and by the per-request size limit; per-user quotas, budgets
  and usage reporting beyond the audit entry are out of scope.
- **A6** — Glossaries, "do not translate" term lists and custom tone instructions are out of scope for
  this version.
- **A7** — E-mail, newsletter and invoice template builders are out of scope; they use different
  editors with variable systems of their own.
- **A8** — The size limit for one translation is fixed by the platform (planned: 40 000 characters of
  text, roughly a long landing page) rather than configured by the operator.

## Out of scope

- Automatic translation on save, scheduled or bulk translation, and translation memory.
- Translating content outside the Page Builder canvas (SEO fields, per-language names).
- Translating custom HTML and custom script blocks.
- Showing source and translation side by side, or accepting translations block by block.
- Per-language or per-channel choice of model.

## Clarifications

### Session 2026-10-17 (owner)

- **Q1 — Which editors get the button** (FR-010) → **every CMS Page Builder canvas**: CMS pages,
  blocks, templates, catalogue category content, blog posts and blog categories (the recommended
  answer; tasks T050–T051 stay in).
- **Q2 — Source of the translation** (FR-012) → by default **the current tab's canvas** with the
  source language detected automatically, plus an option to **pick another language tab** as the
  source (the recommended answer).
- **Q3 — What is translated** (FR-015) → **canvas texts only**; no SEO meta, no names (the
  recommended answer).
- **Q4 — Providers** (FR-006) → **changed from the recommendation.** OpenAI, Anthropic, Google
  **plus any OpenAI-compatible endpoint** (for example DeepSeek), by honouring the credential's
  **Base URL**. The owner explicitly wants the **same OpenAI-compatible support in the AI assistant**
  (`prompt_actions`): since the provider adapters move into the shared
  `@endora-commerce/llm-client` package, the option is implemented there once and both the
  translation and the assistant use it — including the credential type's fields, the admin credential
  form, validation, tests and documentation (FR-007, FR-043).
- **Q5 — How the result lands** → as planned: it replaces the canvas as an **unsaved** change with
  **Restore previous content**.
- **Q6 — Who may use it** → as planned: a new permission **`cms.translate`**.
- **Q7 — Cost and size control** → as planned: a fixed limit of **40 000 characters per click**,
  plus the audit entry.
