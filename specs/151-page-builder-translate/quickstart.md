# Quickstart: Page Builder "Translate" action

How to see the feature work end to end, and how to verify it without a real model.

## 0. Prerequisites

```bash
source ~/.nvm/nvm.sh && nvm use 22
pnpm install
pnpm run build:packages        # includes the new packages/llm-client
pnpm run dev:infra             # Postgres, Redis, Meilisearch
pnpm run setup                 # db:fresh, then module:install --all
pnpm run dev
```

## 1. Configure (admin, as an administrator)

1. **Credentials → New** — type **LLM**, provider **OpenAI** / **Anthropic** / **Google** /
   **DeepSeek** / **OpenAI-compatible (custom endpoint)**, a model (e.g. `gpt-4o-mini`,
   `claude-haiku-4-5`, `gemini-2.0-flash`, `deepseek-chat`) and an API key; for OpenAI-compatible
   also the Base URL (e.g. `https://openrouter.ai/api/v1`). Save; note its code.
2. **Settings → Page Builder** — set **Translation credentials** to that configuration and switch
   **Translation enabled** on. (⌘K → "translation" finds the Settings entry.)
3. **Admin roles** — give your role **Translate Page Builder content with AI** (`cms.translate`).

## 2. Translate in place (User Story 1)

1. **CMS → Pages → New page**, languages **pl-PL** and **en-US**, one sales channel. Save.
2. On the **en-US** tab add a Heading, a Rich content block with a bold word and a link, a Button,
   an Accordion with two items, and an Image with alt text — all written in Polish. Include
   `{{customer.firstName}}` in one paragraph.
3. Click **Translate** → source "Current content of this tab" → **Translate**.
4. Expect: every text in English, the bold word still bold, the link target unchanged, the
   placeholder unchanged, button target/variant and image unchanged, the notice "Translated N texts
   into en-US." with **Restore previous content**.
5. Click **Restore previous content** → the Polish canvas is back. Translate again, **Save**, reload:
   the English canvas is stored; the pl-PL tab is untouched.

## 3. Translate from another tab (User Story 3)

On a page whose **pl-PL** tab is filled and whose **en-US** tab is empty: on **en-US**, Translate →
source **Content of pl-PL** → the en-US canvas holds the translated copy; pl-PL unchanged.

## 4. States to check

| Do | Expect |
| --- | --- |
| Settings: Translation enabled **off** | no Translate button anywhere |
| Settings: Translation size limit set to `999` or `200001` | the Settings screen refuses it, naming 1 000–200 000 |
| Settings: Translation size limit set to `1000`, then translate a page with more text | refused before sending, the message names 1 000; the audit log has no entry |
| enabled on, credentials empty | button disabled, reason "no model is configured" |
| Platform → Modules: **Credentials** off | button disabled, reason names Credentials; pages still edit and save |
| role without `cms.translate` | no button; `POST …/translate` → 403 |
| credential with a wrong API key | dialog shows "provider rejected the configured credentials"; canvas unchanged |
| OpenAI-compatible credential saved without a Base URL, or with `ftp://x` | the Credentials form refuses it |
| the AI assistant (⌘K prompt mode) pointed at a DeepSeek or OpenAI-compatible credential | it answers, as with OpenAI |
| Audit log | one `cms.page_builder.translate` entry per translation, with provider/model/counts, no text |

## 5. Without a real provider (what CI does)

```bash
pnpm --filter @endora-commerce/llm-client run test
pnpm --filter @endora-commerce/contracts run test
pnpm --filter @endora-commerce/mod-cms run test            # extractor, codec, chunker, service (fake fetch)
pnpm --filter @endora-commerce/mod-prompt-actions run test # unchanged behaviour after the move
pnpm --filter backend exec vitest run test/contract/cms/page-builder-translation.contract.test.ts
pnpm --filter backend exec vitest run test/integration/cms/page-builder-translation.test.ts
pnpm --filter backend exec vitest run test/integration/cms/off-state.test.ts
pnpm --filter admin exec vitest run test/modules/cms/page-builder-translate-action.test.tsx
```

The contract and integration suites register `cmsTranslationLlmFetch` with a fake that answers each
chunk with a deterministic "translation" (the source wrapped in `[en]…[/en]`, tags and placeholders
kept), which makes guarantees G1–G6 assertable byte for byte.

## 6. Manual walk owed before merge

Run §2–§4 against one real provider of each kind available to the team, in both admin languages,
and paste the result (provider, model, page size, duration) into the pull request. Have the product
owner review the Polish strings of `contracts/admin-surfaces.md` §7 during this walk.
