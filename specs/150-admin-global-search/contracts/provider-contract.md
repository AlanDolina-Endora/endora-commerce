# Contract: Contributing a searchable record type

**Owner of the registry**: `admin_search` | **Types**: `packages/contracts/src/admin-search.ts`
**Precedent**: `promptActionToolRegistry` (`packages/contracts/src/prompt-actions.ts:384-398`,
`packages/modules/orders/src/backend/index.ts:1073`).

This is the only seam between global search and the modules whose records it finds (research R-2).
A module adds a record type by following §3 — no change to `admin_search` or to the admin shell.

## 1. Types

```ts
import type { KnownIconName } from './admin-actions.js';
import type { PermissionRequirement } from './admin-contributions.js';
import type { SupportedAdminLanguage } from './admin-i18n.js';

/** `<moduleId>.<snake_name>`, e.g. `orders.order`. */
export const AdminSearchEntityTypeSchema = z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/);
/** camelCase, unique within one provider. */
export const AdminSearchFieldCodeSchema = z.string().regex(/^[a-z][a-zA-Z0-9]*$/).max(40);

export interface AdminSearchFieldDescriptor {
  readonly code: string;
  /** Relative to the contributing module's i18n namespace, e.g. `adminSearch.field.number`. */
  readonly labelKey: string;
  readonly defaultSelected: boolean;
  /** Exact and prefix matches on this field rank first (research R-9). */
  readonly identifier: boolean;
}

export interface AdminSearchProviderQuery {
  /** Trimmed, 1..100 chars, already at or above the minimum length. Not escaped. */
  readonly text: string;
  /** `text` escaped for `ILIKE … ESCAPE '\'` — use this in patterns, never `text`. */
  readonly likeEscaped: string;
  /** Whether `text` is a UUID (FR-010: match `id` regardless of `fields`). */
  readonly isUuid: boolean;
  /** Non-empty subset of the provider's offered codes, in offer order. */
  readonly fields: readonly string[];
  /** Rows wanted; fetch `limit + 1` to answer `hasMore`. 1..25. */
  readonly limit: number;
  /** For `title`/`subtitle`/`status.label` and per-language names. */
  readonly language: SupportedAdminLanguage;
  /** The calling admin (for owners whose list scope needs it, e.g. `customers`). */
  readonly adminUserId: string;
  /** Aborted at the host's deadline; honour it where the driver allows, ignore otherwise. */
  readonly signal: AbortSignal;
}

export interface AdminSearchProviderHit {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly status: { readonly code: string; readonly label: string } | null;
  readonly targetRoute: string;
}

export interface AdminSearchProviderResult {
  readonly hits: readonly AdminSearchProviderHit[]; // ≤ limit, ranked
  readonly hasMore: boolean;
}

export interface AdminSearchProvider {
  readonly entityType: string;
  readonly moduleId: string;
  /** Group title, relative to the module's namespace, e.g. `adminSearch.group.label`. */
  readonly labelKey: string;
  readonly icon: KnownIconName;
  /** The code the type's own admin list route enforces (`check` in §5). */
  readonly requiredPermission: PermissionRequirement;
  /** Group order, ascending. Core types use 100..700 (data-model.md §5). */
  readonly weight: number;
  readonly fields: readonly AdminSearchFieldDescriptor[];
  search(query: AdminSearchProviderQuery): Promise<AdminSearchProviderResult>;
}

/**
 * Container name: `adminSearchProviderRegistry`. Owner: `admin_search`.
 *
 * The contribution shape: the host keeps the class, a contributor names this
 * interface. Deliberately **not** a gated port — a contributor pushes from its
 * own boot hook whatever the host's effective state is, and the host answers
 * the presence question at enumeration, keyed on `moduleId`. Push only:
 * nothing is read back.
 */
export interface AdminSearchProviderRegistryPort {
  register(provider: AdminSearchProvider): void;
}
```

(The `Container name:` line lands in the same change that registers the name — `check:port-shape`
refuses a marked port nobody registers.)

## 2. What the host guarantees a provider

- `search` is called only when the provider's module is effectively present, the caller holds
  `requiredPermission`, and the type is enabled in the configuration.
- It runs **inside the admin's request**, under the request's tenant context, so the module's
  request-scoped `emFactory()` applies the `@OrgScoped` filters.
- `fields` is never empty and contains only offered codes.
- A thrown error (other than `ModuleDisabledError`) or a result after `PROVIDER_DEADLINE_MS` turns
  into an `unavailable` group; it never fails the whole search.

## 3. What a provider must do

1. **Same visibility as the type's own admin list** (FR-015): the same tenant/sales-rep scope, the
   same exclusions (soft-deleted, anonymized, personal organizations), never a wider row set. When the
   entity is a `@GlobalEntity` that belongs to an organization, constrain it with `orgConstraintFor`
   from `@endora-commerce/platform/tenancy` (`orgScopeWhere` is not on the published barrel).
   **The one exception is the Organization record type itself** (owner answer to spec Q2): its own
   admin list is not scope-limited, so neither is its provider — it ranks the admin's assigned
   organizations first instead (FR-015a).
2. **Bounded**: one round trip where possible (cross-reference id lookups through the owners' ports
   are allowed first), `LIMIT limit + 1`, no `count(*)`, no unbounded `IN` built from its own table.
3. **Literal matching**: patterns from `likeEscaped` with `ESCAPE '\'`; parameters bound, never
   interpolated.
4. **Ranking** per research R-9: identifier exact → prefix → rest; ties `updated_at desc`; a row
   appears once.
5. **Display in `language`**: localized status labels and names, falling back to the default
   language; no raw codes as labels.
6. **`targetRoute`** is an admin path the caller's role can open with the same permission.
7. **No writes, no events, no audit rows.** Reads only.
8. **No captured port**: resolve foreign ports with `lazyPort<T>(ctx, 'literal')` when building the
   provider (module-composition.md item 3), and do not wrap them in a bare `catch` (item 7).
9. **i18n**: `labelKey` and every field `labelKey` exist, flat, in the module's `i18n/en.json` and
   `i18n/pl.json`.

## 4. Wiring in the contributing module

```ts
// packages/modules/<id>/src/manifest.ts
nonBindingDependencies: [
  {
    moduleId: 'admin_search',
    name: 'adminSearchProviderRegistry',
    kind: 'contributes-to',
    reason:
      'A push, from this module’s contribution-only boot hook, of the <Record type> provider for ' +
      'the admin global search, built over this module’s own read services. Nothing is read back: ' +
      'the registry enumerates only providers whose module is effectively present, so an absent ' +
      'contributor costs the host nothing and an absent host holds a table nobody walks. Not ' +
      '`dependencies`: that would make global search a reason this module cannot be switched off, ' +
      'or — for a non-deactivatable module — make `admin_search.enabled` a dead switch.',
  },
],

// packages/modules/<id>/src/backend/index.ts — a hook that contributes and does nothing else
ctx.onBoot(() => {
  const registry = lazyPort<AdminSearchProviderRegistryPort>(ctx, 'adminSearchProviderRegistry');
  registry.register(create<Type>AdminSearchProvider({ /* own services, lazyPorts */ }));
});
```

The provider factory lives in `packages/modules/<id>/src/backend/admin-search-provider.ts` with its
unit test beside it. A hook that already does **work** for the module is not reused: contribution and
work stay in separate hooks (module-activation.md, boot-hook split).

## 5. Checks a provider is held to

- `check:port-dependencies` — the `contributes-to` edge resolves to a registered name.
- `admin_search` contract test `backend/test/contract/admin_search/provider-conformance.test.ts` —
  for **every** registered provider: registry invariants; labels resolve in `en` and `pl`;
  `requiredPermission` equals the permission enforced on the GET route of `targetRoute`'s list (a
  table in the test, one row per entity type, read from the owners' routes — the
  `check:action-route-permissions` idea applied to search); `search` with the first default field
  returns ≤ `limit` hits and a `hasMore` consistent with `limit + 1`; wildcard text matched
  literally.
- Per-provider integration test in `backend/test/integration/admin_search/` — scope (platform admin vs
  sales representative with one assigned organization) and exclusions.
