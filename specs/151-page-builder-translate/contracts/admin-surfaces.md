# Contract: admin surfaces — editor action, settings, permission, palette, strings

**Owner**: `cms` (one generic slot added to `@endora-commerce/page-builder-admin`).
Rules followed: `specs/conventions/module-admin-surfaces.md`, `specs/conventions/module-i18n.md`,
`.claude/skills/ux-laws/SKILL.md`.

## 1. Shared chrome change (`packages/page-builder-admin/src/chrome/PageBuilderHeaderActions.tsx`)

One optional prop, nothing else:

```ts
/** Module-owned actions rendered first in the right-hand header group. The chrome owns no copy for them. */
extraActions?: ReactNode;
```

Rendered as the first child of `.cms-pb-header-actions`. Existing callers (`invoices`, e-mail
builders, `cms`) that pass nothing render exactly as before (snapshot test).

## 2. `PageBuilderEditor` (cms) — new props

```ts
/** Audit context for translation; never sent anywhere else. */
resource?: { type: string; id: string | null };
```

`activeLanguage` and `languages` already exist. The Translate action is rendered when, and only when:

| Condition | Result |
| --- | --- |
| `activeLanguage` is null | not rendered |
| operator lacks `cms.translate` (`useAuth().hasPermission`) | not rendered; capability is not fetched |
| capability `disabled` | not rendered |
| capability `not_configured` | rendered **disabled**, tooltip/description: not configured, where to configure (Settings → Page Builder) |
| capability `unavailable` | rendered **disabled**, description names the Credentials module |
| capability `ready`, canvas empty and no other language tab has content | rendered **disabled**, "nothing to translate" |
| capability `ready` | enabled |
| capability request failed | not rendered (the editor must never break because of an optional function) |

## 3. `PageBuilderTranslateAction` (new, `packages/modules/cms/src/admin/components/`)

- **Button**: `variant="outline" size="sm"`, lucide `Languages` icon + label `Translate` (`aria-label`
  identical), same shape as Copy from language. Keyboard reachable; focus returns to it when the
  dialog closes.
- **Dialog** (the same hand-rolled portal pattern Copy from language uses — no new primitive,
  Constitution IX): title; target language (read-only, the active tab); **Source** select —
  "Current content of this tab (language detected automatically)" [default] then one option per
  other language tab; the line "Content will be sent to {provider} ({model})."; when another tab is
  the source and the canvas is not empty, a warning that the current canvas will be replaced;
  buttons Cancel / Translate.
- **In progress**: the confirm button shows a spinner and "Translating…", `aria-busy`, the dialog
  cannot be dismissed by backdrop click, **Cancel** aborts the request (FR-021) and closes.
- **Success**: dialog closes; a `role="status"` notice in the editor: "Translated {n} texts into
  {language}." plus, when non-zero, "{m} texts kept their original wording." and "{k} blocks cannot
  be translated."; a **Restore previous content** button in the notice (FR-019). The notice persists
  until dismissed, saved, tab switched, or translated again.
- **Failure**: the dialog stays open, an inline `text-destructive` message from the error envelope's
  `message` (already translated by the backend), Translate re-enabled for retry; the canvas is
  unchanged.
- **Apply**: `resolveAllData(result.data, config)` then the editor's `applyCanvasData` (R6, R10).

Required states per the UX skill: default, hover, focus-visible, disabled-with-reason, loading,
error, success, empty (nothing to translate). WCAG 2.2 AA: contrast via tokens, the disabled reason
exposed through `aria-describedby`, not only `title`.

## 3a. Selection scope (research R22)

| Editor state when the button is pressed | Label (`aria-label` identical) | Request `scope` |
| --- | --- | --- |
| a non-collapsed text selection inside the editor (fields panel or canvas iframe) | **Translate selection** | `{ kind: 'text', componentId: <selection's block or Puck's selected item>, selectedText }` |
| a block selected in Puck, no text selection | **Translate component** | `{ kind: 'component', componentId }` |
| nothing selected | **Translate all content** | absent |
| the selected block's type has no `translatable` declaration in the descriptor | **Translate component**, **disabled**, description `selectionNotTranslatable` | — |

The source select (US3) is offered only for the whole-canvas scope; a scoped translation always reads
the current tab. The confirmation dialog states the scope. `422 CMS_TRANSLATION_SELECTION_NOT_FOUND`
shows its message in the dialog.

## 4. Settings (cms manifest, group `cms_page_builder`)

```ts
CMS_PAGE_BUILDER_SETTING_CODES = {
  …existing,
  TRANSLATION_ENABLED: 'cms.page_builder.translation.enabled',
  TRANSLATION_LLM_CREDENTIALS: 'cms.page_builder.translation.llm_credentials',
  TRANSLATION_MAX_SOURCE_CHARACTERS: 'cms.page_builder.translation.max_source_characters',
};
```

| Code | `name` (en) | `description` (en) |
| --- | --- | --- |
| `…translation.enabled` | Translation enabled | Shows the Translate button in the Page Builder. When on, editors with the "Translate Page Builder content with AI" permission can translate a canvas into the language being edited. The text of the canvas is sent to the provider of the model chosen below. |
| `…translation.llm_credentials` | Translation credentials | The LLM credential configuration (Credentials screen) whose provider, model and API key the Translate button uses. Supported providers: OpenAI, Anthropic, Google, DeepSeek and any OpenAI-compatible endpoint (through the configuration's Base URL). Required for the button to work. |

| `…translation.max_source_characters` | Translation size limit (characters) | The most text, in characters, one click of Translate may send to the model (default 40 000, allowed 1 000–200 000). A higher limit lets longer pages be translated at once but costs more per click and makes the editor wait longer on a single request, which a slow provider or a proxy timeout can then cut off. Larger content is refused before anything is sent. |

Polish (`settingLabels.cms.page_builder.translation.max_source_characters.*`): **Limit rozmiaru
tłumaczenia (znaki)** / *Największa liczba znaków tekstu, jaką jedno kliknięcie „Przetłumacz” może
wysłać do modelu (domyślnie 40 000, dozwolone 1 000–200 000). Wyższy limit pozwala przetłumaczyć
dłuższe strony naraz, ale zwiększa koszt jednego kliknięcia i wydłuża oczekiwanie na pojedyncze
żądanie, które wolny dostawca albo limit czasu serwera pośredniczącego może przerwać. Większa treść
jest odrzucana, zanim cokolwiek zostanie wysłane.*

## 5. Permission

`permissions: [ …, { code: 'cms.translate', label: 'Translate Page Builder content with AI' } ]`.

## 6. Command palette

```ts
{
  id: 'open-page-builder-translation-settings',
  labelKey: 'actions.openPageBuilderTranslationSettings.label',
  descriptionKey: 'actions.openPageBuilderTranslationSettings.description',
  icon: 'Sparkles',
  targetRoute: '/settings',           // the Settings screen has no per-group address
  requiredPermission: 'settings:read', // the code that screen is gated by (check:action-route-permissions)
  keywords: ['translate', 'translation', 'ai', 'llm', 'page builder', 'tłumacz', 'tłumaczenie', 'przetłumacz', 'kreator stron'],
  weight: 135,
}
```

## 6a. Credential form (`credentials`, R21)

`ConfigurationForm` renders a field whose definition carries `format: 'url'` as `<Input type="url"
inputMode="url">`, with the definition's placeholder; the provider select gains "OpenAI-compatible
(custom endpoint)", whose Base URL is marked required by the existing `required` asterisk. A Base URL
the server refuses comes back in the existing `CREDENTIAL_VALIDATION_FAILED` envelope.

## 7. Strings (flat keys, `packages/modules/cms/i18n/en.json` and `pl.json`)

| Key | en | pl |
| --- | --- | --- |
| `pageBuilder.translate.button` | Translate | Przetłumacz |
| `pageBuilder.translate.title` | Translate content | Przetłumacz treść |
| `pageBuilder.translate.target` | Into: {language} | Na język: {language} |
| `pageBuilder.translate.sourceLabel` | Source | Źródło |
| `pageBuilder.translate.sourceCurrent` | Current content of this tab (language detected automatically) | Bieżąca treść tej zakładki (język wykrywany automatycznie) |
| `pageBuilder.translate.sourceLanguage` | Content of {language} | Treść w języku {language} |
| `pageBuilder.translate.provider` | Content will be sent to {provider} ({model}). | Treść zostanie wysłana do {provider} ({model}). |
| `pageBuilder.translate.replaceWarning` | The current content of this tab will be replaced. | Bieżąca treść tej zakładki zostanie zastąpiona. |
| `pageBuilder.translate.confirm` | Translate | Przetłumacz |
| `pageBuilder.translate.cancel` | Cancel | Anuluj |
| `pageBuilder.translate.running` | Translating… | Tłumaczenie… |
| `pageBuilder.translate.success` | Translated {count} texts into {language}. | Przetłumaczono teksty: {count}, na język {language}. |
| `pageBuilder.translate.untranslated` | {count} texts kept their original wording. | Teksty bez tłumaczenia (pozostawione bez zmian): {count}. |
| `pageBuilder.translate.untranslatable` | {count} blocks cannot be translated. | Bloki, których nie można przetłumaczyć: {count}. |
| `pageBuilder.translate.scope.canvas` | Translate all content | Przetłumacz całą treść |
| `pageBuilder.translate.scope.component` | Translate component | Przetłumacz komponent |
| `pageBuilder.translate.scope.text` | Translate selection | Przetłumacz zaznaczenie |
| `pageBuilder.translate.scopeDescription.canvas` | Every text on this tab's canvas will be translated. | Zostaną przetłumaczone wszystkie teksty na tej zakładce. |
| `pageBuilder.translate.scopeDescription.component` | Only the selected component (and the components inside it) will be translated. | Zostanie przetłumaczony tylko zaznaczony komponent (wraz z komponentami w jego wnętrzu). |
| `pageBuilder.translate.scopeDescription.text` | Only the selected text will be translated. | Zostanie przetłumaczony tylko zaznaczony tekst. |
| `pageBuilder.translate.widened` | The selection crossed formatting, so whole paragraphs were translated. | Zaznaczenie obejmowało różne formatowanie, więc przetłumaczono całe akapity. |
| `pageBuilder.translate.selectionNotTranslatable` | The selected component has no text that can be translated. | Zaznaczony komponent nie zawiera tekstu, który można przetłumaczyć. |
| `errors.CMS_TRANSLATION_SELECTION_NOT_FOUND` | The selected text could not be found. Select it again and retry. | Nie znaleziono zaznaczonego tekstu. Zaznacz go ponownie i spróbuj jeszcze raz. |
| `pageBuilder.translate.restore` | Restore previous content | Przywróć poprzednią treść |
| `pageBuilder.translate.nothing` | There is no text to translate. | Brak tekstu do przetłumaczenia. |
| `pageBuilder.translate.notConfigured` | Translation is switched on but no model is configured. Choose credentials in Settings → Page Builder. | Tłumaczenie jest włączone, ale nie skonfigurowano modelu. Wybierz poświadczenia w Ustawienia → Page Builder. |
| `pageBuilder.translate.unavailable` | Translation is unavailable because the Credentials module is switched off. | Tłumaczenie jest niedostępne, ponieważ moduł Poświadczenia jest wyłączony. |
| `actions.openPageBuilderTranslationSettings.label` | Page Builder translation settings | Ustawienia tłumaczenia w Page Builderze |
| `actions.openPageBuilderTranslationSettings.description` | Switch AI translation on or off and choose its model | Włącz lub wyłącz tłumaczenie AI i wybierz model |
| `adminRoles.permission.cms.translate` | Translate Page Builder content with AI | Tłumaczenie treści Page Buildera przez AI |
| `settingLabels.cms.page_builder.translation.enabled.name` / `.description` | as §4 | Tłumaczenie włączone / Pokazuje przycisk „Przetłumacz” w Page Builderze. … Treść jest wysyłana do dostawcy wybranego niżej modelu. |
| `settingLabels.cms.page_builder.translation.llm_credentials.name` / `.description` | as §4 | Poświadczenia tłumaczenia / Konfiguracja LLM (ekran Poświadczenia), której dostawcy, modelu i klucza API używa przycisk „Przetłumacz”. … |
| `errors.CMS_TRANSLATION_DISABLED` | Page Builder translation is switched off. | Tłumaczenie w Page Builderze jest wyłączone. |
| `errors.CMS_TRANSLATION_NOT_CONFIGURED` | No translation model is configured for the Page Builder. | Nie skonfigurowano modelu tłumaczenia dla Page Buildera. |
| `errors.CMS_TRANSLATION_UNAVAILABLE` | Translation is unavailable because the Credentials module is switched off. | Tłumaczenie jest niedostępne, ponieważ moduł Poświadczenia jest wyłączony. |
| `errors.CMS_TRANSLATION_TOO_LARGE` | The content is too large to translate at once: {characters} characters, the limit set in Settings → Page Builder is {limit}. | Treść jest zbyt duża, by przetłumaczyć ją naraz: {characters} znaków, a limit ustawiony w Ustawienia → Page Builder to {limit}. |
| `errors.CMS_TRANSLATION_PROVIDER_FAILED` | The translation model could not complete the translation. | Model tłumaczący nie mógł wykonać tłumaczenia. |
| `errors.CMS_TRANSLATION_PROVIDER_FAILED.credentials_rejected` | The model provider rejected the configured credentials. | Dostawca modelu odrzucił skonfigurowane poświadczenia. |
| `errors.CMS_TRANSLATION_PROVIDER_FAILED.rate_limited` | The model provider's limit was reached. Try again in a moment. | Osiągnięto limit dostawcy modelu. Spróbuj ponownie za chwilę. |
| `errors.CMS_TRANSLATION_PROVIDER_FAILED.unavailable` | The model provider could not be reached. | Nie udało się połączyć z dostawcą modelu. |
| `errors.CMS_TRANSLATION_PROVIDER_FAILED.timeout` | The model provider did not answer in time. | Dostawca modelu nie odpowiedział na czas. |
| `errors.CMS_TRANSLATION_PROVIDER_FAILED.malformed` | The model returned an answer that could not be used. | Model zwrócił odpowiedź, której nie można użyć. |

Final Polish wording is reviewed by the product owner during the manual walk (quickstart §5); the
keys and their presence in both bundles are what tests hold.
