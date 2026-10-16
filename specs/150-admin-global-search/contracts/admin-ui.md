# Contract: Admin UI — palette records, results page, configuration screen

UX rules: `.claude/skills/ux-laws/SKILL.md` (read before building). Primitives from
`@endora-commerce/admin-kit`; no new kit component unless noted.

## 1. Command palette (shell, `packages/admin-shell/`)

### 1.1 Data flow

- `packages/admin-shell/src/lib/global-search/api.ts` — `getAdminSearchCapability(language)`,
  `searchAdminRecords({ q, limit?, entityTypes?, language }, signal)`; both parse with the contract
  schemas.
- `packages/admin-shell/src/lib/global-search/useGlobalSearch.ts` —
  `useGlobalSearch(open: boolean, query: string, language)` returns
  `{ available: boolean, state: 'idle' | 'loading' | 'ready', groups, minimumQueryLength }`:
  - on `open` → fetch capability once **per open** (no module-level cache — the assistant probe's
    lesson, `AppShell.tsx` `promptCapabilityCache` comment); any failure or empty `entityTypes` ⇒
    `available: false` for this open;
  - `query.trim().length < minimumQueryLength` ⇒ `idle`, no request;
  - otherwise debounce **250 ms**, abort the previous `AbortController`, request with
    `limit = resultsPerEntity`; ignore a response whose `data.query` is not the current trimmed
    query (FR-007 belt-and-braces);
  - `/ai` prompt-mode switching and voice input keep working unchanged.

### 1.2 Rendering

- `PaletteItem.group` gains `'Records'`, plus an optional `groupKey` (entity type) and `groupLabel`
  (server-resolved) so each record type renders its own header; rows use `labelMode: 'literal'`.
- Order of the list: Assistant → Navigate → Actions → one block per record type (server order) →
  "See all results for “<q>”" (`to: /global-search?q=<encoded>`) when record search ran.
- A record row: icon (`resolveIcon(group.icon)`), `title`, `subtitle` muted, and `status.label` as a
  right-aligned badge (kit `Badge`, neutral tone; no colour-only meaning). The `↵` hint keeps its
  place.
- `hasMore` ⇒ the group header shows "more" text (`appShell.palette.records.more`), not a row.
- `status: 'timed_out' | 'failed'` ⇒ one non-selectable muted row under that header:
  "<label> could not be searched" (`appShell.palette.records.unavailable`). Non-selectable rows are
  **not** in the cursor sequence (keyboard and pointer stay identical).
- `loading` ⇒ one non-selectable row "Searching…" (`appShell.palette.records.searching`) after
  Actions; existing groups render immediately (records never delay screens/actions).
- The empty state (`appShell.search.noMatches`) shows only when **every** group is empty **and**
  record search is not loading.
- The list container gets `aria-live="polite"` on a visually hidden status line announcing
  "<n> records found" (`appShell.palette.records.announce`) after each settled search (FR-033);
  focus never moves from the input.

### 1.3 Core i18n keys (`packages/modules/_i18n/i18n/en.json`, `pl.json`, flat)

| Key | en | pl |
| --- | --- | --- |
| `appShell.palette.records.searching` | Searching records… | Wyszukiwanie rekordów… |
| `appShell.palette.records.more` | More results | Więcej wyników |
| `appShell.palette.records.unavailable` | {label} could not be searched | Nie udało się przeszukać: {label} |
| `appShell.palette.records.seeAll` | See all results for “{query}” | Zobacz wszystkie wyniki dla „{query}” |
| `appShell.palette.records.announce` | {count} records found | Znaleziono rekordów: {count} |

Single-brace placeholders (`{count}`, `{label}`) are the core bundle's existing syntax.

## 2. `admin_search` admin layer (`packages/modules/admin_search/src/admin/`)

```ts
export const contributions: AdminContributions = {
  routes: [
    { path: '/global-search', component: () => import('./pages/GlobalSearchPage.js'), index: true },
    {
      path: '/global-search/configuration',
      component: () => import('./pages/GlobalSearchConfigurationPage.js'),
      requiredPermission: 'admin_search:configure',
    },
  ],
  nav: [
    {
      to: '/global-search/configuration',
      labelKey: 'nav.configuration.label',
      icon: 'Search',
      section: 'system',
      weight: 650,
      requiredPermission: 'admin_search:configure',
    },
  ],
};
```

### 2.1 Results page `/global-search?q=&type=`

- A search input (kit `Input`, `type="search"`, labelled), prefilled from `q`, debounced 250 ms,
  writing `q` back with `replace` navigation; a row of type filter chips (kit `Button`, `outline`
  variant, the selected one `aria-pressed="true"`) "All" + one per capability entity type,
  writing `type`.
- Calls `GET /api/v1/admin/global-search?q&entityTypes=<type>&limit=20`.
- Per group: a card (kit `Card`) with the label, up to 20 rows as links (`<Link to={targetRoute}>`),
  status badge, "more results exist — refine the search" note on `hasMore`, unavailable note on
  failure.
- States: idle (below minimum: hint text with the minimum), loading (skeleton rows), empty, error
  (retry). Fully keyboard-reachable via native links and tab order.

### 2.2 Configuration page `/global-search/configuration`

- One kit `Card` per entity type (server order): title, a `Checkbox` "Include in global search"
  (the kit has no switch primitive; do not add one for this screen), a checklist of offered fields (kit `Checkbox` + `Label`), "default" marked on default fields
  (text, not colour), a "Restore defaults" button (disabled when `customized` is false).
- An enabled type with no ticked field shows an inline error and disables **Save** (FR-020); the
  server enforces it too.
- Sticky footer: the kit's `SaveButtonGroup` (**Save** / **Discard changes**); leaving with unsaved changes asks for
  confirmation through the kit's `ModalDialog` (promoted in feature 147), never `window.confirm`.
- 409 `VERSION_CONFLICT` ⇒ dialog "The configuration was changed by someone else. Reload it?" with
  Reload / Keep editing.
- A short note links to the Settings screen for the minimum length and per-type count.

### 2.3 Palette actions (`admin_search` manifest)

| id | labelKey / descriptionKey | icon | targetRoute | requiredPermission | keywords | weight |
| --- | --- | --- | --- | --- | --- | --- |
| `open-global-search` | `actions.openGlobalSearch.label` / `.description` | `Search` | `/global-search` | — | `search find records szukaj wyszukaj rekordy` | 50 |
| `open-global-search-configuration` | `actions.openConfiguration.label` / `.description` | `Settings` | `/global-search/configuration` | `admin_search:configure` | `search fields configuration pola wyszukiwania konfiguracja` | 900 |

### 2.4 `admin_search` bundle (`packages/modules/admin_search/i18n/{en,pl}.json`, flat)

`adminRoles.permission.admin_search:configure`, `nav.configuration.label`, the four `actions.*`
keys, and the page strings under `page.results.*` and `page.configuration.*` (titles, input label,
chip "All", hints, empty/error/loading texts, Save/Discard/Restore defaults, "Include in global
search", "Default", conflict dialog, at-least-one-field error, link to Settings). Every key in both
languages.

## 3. Provider bundles (one per owning module)

Each owning module adds, in its own `i18n/en.json` and `pl.json`:

| Module | Keys |
| --- | --- |
| `orders` | `adminSearch.group.label` (Orders / Zamówienia), `adminSearch.field.number`, `.organizationName`, `.customer`, `.billingCompanyName`, `.billingTaxId` |
| `quote_requests` | `adminSearch.group.label` (Quote Requests / Zapytania ofertowe), `adminSearch.field.number`, `.organizationName`, `.customer`, `.customerNote` |
| `crm` | `adminSearch.group.label` (Sales Opportunities / Szanse sprzedaży), `adminSearch.field.number`, `.title`, `.organizationName`, `.description` |
| `organizations` | `adminSearch.group.label` (Organizations / Organizacje), `adminSearch.field.name`, `.taxId`, `.legalName` |
| `customers` | `adminSearch.group.label` (Customers / Klienci), `adminSearch.field.email`, `.name` |
| `catalog` | `adminSearch.product.group.label` (Products / Produkty), `adminSearch.product.field.sku`, `.name`, `.slug`, `.quickSearchAttributes`; `adminSearch.category.group.label` (Categories / Kategorie), `adminSearch.category.field.name`, `.slug` |

Use each module's existing vocabulary in Polish (read the module's `pl.json` first; e.g. if the
module says "Zapytania o wycenę", use that, not the table above).

## 4. Icons

Order `Receipt`, Quote Request `ClipboardList`, Sales Opportunity `CircleDollarSign`, Organization
`Building2`, Customer `Users`, Product `Package`, Category `Layers` — all already in
`KnownIconNameSchema`; no icon-map change.

## 5. Catalog: category focus (research R-15)

`packages/modules/catalog/src/admin/pages/CategoriesTree.tsx` reads `?focus=<id>`: expands the
ancestors, scrolls the row into view, highlights it (kit focus ring token + `aria-current="true"`),
and moves focus to it once after load. Unknown id ⇒ ignored.
