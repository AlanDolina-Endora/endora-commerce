import type {
  AdminSearchFieldDescriptor,
  AdminSearchProvider,
  AdminSearchProviderQuery,
} from '@endora-commerce/contracts';

/**
 * What the Order record type offers global search
 * (`specs/150-admin-global-search/data-model.md` §5, FR-022). The codes are
 * this module's own decision; `admin_search` stores the operator's choice
 * among them and never learns a column.
 */
export const ORDER_ADMIN_SEARCH_FIELDS: readonly AdminSearchFieldDescriptor[] = [
  { code: 'number', labelKey: 'adminSearch.field.number', defaultSelected: true, identifier: true },
  { code: 'organizationName', labelKey: 'adminSearch.field.organizationName', defaultSelected: true, identifier: false },
  { code: 'customer', labelKey: 'adminSearch.field.customer', defaultSelected: true, identifier: false },
  { code: 'billingCompanyName', labelKey: 'adminSearch.field.billingCompanyName', defaultSelected: false, identifier: false },
  { code: 'billingTaxId', labelKey: 'adminSearch.field.billingTaxId', defaultSelected: false, identifier: true },
];

/** The query the order list service answers — the host's query minus what only the provider needs. */
export interface OrderAdminSearchQuery {
  readonly text: string;
  readonly likeEscaped: string;
  readonly isUuid: boolean;
  readonly fields: readonly string[];
  readonly limit: number;
}

/** One order as the list service returns it for global search. */
export interface OrderAdminSearchRow {
  readonly id: string;
  readonly businessId: string;
  readonly organizationName: string | null;
  readonly placedAt: string;
  readonly total: number;
  readonly currency: string;
  readonly status: string;
  readonly statusName: Record<string, string>;
}

export interface OrderAdminSearchProviderDeps {
  /** Ranked, scoped, `limit` rows at most, with whether more exist. */
  search(query: OrderAdminSearchQuery): Promise<{ rows: OrderAdminSearchRow[]; hasMore: boolean }>;
}

/**
 * The Order provider. Visibility is the order list's own: the `orders:read`
 * gate the list route enforces, and the list's organization scope applied in
 * the service's statement (FR-014, FR-015).
 */
export function createOrderAdminSearchProvider(deps: OrderAdminSearchProviderDeps): AdminSearchProvider {
  return {
    entityType: 'orders.order',
    moduleId: 'orders',
    labelKey: 'adminSearch.group.label',
    icon: 'Receipt',
    requiredPermission: 'orders:read',
    weight: 100,
    fields: ORDER_ADMIN_SEARCH_FIELDS,
    async search(query: AdminSearchProviderQuery) {
      const { rows, hasMore } = await deps.search({
        text: query.text,
        likeEscaped: query.likeEscaped,
        isUuid: query.isUuid,
        fields: query.fields,
        limit: query.limit,
      });
      return {
        hasMore,
        hits: rows.map((row) => ({
          id: row.id,
          title: row.businessId,
          subtitle: [row.organizationName, row.placedAt.slice(0, 10), `${row.total.toFixed(2)} ${row.currency}`]
            .filter((part): part is string => Boolean(part))
            .join(' · '),
          status: {
            code: row.status,
            label: row.statusName[query.language] ?? row.statusName['en'] ?? row.status,
          },
          targetRoute: `/orders/${row.id}`,
        })),
      };
    },
  };
}
