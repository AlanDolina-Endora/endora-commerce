import type {
  AdminSearchFieldDescriptor,
  AdminSearchProvider,
  AdminSearchProviderQuery,
  SupportedAdminLanguage,
} from '@endora-commerce/contracts';

/** What the Sales Opportunity record type offers global search (`specs/150-admin-global-search/` FR-022). */
export const OPPORTUNITY_ADMIN_SEARCH_FIELDS: readonly AdminSearchFieldDescriptor[] = [
  { code: 'number', labelKey: 'adminSearch.field.number', defaultSelected: true, identifier: true },
  { code: 'title', labelKey: 'adminSearch.field.title', defaultSelected: true, identifier: false },
  { code: 'organizationName', labelKey: 'adminSearch.field.organizationName', defaultSelected: true, identifier: false },
  { code: 'description', labelKey: 'adminSearch.field.description', defaultSelected: false, identifier: false },
];

export interface OpportunityAdminSearchQuery {
  readonly text: string;
  readonly likeEscaped: string;
  readonly isUuid: boolean;
  readonly fields: readonly string[];
  readonly limit: number;
}

export interface OpportunityAdminSearchRow {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly organizationName: string | null;
  readonly statusCode: string;
  /** Already in the request language (the workflow's configured names). */
  readonly statusName: string;
}

export interface OpportunityAdminSearchProviderDeps {
  search(
    query: OpportunityAdminSearchQuery,
    language: SupportedAdminLanguage,
  ): Promise<{ rows: OpportunityAdminSearchRow[]; hasMore: boolean }>;
}

/**
 * The Sales Opportunity provider. Visibility is the opportunity list's: the
 * `crm:read` gate its route enforces, and the `@OrgScoped` tenant filter its
 * read runs under.
 */
export function createOpportunityAdminSearchProvider(
  deps: OpportunityAdminSearchProviderDeps,
): AdminSearchProvider {
  return {
    entityType: 'crm.opportunity',
    moduleId: 'crm',
    labelKey: 'adminSearch.group.label',
    icon: 'CircleDollarSign',
    requiredPermission: 'crm:read',
    weight: 300,
    fields: OPPORTUNITY_ADMIN_SEARCH_FIELDS,
    async search(query: AdminSearchProviderQuery) {
      const { rows, hasMore } = await deps.search(
        {
          text: query.text,
          likeEscaped: query.likeEscaped,
          isUuid: query.isUuid,
          fields: query.fields,
          limit: query.limit,
        },
        query.language,
      );
      return {
        hasMore,
        hits: rows.map((row) => ({
          id: row.id,
          title: `${row.number} · ${row.title}`,
          subtitle: row.organizationName,
          status: { code: row.statusCode, label: row.statusName },
          targetRoute: `/crm/opportunities/${row.id}`,
        })),
      };
    },
  };
}
