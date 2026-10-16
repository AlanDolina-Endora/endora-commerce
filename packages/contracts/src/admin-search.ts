// Admin global search (`specs/150-admin-global-search/`).
//
// Two halves, one file, because they describe one seam:
//
//  * the HTTP shapes `admin_search` answers on `/api/v1/admin/global-search*`
//    and the admin shell parses with (`contracts/admin-search-api.md`);
//  * the provider contract an owning module implements to make its records
//    findable (`contracts/provider-contract.md`). The host never names a
//    provider module, never reads a provider's table and never imports a
//    provider's class: each owner pushes an `AdminSearchProvider` built over its
//    own services into `adminSearchProviderRegistry`.

import { z } from 'zod';
import { KnownIconNameSchema, type KnownIconName } from './admin-actions.js';
import type { PermissionRequirement } from './admin-contributions.js';
import { SupportedAdminLanguageSchema, type SupportedAdminLanguage } from './admin-i18n.js';

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

/** `<moduleId>.<snake_name>`, e.g. `orders.order`. */
export const AdminSearchEntityTypeSchema = z
  .string()
  .max(128)
  .regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/, 'Entity type must be <moduleId>.<snake_name>');

/** camelCase, unique within one provider. */
export const AdminSearchFieldCodeSchema = z
  .string()
  .max(40)
  .regex(/^[a-z][a-zA-Z0-9]*$/, 'Field code must be camelCase');

/**
 * A module-relative translation key (`adminSearch.field.number`). The grammar
 * of a palette action's `labelKey`: a flat bundle key, dot-separated camelCase
 * segments.
 */
export const AdminSearchLabelKeySchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-z][a-zA-Z0-9_]*(\.[a-z][a-zA-Z0-9_]*)*$/, 'Translation key must be dot-separated camelCase');

/** Most fields one record type may offer. */
export const ADMIN_SEARCH_MAX_FIELDS = 20;
/** Most record types one stored configuration may carry. */
export const ADMIN_SEARCH_MAX_ENTITY_TYPES = 64;
/** Longest search text accepted (FR-012). */
export const ADMIN_SEARCH_MAX_QUERY_LENGTH = 100;
/** Most results one record type may be asked for (the results page asks 20). */
export const ADMIN_SEARCH_MAX_LIMIT = 25;

// ---------------------------------------------------------------------------
// HTTP: capability
// ---------------------------------------------------------------------------

/** `GET /api/v1/admin/global-search/capability` — what the palette needs once per open. */
export const AdminSearchCapabilitySchema = z.object({
  minimumQueryLength: z.number().int().min(2).max(10),
  resultsPerEntity: z.number().int().min(1).max(10),
  /** The entity types this caller would get results for right now (present ∧ permitted ∧ enabled). */
  entityTypes: z.array(
    z.object({
      entityType: AdminSearchEntityTypeSchema,
      label: z.string(),
      icon: KnownIconNameSchema,
    }),
  ),
});
export type AdminSearchCapability = z.infer<typeof AdminSearchCapabilitySchema>;

export const AdminSearchCapabilityQuerySchema = z.object({
  language: SupportedAdminLanguageSchema,
});

// ---------------------------------------------------------------------------
// HTTP: search
// ---------------------------------------------------------------------------

/** `GET /api/v1/admin/global-search` query string. */
export const AdminSearchQuerySchema = z.object({
  /** Trimmed server-side; longer than 100 characters is refused. */
  q: z.string().max(ADMIN_SEARCH_MAX_QUERY_LENGTH),
  /** Comma-separated in the query string. */
  entityTypes: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').filter(Boolean) : undefined))
    .pipe(z.array(AdminSearchEntityTypeSchema).max(16).optional()),
  /** Default: the `admin_search.results_per_entity` setting. */
  limit: z.coerce.number().int().min(1).max(ADMIN_SEARCH_MAX_LIMIT).optional(),
  language: SupportedAdminLanguageSchema,
});
export type AdminSearchQuery = z.infer<typeof AdminSearchQuerySchema>;

/**
 * An admin path, optionally with a query string (category focus). Never an
 * absolute URL and never protocol-relative: the shell navigates to it.
 */
export const AdminSearchTargetRouteSchema = z
  .string()
  .max(512)
  .regex(/^\/(?!\/)[A-Za-z0-9\-._~/:%]*(\?[A-Za-z0-9\-._~=&%]*)?$/, 'Target route must be an admin path');

export const AdminSearchHitSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  status: z.object({ code: z.string(), label: z.string() }).nullable(),
  targetRoute: AdminSearchTargetRouteSchema,
});
export type AdminSearchHit = z.infer<typeof AdminSearchHitSchema>;

export const AdminSearchGroupStatusSchema = z.enum(['ok', 'timed_out', 'failed']);
export type AdminSearchGroupStatus = z.infer<typeof AdminSearchGroupStatusSchema>;

export const AdminSearchGroupSchema = z.object({
  entityType: AdminSearchEntityTypeSchema,
  label: z.string(),
  icon: KnownIconNameSchema,
  status: AdminSearchGroupStatusSchema,
  /** Empty unless `status === 'ok'`. */
  hits: z.array(AdminSearchHitSchema),
  hasMore: z.boolean(),
});
export type AdminSearchGroup = z.infer<typeof AdminSearchGroupSchema>;

export const AdminSearchResultSchema = z.object({
  /** The trimmed text actually searched. */
  query: z.string(),
  groups: z.array(AdminSearchGroupSchema),
});
export type AdminSearchResult = z.infer<typeof AdminSearchResultSchema>;

export const AdminSearchResponseMetaSchema = z.object({
  belowMinimumLength: z.boolean(),
  minimumQueryLength: z.number().int(),
  limit: z.number().int(),
  tookMs: z.number().int().nonnegative(),
});
export type AdminSearchResponseMeta = z.infer<typeof AdminSearchResponseMetaSchema>;

export const AdminSearchResponseSchema = z.object({
  data: AdminSearchResultSchema,
  meta: AdminSearchResponseMetaSchema,
});
export type AdminSearchResponse = z.infer<typeof AdminSearchResponseSchema>;

// ---------------------------------------------------------------------------
// HTTP: configuration
// ---------------------------------------------------------------------------

export const AdminSearchConfigurationFieldViewSchema = z.object({
  code: AdminSearchFieldCodeSchema,
  label: z.string(),
  selected: z.boolean(),
  defaultSelected: z.boolean(),
});

export const AdminSearchConfigurationEntityViewSchema = z.object({
  entityType: AdminSearchEntityTypeSchema,
  label: z.string(),
  icon: KnownIconNameSchema,
  enabled: z.boolean(),
  /** `false` ⇔ no stored entry (the defaults apply). */
  customized: z.boolean(),
  fields: z.array(AdminSearchConfigurationFieldViewSchema),
});
export type AdminSearchConfigurationEntityView = z.infer<
  typeof AdminSearchConfigurationEntityViewSchema
>;

/** `GET /api/v1/admin/global-search/configuration`. */
export const AdminSearchConfigurationViewSchema = z.object({
  /** Settings' optimistic-lock token, `''` before the first write. */
  version: z.string(),
  minimumQueryLength: z.number().int(),
  resultsPerEntity: z.number().int(),
  entities: z.array(AdminSearchConfigurationEntityViewSchema),
});
export type AdminSearchConfigurationView = z.infer<typeof AdminSearchConfigurationViewSchema>;

/** `PUT /api/v1/admin/global-search/configuration`. */
export const UpdateAdminSearchConfigurationRequestSchema = z.object({
  /** `null` only for the first write. */
  expectedVersion: z.string().nullable(),
  entities: z
    .array(
      z.object({
        entityType: AdminSearchEntityTypeSchema,
        /** Omit both `enabled` and `fields` to restore the defaults (the stored entry is removed). */
        enabled: z.boolean().optional(),
        fields: z.array(AdminSearchFieldCodeSchema).max(ADMIN_SEARCH_MAX_FIELDS).optional(),
      }),
    )
    .max(ADMIN_SEARCH_MAX_ENTITY_TYPES),
});
export type UpdateAdminSearchConfigurationRequest = z.infer<
  typeof UpdateAdminSearchConfigurationRequestSchema
>;

// ---------------------------------------------------------------------------
// Stored configuration (`admin_search.entity_fields`, a hidden `json` Setting)
// ---------------------------------------------------------------------------

export const AdminSearchStoredEntityConfigurationSchema = z.object({
  enabled: z.boolean(),
  fields: z.array(AdminSearchFieldCodeSchema).max(ADMIN_SEARCH_MAX_FIELDS),
});
export type AdminSearchStoredEntityConfiguration = z.infer<
  typeof AdminSearchStoredEntityConfigurationSchema
>;

export const AdminSearchStoredConfigurationSchema = z.object({
  version: z.literal(1),
  entities: z
    .record(AdminSearchEntityTypeSchema, AdminSearchStoredEntityConfigurationSchema)
    .refine((v) => Object.keys(v).length <= ADMIN_SEARCH_MAX_ENTITY_TYPES, {
      message: `At most ${ADMIN_SEARCH_MAX_ENTITY_TYPES} entity types`,
    }),
});
export type AdminSearchStoredConfiguration = z.infer<typeof AdminSearchStoredConfigurationSchema>;

/** The shipped value of `admin_search.entity_fields`: every provider's defaults apply. */
export const ADMIN_SEARCH_DEFAULT_STORED_CONFIGURATION: AdminSearchStoredConfiguration = {
  version: 1,
  entities: {},
};

// ---------------------------------------------------------------------------
// Provider contract (`contracts/provider-contract.md` §1)
// ---------------------------------------------------------------------------

export interface AdminSearchFieldDescriptor {
  readonly code: string;
  /** Relative to the contributing module's i18n namespace, e.g. `adminSearch.field.number`. */
  readonly labelKey: string;
  readonly defaultSelected: boolean;
  /** Exact and prefix matches on this field rank first. */
  readonly identifier: boolean;
}

/**
 * The part of `AbortSignal` a provider may read. Structural, because this
 * package carries neither the DOM nor the Node type library; a real
 * `AbortSignal` satisfies it.
 */
export interface AdminSearchAbortSignal {
  readonly aborted: boolean;
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
  readonly signal: AdminSearchAbortSignal;
}

export interface AdminSearchProviderHit {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly status: { readonly code: string; readonly label: string } | null;
  readonly targetRoute: string;
}

export interface AdminSearchProviderResult {
  /** At most `limit`, ranked. */
  readonly hits: readonly AdminSearchProviderHit[];
  readonly hasMore: boolean;
}

export interface AdminSearchProvider {
  /** `<moduleId>.<snake_name>`, unique. */
  readonly entityType: string;
  /** The contributing module; presence is keyed on it. */
  readonly moduleId: string;
  /** Group title, relative to the module's namespace, e.g. `adminSearch.group.label`. */
  readonly labelKey: string;
  readonly icon: KnownIconName;
  /** The code the type's own admin list route enforces. */
  readonly requiredPermission: PermissionRequirement;
  /** Group order, ascending. Core types use 100..700. */
  readonly weight: number;
  readonly fields: readonly AdminSearchFieldDescriptor[];
  search(query: AdminSearchProviderQuery): Promise<AdminSearchProviderResult>;
}

/**
 * The contribution shape: the host keeps the class, a contributor names this
 * interface. Deliberately **not** a gated port — a contributor pushes from its
 * own boot hook whatever the host's effective state is, and the host answers
 * the presence question at enumeration, keyed on `moduleId`. Push only:
 * nothing is read back.
 */
export interface AdminSearchProviderRegistryPort {
  register(provider: AdminSearchProvider): void;
}
