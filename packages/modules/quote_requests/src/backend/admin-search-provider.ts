import type {
  AdminSearchFieldDescriptor,
  AdminSearchProvider,
  AdminSearchProviderQuery,
  SupportedAdminLanguage,
} from '@endora-commerce/contracts';

/** What the Quote Request record type offers global search (`specs/150-admin-global-search/` FR-022). */
export const QUOTE_REQUEST_ADMIN_SEARCH_FIELDS: readonly AdminSearchFieldDescriptor[] = [
  { code: 'number', labelKey: 'adminSearch.field.number', defaultSelected: true, identifier: true },
  { code: 'organizationName', labelKey: 'adminSearch.field.organizationName', defaultSelected: true, identifier: false },
  { code: 'customer', labelKey: 'adminSearch.field.customer', defaultSelected: true, identifier: false },
  { code: 'customerNote', labelKey: 'adminSearch.field.customerNote', defaultSelected: false, identifier: false },
];

/** The bundle key of each status's label (the stored codes are English words with spaces). */
export const QUOTE_REQUEST_ADMIN_SEARCH_STATUS_KEYS: Readonly<Record<string, string>> = {
  'Created from admin': 'adminSearch.status.createdFromAdmin',
  Pending: 'adminSearch.status.pending',
  Canceled: 'adminSearch.status.canceled',
  Approved: 'adminSearch.status.approved',
  Completed: 'adminSearch.status.completed',
  Expired: 'adminSearch.status.expired',
};

export interface QuoteRequestAdminSearchQuery {
  readonly text: string;
  readonly likeEscaped: string;
  readonly isUuid: boolean;
  readonly fields: readonly string[];
  readonly limit: number;
}

export interface QuoteRequestAdminSearchRow {
  readonly id: string;
  readonly businessId: string;
  readonly organizationName: string | null;
  /** Submitted, or created when it never was. */
  readonly submittedAt: string | null;
  readonly status: string;
}

export interface QuoteRequestAdminSearchProviderDeps {
  /** Ranked, `limit` rows at most, with the quote request list's visibility for `adminUserId`. */
  search(
    query: QuoteRequestAdminSearchQuery,
    adminUserId: string,
  ): Promise<{ rows: QuoteRequestAdminSearchRow[]; hasMore: boolean }>;
  /** This module's own bundle, in the request language. */
  translate(key: string, language: SupportedAdminLanguage): Promise<string>;
}

/**
 * The Quote Request provider. Visibility is the quote request list's: the
 * `rfqs:handle` gate its route enforces, and its organization visibility
 * (tenant scope, then the sales-representative rule for any role other than
 * the platform administrator) applied in the service's statement.
 */
export function createQuoteRequestAdminSearchProvider(
  deps: QuoteRequestAdminSearchProviderDeps,
): AdminSearchProvider {
  return {
    entityType: 'quote_requests.quote_request',
    moduleId: 'quote_requests',
    labelKey: 'adminSearch.group.label',
    icon: 'ClipboardList',
    requiredPermission: 'rfqs:handle',
    weight: 200,
    fields: QUOTE_REQUEST_ADMIN_SEARCH_FIELDS,
    async search(query: AdminSearchProviderQuery) {
      const { rows, hasMore } = await deps.search(
        {
          text: query.text,
          likeEscaped: query.likeEscaped,
          isUuid: query.isUuid,
          fields: query.fields,
          limit: query.limit,
        },
        query.adminUserId,
      );
      const hits = await Promise.all(
        rows.map(async (row) => {
          const statusKey = QUOTE_REQUEST_ADMIN_SEARCH_STATUS_KEYS[row.status];
          const subtitle = [row.organizationName, row.submittedAt?.slice(0, 10)]
            .filter((part): part is string => Boolean(part))
            .join(' · ');
          return {
            id: row.id,
            title: row.businessId,
            subtitle: subtitle === '' ? null : subtitle,
            status: {
              code: row.status,
              label: statusKey === undefined ? row.status : await deps.translate(statusKey, query.language),
            },
            targetRoute: `/quote-requests/${row.id}`,
          };
        }),
      );
      return { hits, hasMore };
    },
  };
}
