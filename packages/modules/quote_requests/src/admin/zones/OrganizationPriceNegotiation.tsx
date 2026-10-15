import { type ReactNode } from 'react';
import type { AdminZoneProps, QuoteRequestOrgNegotiation } from '@endora-commerce/contracts';
import { useAuth } from '@endora-commerce/admin-kit/lib';
import { Checkbox } from '@endora-commerce/admin-kit/ui';
import { useTranslation } from '@endora-commerce/admin-kit/i18n';
import { NegotiationCard, useNegotiationResource } from '../negotiation-panel.js';

/**
 * The organization's price-negotiation value (feature 146, US4; FR-020 (a)).
 *
 * "Members may propose prices": allowed (the default when no row exists) or not
 * allowed, for every customer account of the organization that has no override
 * of its own. The place is `organization.detail.after`, after `carts`' approval
 * policy (weight 500).
 *
 * **Read on `customers:read`, written on `customers:manage`** (FR-027, D-3J).
 * The contribution is gated on the read code, so a read-only holder sees the
 * value with the control disabled and a hint, rather than a toggle whose only
 * action answers 403.
 *
 * It reads its own state (Z3: the zone's props carry the id and nothing else),
 * out of this module's own bundle (`negotiation.*`), as `carts`' panel does.
 */
export type OrganizationPriceNegotiationProps = AdminZoneProps<'organization.detail.after'>;

const routeFor = (organizationId: string): string =>
  `/api/v1/admin/organizations/${encodeURIComponent(organizationId)}/quote-price-negotiation`;

export function OrganizationPriceNegotiation({
  organizationId,
}: OrganizationPriceNegotiationProps): ReactNode {
  const t = useTranslation('quote_requests');
  const { hasPermission } = useAuth();
  const canManage = hasPermission('customers:manage');
  const resource = useNegotiationResource<QuoteRequestOrgNegotiation>(routeFor(organizationId));
  const { state, loading, saving } = resource;

  const handleChange = (next: boolean): void => {
    if (!canManage || state === null) return;
    void resource.save({ ...state, priceProposalsAllowed: next }, { priceProposalsAllowed: next });
  };

  const controlId = `quote-price-negotiation-org-${organizationId}`;
  const descriptionId = `${controlId}-description`;
  const hintId = `${controlId}-hint`;

  return (
    <NegotiationCard
      resource={resource}
      canManage={canManage}
      hintId={hintId}
      before={
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {t('negotiation.organization.description')}
        </p>
      }
    >
      <div className="flex items-center gap-3">
        <Checkbox
          id={controlId}
          checked={state?.priceProposalsAllowed ?? false}
          disabled={!canManage || loading || saving}
          aria-describedby={canManage ? descriptionId : `${descriptionId} ${hintId}`}
          onChange={(e): void => handleChange(e.target.checked)}
        />
        <label htmlFor={controlId} className="text-sm font-medium">
          {t('negotiation.organization.label')}
        </label>
      </div>
    </NegotiationCard>
  );
}

/**
 * The zone renderer loads a contribution through a dynamic-import factory and
 * reads its default export (feature 091, FR-013).
 */
export default OrganizationPriceNegotiation;
