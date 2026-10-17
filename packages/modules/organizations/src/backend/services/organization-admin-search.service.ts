import { QueryOrder, raw, type FilterQuery } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import { normalizeOrganizationName } from '@endora-commerce/contracts';
import { Organization } from '../entities/organization.entity.js';
import type { OrganizationAdminSearchQuery, OrganizationAdminSearchRow } from '../admin-search-provider.js';

/** `\`, `%` and `_` matched literally (Postgres' default LIKE escape is `\`). */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Global search over organizations (`specs/150-admin-global-search/`, T040).
 *
 * **The rows are the Organizations list's** — business organizations
 * (`is_personal = false`) that are not deleted, with no organization-scope
 * clause, because the list has none and the owner ruled that global search
 * shows what the list shows (spec Q2, FR-015). The admin's scope only
 * **orders** the result: `assignedOrganizationIds` (the tenant context's
 * allowed set, for a scoped admin) rank before every other organization, and
 * within each group the usual ranking applies — tax ID exact → prefix → rest,
 * then most recent change, then id, so a repeated search answers in the same
 * order (FR-015a).
 *
 * The name is matched against the folded `name_search` column with the text
 * folded by the same rule (`lodz` finds `Łódź`, FR-011); the tax ID and legal
 * name as stored.
 */
export class OrganizationAdminSearchService {
  constructor(private readonly emFactory: () => EntityManager) {}

  async search(
    query: OrganizationAdminSearchQuery,
    assignedOrganizationIds: readonly string[] | null,
  ): Promise<{ rows: OrganizationAdminSearchRow[]; hasMore: boolean }> {
    const fields = new Set(query.fields);
    const contains = `%${query.likeEscaped}%`;
    const or: FilterQuery<Organization>[] = [];
    if (fields.has('name')) {
      const folded = normalizeOrganizationName(query.text);
      if (folded !== '') or.push({ nameSearch: { $ilike: `%${escapeLike(folded)}%` } });
    }
    if (fields.has('taxId')) or.push({ taxId: { $ilike: contains } });
    if (fields.has('legalName')) or.push({ legalName: { $ilike: contains } });
    if (query.isUuid) or.push({ id: query.text });
    if (or.length === 0) return { rows: [], hasMore: false };

    const orderBy: Array<Record<string, QueryOrder>> = [];
    if (assignedOrganizationIds !== null && assignedOrganizationIds.length > 0) {
      const placeholders = assignedOrganizationIds.map(() => '?').join(', ');
      orderBy.push({
        [raw((alias) => `case when ${alias}.id::text in (${placeholders}) then 0 else 1 end`, [
          ...assignedOrganizationIds,
        ])]: QueryOrder.ASC,
      });
    }
    const exact: string[] = [];
    const params: string[] = [];
    if (query.isUuid) {
      exact.push('{a}.id::text = lower(?)');
      params.push(query.text);
    }
    if (fields.has('taxId')) {
      exact.push('lower({a}.tax_id) = lower(?)');
      params.push(query.text);
    }
    if (exact.length > 0) {
      const starts = fields.has('taxId') ? ' when {a}.tax_id ilike ? then 1' : '';
      if (fields.has('taxId')) params.push(`${query.likeEscaped}%`);
      const sql = `case when ${exact.join(' or ')} then 0${starts} else 2 end`;
      orderBy.push({ [raw((alias) => sql.replace(/\{a\}/g, alias), params)]: QueryOrder.ASC });
    }
    orderBy.push({ updatedAt: QueryOrder.DESC }, { id: QueryOrder.ASC });

    const em = this.emFactory();
    const found = await em.find(
      Organization,
      { deletedAt: null, isPersonal: false, $or: or },
      { orderBy: orderBy as never, limit: query.limit + 1 },
    );
    const hasMore = found.length > query.limit;
    return {
      hasMore,
      rows: found.slice(0, query.limit).map((org) => ({
        id: org.id,
        name: org.name,
        taxId: org.taxId ?? null,
        city: org.registeredAddress?.city ?? null,
        status: org.status,
      })),
    };
  }
}
