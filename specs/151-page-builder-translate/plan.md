# Implementation Plan: Page Builder "Translate" action

**Branch**: `feat/151-page-builder-translate` | **Date**: 2026-10-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/151-page-builder-translate/spec.md`

## Summary

An editor clicks **Translate** in the Page Builder toolbar and the canvas of the language tab being
edited is translated into that tab's language by the LLM an administrator chose for this function in
**Settings → Page Builder**, where the function is also switched on and off. The result is an unsaved
change the editor reviews, can restore, and saves as usual.

The technical approach, with the evidence in [research.md](./research.md):

- **`cms` owns the feature** (R1): two settings in its existing `cms_page_builder` group, two admin
  routes, one permission `cms.translate`, five error codes, one audit-only Command, one palette entry,
  i18n and docs.
- **The LLM transport becomes a shared library** (R2): `prompt_actions`' three fetch-based provider
  adapters move unchanged into a new stateless package `@endora-commerce/llm-client`, gain an optional
  forced tool choice and abort signal (R3), and are consumed by both `prompt_actions` and `cms`. No
  third-party dependency.
- **Block owners declare what is prose** (R4, R5): `BlockDefinition.translatable` — paths and a
  `plain | tiptap` format — on the manifest, served on the existing descriptor. Undeclared blocks are
  never sent.
- **The server extracts, translates and re-injects** (R6–R8): rich text is translated one paragraph
  at a time with numbered inline tags, marks and link targets stay on the server, placeholders and
  tags are verified per segment, work is chunked and bounded (40 000 characters, 60 s per call).
- **Synchronous and stateless** (R9, R10): one request, no queue, no table, no migration; the admin
  applies the result through the editor's existing unsaved-canvas path, after `resolveAllData`
  regenerates derived HTML, with an in-memory restore.
- **Fail-soft on `credentials`** (R11): a `degrades-without` edge; the capability endpoint lets the
  editor show *disabled with a reason* before any click.

No new runtime dependency. One new workspace library package. No migration.

## Technical Context

**Language/Version**: TypeScript 5.x `strict`, Node.js ≥ 22.17, ESM
**Primary Dependencies**: Fastify, MikroORM (PostgreSQL), Zod (backend); React 19 + Vite + `@endora-commerce/admin-kit` + `@puckeditor/core` 0.23 (admin); provider HTTP over native `fetch` — **no new runtime dependency**; one new workspace library package `@endora-commerce/llm-client` (code moved from `prompt_actions`)
**Storage**: PostgreSQL — no new table, column or migration; two rows in the existing `settings` store owned by `cms`; audit rows in the existing audit table
**Testing**: Vitest — unit tests beside their subjects in `packages/llm-client`, `packages/contracts`, `packages/modules/cms`, `packages/modules/prompt_actions`, `packages/page-builder-admin`; `backend/test/{contract,integration}/cms/`; `admin/test/modules/cms/`
**Target Platform**: Linux server (backend), modern browsers (admin)
**Project Type**: web application — monorepo with `backend/`, `admin/`, `packages/`
**Performance Goals**: a typical page (≤ 5 000 characters of text) in one provider call, p95 ≤ 30 s with a healthy provider (SC-004); no added cost to opening the editor beyond one small capability read
**Constraints**: ≤ 40 000 source characters per request; ≤ 60 s per provider call; nothing sent when the function is off, not configured, or there is nothing to translate; canvas never changed by a failed or cancelled translation; assistant behaviour unchanged (FR-042)
**Scale/Scope**: 1 new package (~600 LOC moved + ~80 new), 2 settings, 2 routes, 1 permission, 5 error codes, 1 Command, 1 palette action, 1 admin component, 1 chrome slot, ~30 block declarations, ~40 i18n keys × 2 languages, docs en + pl; 6 slices, about 9–11 developer-days

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design — same verdict.* Constitution v4.1.0.

| Principle | Verdict | How the design meets it |
| --- | --- | --- |
| **I. Modular architecture (NN)** | Pass | `cms` owns settings, routes, permission, errors, Command, strings, docs and tests. Block owners (`cms`, `catalog`) own their declarations. `cms` reaches `credentials` only through the `credentialsService` port (`lazyPort`, per call) and `settings` through `settingsReadPort`. `prompt_actions` and `cms` share code through a library, not through each other. The shared chrome gains a module-agnostic slot only. |
| **II. API-first** | Pass | All wire shapes and the declaration schema are written in `packages/contracts/src/cms.ts` first (slice 1 starts with them and their tests). All changes are additive and optional; nothing is versioned. |
| **III. TDD (NN)** | Pass | Every slice in `tasks.md` lists its failing tests before implementation; the move of the adapters starts by moving their tests and seeing them pass unchanged. FR → test map below. |
| **IV. YAGNI, minimal dependencies** | Pass, one item in Complexity Tracking | No third-party dependency; no table, queue, cache, setting for limits, glossary or review UI. The new package is justified below. |
| **V. TypeScript everywhere** | Pass | Zod at the HTTP boundary, at the provider boundary (existing adapter schemas) and on the forced tool's answer. |
| **VI. Naming (NN)** | Pass | Routes kebab-case (`/page-builder/translation`, `/page-builder/translate`); setting codes dot/snake (`cms.page_builder.translation.enabled`); permission `cms.translate` follows `cms.read`/`cms.write`; JSON camelCase; package `@endora-commerce/llm-client`. |
| **VII. SEO, performance** | N/A | Admin-only; no storefront change. Stored content shape unchanged. |
| **VIII. English (NN)** | Pass | Code, comments, prompt, docs in English; Polish only in bundles and the Polish docs tree. |
| **IX. UI reuse** | Pass | Button, Select, Label, Alert from `admin-kit`; the dialog reuses the hand-rolled portal pattern Copy from language already uses; apply path is the existing `applyCanvasData`. No new primitive. |
| **X. Queue consumers** | N/A, recorded | No queue-backed work is introduced. The synchronous, bounded design and the rejected BullMQ alternative are in research R9. |
| **XI. Tenant isolation (NN)** | Pass | No organisation-scoped data read or written; CMS entities are `@GlobalEntity()`; the Command runs under the admin request's TenantContext and fails closed without one (R20). |
| **XII. Sales-channel scoping (NN)** | Pass | Settings are platform-wide (null-channel read, as `cms`' other settings); no channel-scoped content is read. |
| **XIII. Command Bus auditing (NN)** | Pass | The feature performs no domain write. Each request that sent content records one audit entry through an audit-only Command on `CommandBus.run` (R13); no hand-written `AuditPort` call is added. Saving the translated canvas uses the existing audited content write. Settings writes use the existing settings path. |
| **XIV. Entity-agnostic extensibility** | Pass | What is translatable is declared per block by its owner on the manifest, so an overlay or third-party block opts in on the same terms; `cms` hard-codes no block. |
| **XV. Untouched core, overlay** | Pass | A deployment can point the setting at any `llm` credential and can ship blocks with declarations; no core edit is needed to extend. |
| **XVI. Command palette** | Pass | `open-page-builder-translation-settings` → `/settings` under `settings:read` (the precedent of `seo` and `google_tag_manager`). The Translate action itself is an in-editor action, not a route, so it has no palette entry. |
| **XVII. Operator-toggleable modules (NN)** | Pass | Routes through `ctx.routes` (cms off ⇒ 503); `credentials` off ⇒ capability `unavailable`, translate `409`, rest of CMS unaffected — declared as `degrades-without` with `whenAbsent`; `prompt_actions` off ⇒ unaffected (no edge). The function's own switch is a feature setting, distinct from `cms.enabled`. Off-state tests extended (slice 5). |

**Verdict: PASS.** One Complexity Tracking entry (the new package), justified.

## Project Structure

### Documentation (this feature)

```text
specs/151-page-builder-translate/
├── spec.md
├── plan.md                     # this file
├── research.md                 # R1–R20
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── page-builder-translation-api.md
│   ├── block-translatable-declaration.md
│   ├── llm-client-package.md
│   └── admin-surfaces.md
├── checklists/requirements.md
└── tasks.md
```

### Source code (repository root)

```text
packages/llm-client/                                    # NEW library package (R2)
├── package.json  tsconfig.json  tsconfig.build.json  vitest.config.ts  LICENSE  README.md (generated)
└── src/
    ├── index.ts
    ├── provider.ts                                     # moved from prompt_actions (+ toolChoice, signal, aborted)
    ├── anthropic-adapter.ts  google-adapter.ts  openai-adapter.ts   # moved
    ├── create-llm-adapter.ts                           # new factory
    └── *.test.ts                                       # adapters.test.ts moved + new cases

packages/contracts/src/cms.ts                           # translatable declaration; capability/request/response schemas
packages/contracts/src/cms-translation.test.ts

packages/modules/prompt_actions/src/backend/services/llm/
├── provider-factory.ts                                 # imports @endora-commerce/llm-client
└── (provider.ts and the three adapters deleted)

packages/modules/cms/
├── src/manifest.ts                                     # settings, permission, errorCodes, action, nonBindingDependencies, block `translatable`
├── src/backend/index.ts                                # cmsTranslationLlmFetch seam, translation service registration
├── src/backend/routes.admin.ts                         # two routes
├── src/backend/services/page-builder-registry.ts       # store/serve `translatable`, translatableFor()
├── src/backend/services/translation/
│   ├── limits.ts  prompt.ts
│   ├── extract.ts  inject.ts  tiptap-inline-codec.ts  placeholders.ts  chunk.ts
│   ├── capability.ts  translation.service.ts  provider-error-map.ts
│   └── *.test.ts
├── src/backend/commands/translate-page-builder-content.command.ts
├── src/admin/components/PageBuilderTranslateAction.tsx
├── src/admin/components/PageBuilderEditor.tsx          # `resource` prop, extraActions, apply + restore
├── src/admin/editors/{Page,Block,Template}Editor.tsx   # pass `resource`
├── src/admin/zones/CategoryContentEditor.tsx           # pass activeLanguage (if FR-010 = all hosts)
├── src/admin/api/cms-client.ts                         # two client calls
├── i18n/en.json  i18n/pl.json
└── docs/cms/index.md  docs/cms/extending-page-builder.md

packages/modules/catalog/src/manifest.ts                # `translatable` on CMS-context blocks
packages/modules/blog/src/admin/pages/Blog{Post,Category}Editor.tsx   # if FR-010 = all hosts
packages/page-builder-admin/src/chrome/PageBuilderHeaderActions.tsx   # extraActions slot

backend/test/contract/cms/page-builder-translation.contract.test.ts   # NEW
backend/test/integration/cms/page-builder-translation.test.ts         # NEW
backend/test/integration/cms/off-state.test.ts                        # extend
admin/test/modules/cms/page-builder-translate-action.test.tsx         # NEW
docs/i18n/pl/…/modules/cms/…                                          # Polish docs cache + materialised file
.changeset/151-*.md
```

**Structure Decision**: extend `cms` (domain owner) and add one library package; no new module.

## Decisions for the owner

Planned on the **recommended** answer to each; the delta for the alternatives is stated so that a
different answer changes tasks, not the design.

| # | Question | Recommended (planned) | Alternatives and their delta |
| --- | --- | --- | --- |
| 1 | **Which editors get the button** (spec FR-010) | Every Page Builder canvas in the CMS context whose host knows the edited language: CMS pages, blocks, templates, catalogue category content, blog posts, blog categories | *CMS pages/blocks/templates only*: drop T050–T051. *Also e-mail/newsletter/invoice builders*: a separate feature (different editor, variables, contexts). |
| 2 | **Source of the translation** (spec FR-012) | Default: the current canvas of this tab, source language auto-detected; optionally any other language tab as source | *In-place only*: drop T044–T045 (source select and tab-source path). *Other tab only (copy + translate)*: the in-place case needs Copy first. |
| 3 | **What is translated** (spec FR-015) | Canvas texts only | *Also SEO meta (title, description, keywords) and per-language names*: add an optional `fields: Record<string,string>` to the request and response, translate them as plain segments, and have each host apply them to its own form (pages, blog posts) — about +1.5 days. *Also custom HTML blocks*: an HTML-aware codec; not recommended. |
| 4 | **Providers** (spec FR-006) | OpenAI, Anthropic, Google — the three the assistant already supports; DeepSeek credentials report "not configured" | *Add DeepSeek and any OpenAI-compatible endpoint*: honour the credential's `baseUrl` in the OpenAI adapter, default `https://api.deepseek.com` for `deepseek` — +0.5 day, and it fixes the same gap for the assistant only if the owner wants that too. |
| 5 | **How the result lands** | Replaces the tab's canvas as an unsaved change, with *Restore previous content* until save | *Saved immediately*: removes the review step; not recommended. *Block-by-block review*: a new screen, +3–5 days. |
| 6 | **Who may use it** | New permission `cms.translate` | *Anyone with `cms.write`*: delete the permission; blog-only editors could not translate. |
| 7 | **Cost/size control** | Fixed limit of 40 000 characters per click; audit trail of every send | *Operator setting for the limit*: one more `number` setting, +0.25 day. *Per-user quotas/budgets*: a separate feature. |

## Requirement → test

| FR | Test (new unless "extend") |
| --- | --- |
| FR-001–FR-003 | `packages/modules/cms/src/backend/manifest.test.ts` (extend): settings declared, group, defaults, `credential_ref` + `llm`; `registered-bundles-shape` covers the `settingLabels.*` keys |
| FR-004, FR-005 | `services/translation/capability.test.ts` — the state table of `data-model.md` §1, in order; integration: change the setting, next capability differs without restart |
| FR-006 | `capability.test.ts`: `deepseek` ⇒ `not_configured`; `llm-client` adapter tests per provider |
| FR-010, FR-011 | admin `page-builder-translate-action.test.tsx`: render matrix of `admin-surfaces.md` §2; target is the active tab |
| FR-012, FR-013 | admin test: source select options, default, warning when replacing; request carries `sourceLanguage` |
| FR-014, FR-016, FR-017 | `extract.test.ts` + `inject.test.ts` round-trip property; `tiptap-inline-codec.test.ts`; `placeholders.test.ts`; contract test G1, G3, G4, G6 over a fixture holding every CMS block |
| FR-015 | `cms` manifest unit test: every CMS-context first-party block declares `translatable`; fixture test per block that declared paths exist in `component-types.ts` shapes and excluded props are not declared |
| FR-018, FR-019 | admin test: apply does not call any save endpoint; restore returns the exact pre-translation data; restore gone after save/tab change |
| FR-020 | `translation.service.test.ts`: a segment with a lost tag / placeholder / missing id is kept and counted |
| FR-021 | admin test: cancel aborts the fetch and leaves the canvas |
| FR-022 | contract G2 (provider fake asserts zero calls) |
| FR-023 | contract: 41 000 characters ⇒ 413 with details; provider fake asserts zero calls |
| FR-024 | `provider-error-map.test.ts` table; contract: each token surfaces as `details.code` with a translated sentence |
| FR-025 | contract G5 with an undeclared block |
| FR-030 | contract: 403 on both routes without `cms.translate`; `permission-inventory.test.ts` (existing, picks the code up); admin test: no button without permission |
| FR-031 | integration: one audit row per send with the `data-model.md` §5 shape, none on 409/413/zero segments, none containing source text |
| FR-032 | `registered-bundles-shape.test.ts`, `check:action-route-permissions` |
| FR-033 | `check:bundle-pairing`, `i18n:hardcoded` |
| FR-034 | `check:module-docs`, `check:docs-translations` |
| FR-040, FR-041 | extend `backend/test/integration/cms/off-state.test.ts`: cms off ⇒ 503 on both; credentials off ⇒ capability `unavailable`, translate 409, a page save still works |
| FR-042 | `prompt_actions` package tests and `backend/test/{contract,integration}/prompt_actions/*` unchanged and green; `llm-client` byte-identity tests for requests without `toolChoice` |

## Slices

| # | Slice | Depends on | Est. |
| --- | --- | --- | --- |
| 1 | `@endora-commerce/llm-client` extracted; `prompt_actions` re-pointed; `toolChoice` + `signal` | — | 1.5 d |
| 2 | Contracts: declaration + API schemas; registry carries `translatable`; `cms`/`catalog` declarations | — | 1.5 d |
| 3 | Translation core in `cms`: extract/inject, TipTap codec, placeholders, chunking, prompt, service with fake adapter | 1, 2 | 2.5 d |
| 4 | Settings, capability, routes, permission, errors, audit Command, palette, bundles | 3 | 1.5 d |
| 5 | Admin: chrome slot, `PageBuilderTranslateAction`, apply/restore/cancel, hosts | 4 | 2 d |
| 6 | Off-state, docs en + pl, changeset, generated artefacts, full verification, manual walk | 1–5 | 1 d |

Slices 1 and 2 are independent and can run in parallel.

## Risks and how they are contained

| Risk | Containment |
| --- | --- |
| New package not resolvable in a scaffolded instance | T008 runs `packages/cli` instance tests; `manifests:generate` renders the dependency; `pnpm install --lockfile-only` in the same MR |
| Model breaks inline tags or placeholders | per-segment verification, segment kept as source, counted (FR-020) |
| Long pages hit proxy timeouts | 40 000-character cap, chunking, 60 s per call, concurrency 2; measured in the manual walk |
| `resolveAllData` does not regenerate derived `html` as assumed | first admin test (T041) asserts it on `cms.RichContent` and `cms.Text`; fallback: call `coerceRichContentProps` for those two blocks explicitly |
| The adapter move silently changes the assistant | tests moved first and run unchanged; byte-identity cases; `prompt_actions` contract/integration suites |
| A block's prose missed by its declaration | manifest test forcing a declaration on every CMS-context block; fixture test per block |

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| New workspace library package `@endora-commerce/llm-client` (no third-party dependency) | A second module needs the same three provider protocols the assistant already has; a library shares them without a module edge, lifecycle coupling or a change to `credentials`' charter (research R2) | *Copy into `cms`*: two drifting copies of three protocols. *Port on `prompt_actions`*: page translation would depend on the assistant's activation. *Gateway port on `credentials`*: contradicts its recorded charter. *Provider SDKs*: three new runtime dependencies. |

## Handoff to `endora-commerce-dev`

- Start with slices 1 and 2 in parallel; both are behaviour-neutral and land green on their own.
- Read first: `specs/conventions/module-composition.md` (items 3, 4a, 7: `lazyPort`, `degrades-without`,
  no bare `catch` around the port), `module-admin-surfaces.md`, `module-i18n.md`,
  `module-activation.md`, `building-packages.md` (new package build shape), `release-intent.md`
  (changeset), `module-documentation.md` (Polish docs).
- Do not assign or create a migration; there is none.
- Regenerate and commit: `composer:generate`, `manifests:generate`, `pnpm install --lockfile-only`.
- Deleting `prompt_actions`' adapter files: two backend test files name them by path today —
  `backend/test/helpers/test-server.ts` (l. 155–156, `import type { FetchLike } from
  '…/prompt_actions/src/backend/services/llm/provider.js'`) and the residue ledger
  `backend/test/unit/harness/harness-module-residue.ts` (l. 92–93). Both must change in the same
  merge request (T007); grep `backend/test/**` again before finishing (`AGENTS.md` § traps — a
  derived ledger is not a file you touched).
- The decisions table above may change slices 3–5; check the spec's markers are resolved before
  slice 5.
