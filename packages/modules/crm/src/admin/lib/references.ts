import { useCallback, useMemo } from 'react';
import type { OpportunityComment, OpportunityCommentKind } from '@endora-commerce/contracts';
import type { CommentThreadApi, ReferenceLookups, ReferenceTriggerKind } from '@endora-commerce/admin-kit/components';
import { useAuth } from '@endora-commerce/admin-kit/lib';
import { useAppLanguage } from '@endora-commerce/admin-kit/i18n';
import { crmApi, type OrderStatusOption } from '../api.js';
import { orderStatusLabel } from './labels.js';

/**
 * The codes of the lists a reference is chosen from. Two are their owners' —
 * `catalog`'s product list and `orders`' order list — and a role without one is
 * simply not offered that button or that shortcut (research N-H3). The people
 * who may be mentioned are CRM's own lookup, offered to whoever may write.
 */
const PRODUCT_LIST_PERMISSION = 'catalog:read';
const ORDER_LIST_PERMISSION = 'orders:read';
const PEOPLE_LIST_PERMISSION = 'crm:write';

/** A Product's name in the language on screen, then any name it has, then its SKU. */
function productLabel(name: Record<string, string>, sku: string, language: string): string {
  const base = language.split('-')[0] ?? language;
  const sameLanguage = Object.keys(name).find((locale) => locale === base || locale.startsWith(`${base}-`));
  return name[language] || (sameLanguage ? name[sameLanguage] : undefined) || Object.values(name).find(Boolean) || sku;
}

/**
 * What a CRM text may refer to, and where the kit's reference editor finds it
 * (`specs/163-projects-and-tasks/` research R-17): people through CRM's own
 * `mentionable` lookup, Orders of the Opportunity's Organization through
 * `orders`' list, Products through `catalog`'s.
 *
 * `@@` is an Order list here until CRM adopts the shared document list
 * (`specs/163-projects-and-tasks/` T107); the kit's trigger table therefore
 * says `order` where the standard says `document`. Orders are offered only
 * with an Organization — `null` while none is chosen (the create form).
 */
export function useCrmReferences(organizationId: string | null): {
  kinds: readonly ReferenceTriggerKind[];
  lookups: ReferenceLookups;
} {
  const { hasPermission } = useAuth();
  const { language } = useAppLanguage();
  const canPeople = hasPermission(PEOPLE_LIST_PERMISSION);
  const canOrders = hasPermission(ORDER_LIST_PERMISSION) && organizationId !== null;
  const canProducts = hasPermission(PRODUCT_LIST_PERMISSION);

  const kinds = useMemo(
    (): readonly ReferenceTriggerKind[] => [
      ...(canPeople ? (['admin_user'] as const) : []),
      ...(canOrders ? (['order'] as const) : []),
      ...(canProducts ? (['product'] as const) : []),
    ],
    [canPeople, canOrders, canProducts],
  );

  const lookups = useMemo(
    (): ReferenceLookups => ({
      searchPeople: async (query) =>
        (await crmApi.lookupMentionable(organizationId, query)).map((person) => ({ id: person.id, label: person.name })),
      searchOrders: async (query) =>
        organizationId === null
          ? []
          : (await crmApi.searchOrders(organizationId, query)).map((order) => ({ id: order.id, label: order.businessId })),
      searchProducts: async (query) =>
        (await crmApi.searchProducts(query)).map((product) => ({
          id: product.id,
          label: productLabel(product.name, product.sku, language),
          description: product.sku,
        })),
    }),
    [organizationId, language],
  );

  return { kinds, lookups };
}

/** A referenced Order's status by `orders`' name for it, in the language on screen — its code without the statuses. */
export function useOrderStatusLabel(statuses: readonly OrderStatusOption[] | undefined): (code: string) => string {
  const { language } = useAppLanguage();
  return useCallback((code: string) => orderStatusLabel(code, statuses ?? [], language), [statuses, language]);
}

/** The notes, or the messages, of one Opportunity, as the kit's `CommentThread` asks for them (`contracts/admin-api.md` §6). */
export function useOpportunityComments(
  opportunityId: string,
  kind: OpportunityCommentKind,
): CommentThreadApi<OpportunityComment> {
  return useMemo(
    () => ({
      list: () => crmApi.listComments(opportunityId, kind),
      add: (body: string) => crmApi.addComment(opportunityId, kind, body),
      update: (commentId: string, body: string) => crmApi.updateComment(opportunityId, commentId, body),
      remove: (commentId: string) => crmApi.deleteComment(opportunityId, commentId),
    }),
    [opportunityId, kind],
  );
}
