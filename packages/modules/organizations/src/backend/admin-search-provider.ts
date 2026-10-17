import type {
  AdminSearchFieldDescriptor,
  AdminSearchProvider,
  AdminSearchProviderQuery,
  SupportedAdminLanguage,
} from '@endora-commerce/contracts';

/** What the Organization record type offers global search (`specs/150-admin-global-search/` FR-022). */
export const ORGANIZATION_ADMIN_SEARCH_FIELDS: readonly AdminSearchFieldDescriptor[] = [
  // Diacritic-insensitive: matched against the folded `name_search` copy (FR-011).
  { code: 'name', labelKey: 'adminSearch.field.name', defaultSelected: true, identifier: false },
  { code: 'taxId', labelKey: 'adminSearch.field.taxId', defaultSelected: true, identifier: true },
  { code: 'legalName', labelKey: 'adminSearch.field.legalName', defaultSelected: false, identifier: false },
];

export const ORGANIZATION_ADMIN_SEARCH_STATUS_KEYS: Readonly<Record<string, string>> = {
  pending_verification: 'adminSearch.status.pendingVerification',
  active: 'adminSearch.status.active',
  blocked: 'adminSearch.status.blocked',
  rejected: 'adminSearch.status.rejected',
};

export interface OrganizationAdminSearchQuery {
  readonly text: string;
  readonly likeEscaped: string;
  readonly isUuid: boolean;
  readonly fields: readonly string[];
  readonly limit: number;
}

export interface OrganizationAdminSearchRow {
  readonly id: string;
  readonly name: string;
  readonly taxId: string | null;
  readonly city: string | null;
  readonly status: string;
}

export interface OrganizationAdminSearchProviderDeps {
  /** Ranked (assigned organizations first for a scoped admin), `limit` rows at most. */
  search(query: OrganizationAdminSearchQuery): Promise<{ rows: OrganizationAdminSearchRow[]; hasMore: boolean }>;
  translate(key: string, language: SupportedAdminLanguage): Promise<string>;
}

/**
 * The Organization provider. Visibility is the Organizations list's own — its
 * any-of `customers:read` / `customers:manage` gate and its rows (business,
 * not deleted) — and, by the owner's answer to spec Q2, **not** the admin's
 * organization scope: a scoped admin sees their assigned organizations first
 * and every other one after (FR-015a).
 */
export function createOrganizationAdminSearchProvider(
  deps: OrganizationAdminSearchProviderDeps,
): AdminSearchProvider {
  return {
    entityType: 'organizations.organization',
    moduleId: 'organizations',
    labelKey: 'adminSearch.group.label',
    icon: 'Building2',
    requiredPermission: ['customers:read', 'customers:manage'],
    weight: 400,
    fields: ORGANIZATION_ADMIN_SEARCH_FIELDS,
    async search(query: AdminSearchProviderQuery) {
      const { rows, hasMore } = await deps.search({
        text: query.text,
        likeEscaped: query.likeEscaped,
        isUuid: query.isUuid,
        fields: query.fields,
        limit: query.limit,
      });
      const hits = await Promise.all(
        rows.map(async (row) => {
          const statusKey = ORGANIZATION_ADMIN_SEARCH_STATUS_KEYS[row.status];
          const subtitle = [row.taxId, row.city].filter((part): part is string => Boolean(part)).join(' · ');
          return {
            id: row.id,
            title: row.name,
            subtitle: subtitle === '' ? null : subtitle,
            status: {
              code: row.status,
              label: statusKey === undefined ? row.status : await deps.translate(statusKey, query.language),
            },
            targetRoute: `/organizations/${row.id}`,
          };
        }),
      );
      return { hits, hasMore };
    },
  };
}
