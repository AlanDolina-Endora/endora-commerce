# Tasks: Page Builder "Translate" action

**Input**: Design documents from `specs/151-page-builder-translate/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests are mandatory** (Constitution III, TDD non-negotiable): every implementation task is preceded
by a task that writes its failing test. Run a test red before writing the code that greens it.

**Before any node command**: `source ~/.nvm/nvm.sh && nvm use 22`. After editing a package, rebuild
that package (`pnpm --filter <pkg> run build`) before running tests that import it
(`specs/conventions/building-packages.md`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 from spec.md; setup, foundational and polish tasks carry none

---

## Phase 1: Setup — the shared LLM transport (`@endora-commerce/llm-client`)

**Purpose**: research R2/R3, `contracts/llm-client-package.md`. Behaviour-neutral for the assistant.

- [ ] T001 Create the package skeleton `packages/llm-client/` modelled on `packages/page-builder-core/`: `package.json` (`name: @endora-commerce/llm-client`, `type: module`, `exports` `.` → `./dist/index.{js,d.ts}`, `files: ["dist"]`, `scripts` build/typecheck/lint/test, peer `zod` ^4 and `@endora-commerce/contracts`), `tsconfig.json` (noEmit, paths) + `tsconfig.build.json` (rootDir, `noEmitOnError`), `vitest.config.ts`, `LICENSE`; add the `paths` entry to `tsconfig.base.json`
- [ ] T002 Move `packages/modules/prompt_actions/src/backend/services/llm/adapters.test.ts` to `packages/llm-client/src/adapters.test.ts` with `git mv`, adjusting only import specifiers; run it and see it fail (no sources yet)
- [ ] T003 Move `provider.ts`, `anthropic-adapter.ts`, `google-adapter.ts`, `openai-adapter.ts` from `packages/modules/prompt_actions/src/backend/services/llm/` to `packages/llm-client/src/` with `git mv`; replace `PromptActionsProvider` by a local `LlmProvider` union; add `packages/llm-client/src/index.ts`; T002 passes **unchanged**
- [ ] T004 [P] Add `packages/llm-client/src/provider-parity.test.ts`: a type-level assertion that `LlmProvider` and `PromptActionsProvider` (`@endora-commerce/contracts`) are mutually assignable, and that `LLM_PROVIDERS` equals `PromptActionsProviderSchema.options`
- [ ] T005 Add failing cases to `packages/llm-client/src/adapters.test.ts`: per provider, `toolChoice: { name }` maps to the native forced-tool option (Anthropic `tool_choice {type:'tool',name}`, OpenAI `tool_choice {type:'function',function:{name}}`, Google `toolConfig.functionCallingConfig {mode:'ANY',allowedFunctionNames}`) with the wire name; `signal` is passed to `fetch`; an aborted fetch yields `LlmProviderError { kind:'network', aborted:true }`; a request without `toolChoice`/`signal` produces a byte-identical body to the pre-move fixture
- [ ] T006 Implement `toolChoice`, `signal` and `aborted` in `packages/llm-client/src/{provider,anthropic-adapter,google-adapter,openai-adapter}.ts` and add `packages/llm-client/src/create-llm-adapter.ts` (`createLlmAdapter(provider, { apiKey, fetchImpl })`) with its test `create-llm-adapter.test.ts`
- [ ] T007 Re-point `prompt_actions`: `packages/modules/prompt_actions/src/backend/services/llm/provider-factory.ts`, `services/interpreter.service.ts`, `services/interpreter.service.test.ts`, `backend/index.ts` import from `@endora-commerce/llm-client`; build adapters through `createLlmAdapter`. Update the two backend files that name the moved paths: `backend/test/helpers/test-server.ts` (l. 155–156) and the residue ledger `backend/test/unit/harness/harness-module-residue.ts` (l. 92–93). Then `grep -rn "services/llm/provider.js\|anthropic-adapter\|openai-adapter\|google-adapter" backend packages admin` must name only `packages/llm-client`. Run `pnpm --filter @endora-commerce/mod-prompt-actions run test` and `pnpm --filter backend exec vitest run test/contract/prompt_actions test/integration/prompt_actions test/unit/harness`
- [ ] T008 Regenerate and prove resolution: `pnpm --filter backend run manifests:generate`, `pnpm install --lockfile-only`, `pnpm --filter backend run composer:generate`, `pnpm run build:packages`; run `pnpm --filter @endora-commerce/cli run test` (new-instance members/pins) and fix what the new package requires there; commit generated files with the change

**Checkpoint**: assistant behaviour unchanged; `@endora-commerce/llm-client` builds and is consumed.

---

## Phase 2: Foundational — contracts, declarations, translation core

**Purpose**: research R4–R8, R16, R17; `contracts/block-translatable-declaration.md`. Blocks every story.

- [ ] T009 [P] Write failing `packages/contracts/src/cms-translation.test.ts`: `translatablePathRe` accepts `text`, `items[].title`, `a.b[].c` and rejects `items[]`, `.a`, `a..b`, `a[0]`, `1a`; `blockTranslatableTextSchema`; duplicate paths refused; `BlockDefinitionSchema` and `cmsPageBuilderDescriptorSchema` accept `translatable` and still accept its absence; capability discriminated union; request refine `sourceLanguage !== targetLanguage`; response schema
- [ ] T010 Implement the schemas of `contracts/page-builder-translation-api.md` and `contracts/block-translatable-declaration.md` §1 in `packages/contracts/src/cms.ts` and export them from the package index; build `@endora-commerce/contracts`
- [ ] T011 Write failing cases in `packages/modules/cms/src/backend/services/page-builder-registry.test.ts`: `registerManifest` keeps `translatable`; `describe()` serves it per component; new `translatableFor(name)` returns the declaration, `undefined` for an undeclared block, and `undefined` for a block whose owner `isModulePresent` reports absent
- [ ] T012 Implement storage, serving and `translatableFor` in `packages/modules/cms/src/backend/services/page-builder-registry.ts`
- [ ] T013 Write failing `packages/modules/cms/src/backend/services/translation/extract.test.ts` and `inject.test.ts`: plain paths, `[]` paths, nested arrays, non-string values ignored, slot children walked, legacy `zones` walked, root walked, undeclared blocks counted by name, deduplication of identical strings, character count; property: `inject(data, locations, identity)` deep-equals `data` over a fixture containing every `cms.*` block
- [ ] T014 Implement `packages/modules/cms/src/backend/services/translation/extract.ts` and `inject.ts` (pure; `inject` returns a deep copy)
- [ ] T015 [P] Write failing `packages/modules/cms/src/backend/services/translation/tiptap-inline-codec.test.ts`: paragraph/heading/list/blockquote/table paragraphs become one segment each; marked runs become `<n>…</n>`; `hardBreak` ↔ `<br/>`; inline non-text nodes ↔ `<n/>`; link `href` never appears in the encoded text; decoding restores marks and node attrs; reordered tags accepted; missing, duplicated, unknown or unclosed tags rejected
- [ ] T016 Implement `packages/modules/cms/src/backend/services/translation/tiptap-inline-codec.ts`
- [ ] T017 [P] Write failing `packages/modules/cms/src/backend/services/translation/placeholders.test.ts`: `{{…}}` multiset equality accept/reject; `<`/`>` in plain text escaped on the way out and restored on the way back
- [ ] T018 Implement `packages/modules/cms/src/backend/services/translation/placeholders.ts`
- [ ] T019 [P] Write failing `packages/modules/cms/src/backend/services/translation/chunk.test.ts`: chunks respect `MAX_CHUNK_CHARACTERS` and `MAX_CHUNK_SEGMENTS`; a single over-long segment forms its own chunk; order preserved
- [ ] T020 Implement `packages/modules/cms/src/backend/services/translation/limits.ts` (constants of research R8) and `chunk.ts`
- [ ] T021 Write failing cases in `packages/modules/cms/src/backend/manifest.test.ts` and a new `packages/modules/cms/src/backend/services/translation/block-declarations.test.ts`: every block of every first-party manifest whose `contexts` include `cms` declares `translatable` (iterate the composed manifests, not a hand list); per `cms.*` block, a fixture node built from `packages/cms-components/src/schema/component-types.ts` yields exactly the planned segments of `data-model.md` §2 and never a value of `editorName`, `href`, `url`, `*Href`, `*Slug`, `src`, `*AssetId`, `code`, `script`, `html`
- [ ] T022 Add `translatable` declarations to every CMS-context block in `packages/modules/cms/src/manifest.ts` and `packages/modules/catalog/src/manifest.ts` (inventory `data-model.md` §2; settle `cms.SimpleTable`, `cms.NewsletterSignup`, `cms.Video` and the five `catalog.*` blocks from their prop types, and record the outcome in `data-model.md`)
- [ ] T023 [P] Add `packages/modules/cms/src/backend/services/translation/prompt.ts` (research R16) with `prompt.test.ts` (inline snapshot of the system prompt for `pl-PL → en-US` and for detected source; tool definition equals `contracts/block-translatable-declaration.md` §5)
- [ ] T024 [P] Write `packages/modules/cms/src/backend/services/translation/provider-error-map.test.ts` (the table in `contracts/page-builder-translation-api.md` §3) and implement `provider-error-map.ts`
- [ ] T025 Write failing `packages/modules/cms/src/backend/services/translation/translation.service.test.ts` with a fake `LlmProviderAdapter`: forced tool `cms.submit_translations` is requested; chunks run with concurrency ≤ 2 and a 60 s signal; a missing/duplicate id, a tag or placeholder mismatch rejects only that segment; `stopReason: 'max_tokens'` splits the chunk and retries each half once; a provider error on any chunk throws the mapped error; every chunk malformed ⇒ `malformed`; zero segments ⇒ adapter never called; > `MAX_SOURCE_CHARACTERS` ⇒ too-large error before any call; report counts
- [ ] T026 Implement `packages/modules/cms/src/backend/services/translation/translation.service.ts` (extract → chunk → translate → validate → inject → report)

**Checkpoint**: the translation core is complete and green against a fake model.

---

## Phase 3: User Story 2 — switch the function on and choose its model (P1)

**Goal**: settings, capability, permission. **Independent test**: toggle settings and credentials and
read the capability; no content involved.

- [ ] T027 [US2] Write failing cases in `packages/modules/cms/src/backend/manifest.test.ts`: the two settings of `data-model.md` §1 in group `cms_page_builder` with their defaults, `credential_ref` + `configurationType: 'llm'`; `CMS_PAGE_BUILDER_SETTING_CODES` gains both codes; `nonBindingDependencies` holds `{ moduleId: 'credentials', name: 'credentialsService', kind: 'degrades-without', whenAbsent }`; `credentials` is **not** in `dependencies`
- [ ] T028 [US2] Implement the settings, codes and `nonBindingDependencies` entry in `packages/modules/cms/src/manifest.ts` (names/descriptions from `contracts/admin-surfaces.md` §4)
- [ ] T029 [US2] Write failing `packages/modules/cms/src/backend/services/translation/capability.test.ts`: the state table of `data-model.md` §1 in its evaluation order, including `disabled` never touching credentials, `credentials` absent ⇒ `unavailable`, `deepseek` ⇒ `not_configured`, blank model/key ⇒ `not_configured`, and that the key never appears in the result
- [ ] T030 [US2] Implement `packages/modules/cms/src/backend/services/translation/capability.ts` and register in `packages/modules/cms/src/backend/index.ts`: `cmsTranslationLlmFetch` seam (default `undefined`), `cmsTranslationService` singleton reading `settingsReadPort` (null channel) and `lazyPort<CredentialsPort>(ctx, 'credentialsService')` per call after `effectiveState.isPresent('credentials')`; no bare `catch` around the port (`rethrowIfModuleDisabled` first where a tolerance is right); run `check:port-dependencies` and `check:port-catches`
- [ ] T031 [US2] Write failing `backend/test/contract/cms/page-builder-translation.contract.test.ts` § capability: 401, 403 without `cms.translate`, each status reachable by seeding settings and a credential, response parses with the contract schema and carries no secret
- [ ] T032 [US2] Add `GET /api/v1/admin/cms/page-builder/translation` to `packages/modules/cms/src/backend/routes.admin.ts` behind `requireAdmin('cms.translate')`; add `{ code: 'cms.translate', label }` to `permissions` in `packages/modules/cms/src/manifest.ts`; add `getTranslationCapability()` to `packages/modules/cms/src/admin/api/cms-client.ts`
- [ ] T033 [P] [US2] Add `settingLabels.cms.page_builder.translation.*` and `adminRoles.permission.cms.translate` keys to `packages/modules/cms/i18n/en.json` and `pl.json`; run `pnpm --filter backend exec vitest run test/unit/_i18n/registered-bundles-shape.test.ts test/contract/admin_users/permission-inventory.test.ts`
- [ ] T034 [US2] Write and pass `backend/test/integration/cms/page-builder-translation.test.ts` § configuration: changing either setting through the settings API changes the next capability answer without a restart; switching `credentials` off answers `unavailable` while a CMS page still saves

**Checkpoint**: an administrator can configure the function and the editor can learn its state.

---

## Phase 4: User Story 1 — translate the canvas into the language being edited (P1) 🎯 MVP

**Goal**: the endpoint, the audit, the button and the apply path, source = current canvas.
**Independent test**: quickstart §2 with the fake provider; G1–G6 hold.

- [ ] T035 [US1] Write failing cases in `backend/test/contract/cms/page-builder-translation.contract.test.ts` § translate: G1–G6 of `contracts/page-builder-translation-api.md` §2 over a fixture holding every `cms.*` CMS-context block plus one undeclared block (fake fetch registered as `cmsTranslationLlmFetch`); 409 ×3; 413 with `details`; 502 with each `details.code` token and a translated `message` in en and pl; zero segments ⇒ 200 and zero provider calls; 400 for `sourceLanguage === targetLanguage`
- [ ] T036 [US1] Add `POST /api/v1/admin/cms/page-builder/translate` (body limit 2 MiB, `requireAdmin('cms.translate')`) to `packages/modules/cms/src/backend/routes.admin.ts`; declare the five error codes (with tokens) in `manifest.errorCodes`; add `errors.CMS_TRANSLATION_*` sentences to `packages/modules/cms/i18n/{en,pl}.json`
- [ ] T037 [US1] Write failing cases in `backend/test/integration/cms/page-builder-translation.test.ts` § audit: one `cms.page_builder.translate` row per send with the `data-model.md` §5 shape and `outcome` `completed`/`partial`/`failed`; actor from the session, not the body; no row for 409/413/400/403/zero segments; no row contains any source string of the fixture
- [ ] T038 [US1] Implement `packages/modules/cms/src/backend/commands/translate-page-builder-content.command.ts` (audit-only, not reversible) and run it through `commandBus.run` from the route after the provider calls; confirm the audit coverage check stays green
- [ ] T039 [P] [US1] Write a failing test in `packages/page-builder-admin/src/chrome/PageBuilderHeaderActions.test.tsx` (or the existing `admin/test/page-builder-admin/` suite): `extraActions` renders first in `.cms-pb-header-actions`; without it the output equals today's
- [ ] T040 [US1] Add the `extraActions?: ReactNode` prop to `packages/page-builder-admin/src/chrome/PageBuilderHeaderActions.tsx`; build the package
- [ ] T041 [US1] Write failing `admin/test/modules/cms/page-builder-translate-action.test.tsx`: the render matrix of `contracts/admin-surfaces.md` §2; the dialog names target, provider and model; confirm sends `{ targetLanguage: activeLanguage, sourceLanguage: null, context: 'cms', data, resource }`; the result is passed through `resolveAllData` so `cms.RichContent.html` and `cms.Text.html` equal `htmlFromTiptap` of the translated TipTap; no save endpoint is called; Cancel aborts the request and leaves the canvas; a 502 shows the envelope message and keeps the dialog open; success notice counts; no hard-coded strings
- [ ] T042 [US1] Implement `packages/modules/cms/src/admin/components/PageBuilderTranslateAction.tsx`, add `translate()` to `packages/modules/cms/src/admin/api/cms-client.ts`, and wire it in `packages/modules/cms/src/admin/components/PageBuilderEditor.tsx` (new `resource` prop, `extraActions`, apply through `resolveAllData` + `applyCanvasData`); add the `pageBuilder.translate.*` keys of `contracts/admin-surfaces.md` §7 to `packages/modules/cms/i18n/{en,pl}.json`; run `pnpm --filter backend run i18n:hardcoded`
- [ ] T043 [US1] Pass `resource` from `packages/modules/cms/src/admin/editors/PageEditor.tsx` (`cms_page`), `BlockEditor.tsx` (`cms_block`) and `TemplateEditor.tsx` (`cms_template`)

**Checkpoint**: MVP — an editor translates a CMS page, block or template in place.

---

## Phase 5: User Story 3 — translate from another language's content (P2)

**Independent test**: quickstart §3.

- [ ] T044 [US3] Add failing cases to `admin/test/modules/cms/page-builder-translate-action.test.tsx`: the Source select lists "current content" then each other language; choosing a tab sends that tab's content as resolved by `onResolveLanguageContent` (unsaved edits included) with `sourceLanguage` = that tab; a non-empty canvas shows the replace warning; an empty source tab shows `pageBuilder.translate.nothing` and sends nothing; the source tab's content is not changed
- [ ] T045 [US3] Implement the source select and the tab-source path in `packages/modules/cms/src/admin/components/PageBuilderTranslateAction.tsx` using the editor's existing `onResolveLanguageContent`

---

## Phase 6: User Story 4 — review and undo (P2)

**Independent test**: translate, restore, compare; translate, save, restore gone.

- [ ] T046 [US4] Add failing cases to `admin/test/modules/cms/page-builder-translate-action.test.tsx`: Restore returns the exact pre-translation data (including unsaved edits); the notice and Restore disappear on save, tab change and a new translation; a partial result shows the untranslated and untranslatable counts
- [ ] T047 [US4] Implement the snapshot and notice lifecycle in `packages/modules/cms/src/admin/components/PageBuilderEditor.tsx` / `PageBuilderTranslateAction.tsx`

---

## Phase 7: User Story 5 — governance and discoverability (P3), and the remaining hosts

- [ ] T048 [US5] Add the palette action of `contracts/admin-surfaces.md` §6 to `packages/modules/cms/src/manifest.ts` and its `actions.openPageBuilderTranslationSettings.*` keys to `packages/modules/cms/i18n/{en,pl}.json`; run `test/unit/_i18n/registered-bundles-shape.test.ts` and `pnpm --filter backend run check:action-route-permissions`; extend the cms entry of the palette off-state test (`grep -rl "palette-off-state" backend/test`) if it enumerates cms actions
- [ ] T049 [US5] Re-run `pnpm --filter backend exec vitest run test/contract/admin_users/permission-inventory.test.ts` for `cms.translate` in both directions and its labels
- [ ] T050 [P] [US1] *(FR-010 = all hosts)* Pass `activeLanguage={language}` and `resource={{ type: 'catalog_category', id: categoryId }}` from `packages/modules/cms/src/admin/zones/CategoryContentEditor.tsx`; extend its admin test
- [ ] T051 [P] [US1] *(FR-010 = all hosts)* Pass `languages`, `activeLanguage`, `onResolveLanguageContent` and `resource` (`blog_post` / `blog_category`) from `packages/modules/blog/src/admin/pages/BlogPostEditor.tsx` and `BlogCategoryEditor.tsx`; extend their admin tests

---

## Phase 8: Polish & cross-cutting

- [ ] T052 Extend `backend/test/integration/cms/off-state.test.ts`: `cms` off ⇒ both routes `503 MODULE_DISABLED`; `credentials` off ⇒ capability `unavailable`, translate `409 CMS_TRANSLATION_UNAVAILABLE`, page save unaffected; `prompt_actions` off ⇒ translation unaffected; run `check:off-state-coverage` if present
- [ ] T053 [P] Document the function in `packages/modules/cms/docs/cms/index.md` (settings, permission, data sent to the provider, limits, states) and the `translatable` authoring rules in `packages/modules/cms/docs/cms/extending-page-builder.md`
- [ ] T054 Update the Polish docs cache and materialised files under `docs/i18n/pl/` for both pages; run `pnpm --filter backend run check:docs-translations` and `check:module-docs`
- [ ] T055 [P] Add `.changeset/151-page-builder-translate.md` covering `@endora-commerce/llm-client` (new), `@endora-commerce/contracts`, `@endora-commerce/mod-cms`, `@endora-commerce/mod-catalog`, `@endora-commerce/mod-prompt-actions`, `@endora-commerce/page-builder-admin`, and `@endora-commerce/mod-blog` if T051 ran; run `pnpm run check:release-intent` (or the `release-intent.md` command)
- [ ] T056 Regenerate and commit: `composer:generate`, `manifests:generate`, `pnpm install --lockfile-only`; run `pnpm run check:naming && pnpm run check:language`, `check:module-boundary`, `check:port-dependencies`, `check:port-catches`, `check:bundle-pairing`, `check:platform-surface`
- [ ] T057 Full verification: `pnpm run build:packages`, `pnpm -r run typecheck`, `pnpm -r run lint`, `pnpm --filter backend run test:unit:fast`, the targeted `backend/test/{contract,integration}/{cms,prompt_actions}` runs, `pnpm --filter '!backend' run test` (packages incl. `llm-client`, `cli`, `page-builder-admin`, admin); paste failures with output
- [ ] T058 Manual walk of `quickstart.md` §2–§4 with at least one real provider, both admin languages; record provider, model, page size and duration in the pull request; product owner reviews the Polish strings

---

## Dependencies & execution order

- **Phase 1** and **Phase 2's T009–T012** are independent and can run in parallel.
- T013–T026 depend on T010 and T012 (schemas and registry); T025–T026 also on T006 (adapter API).
- **US2 (Phase 3)** depends on Phase 2. **US1 (Phase 4)** depends on US2 (capability, permission).
- **US3, US4** depend on T042. **US5** T048–T049 can follow T032. T050–T051 depend on T042.
- **Polish** last; T057 is the gate.

```text
Phase 1 ─┐
         ├─► Phase 2 ─► US2 ─► US1 (MVP) ─┬─► US3
T009–T012┘                                 ├─► US4
                                           └─► US5 / T050–T051 ─► Polish
```

## Parallel examples

- Phase 1 ∥ T009–T012.
- Within Phase 2: T015, T017, T019, T023, T024 (different files).
- Within US1: T039–T040 (page-builder-admin) ∥ T035–T038 (backend).
- T050 ∥ T051; T053 ∥ T055.

## Implementation strategy

1. **MVP** = Phases 1–4: configure, then translate in place on CMS pages, blocks and templates.
2. Then US3 (tab source) and US4 (restore) — small admin-only increments.
3. Then US5 palette + remaining hosts, then polish.
4. The owner's answers to the spec's three markers may remove T044–T045 (decision 2), T050–T051
   (decision 1), or add a fields extension to T035–T042 (decision 3); check before starting Phase 5.
