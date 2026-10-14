import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { AdminZoneProps, QuoteRequestOrgNegotiation } from '@endora-commerce/contracts';
import { ApiError, apiClient, useAuth } from '@endora-commerce/admin-kit/lib';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
} from '@endora-commerce/admin-kit/ui';
import { useTranslation } from '@endora-commerce/admin-kit/i18n';

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
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    apiClient
      .get<{ data: QuoteRequestOrgNegotiation }>(routeFor(organizationId))
      .then((res) => {
        if (!cancelled) setAllowed(res.data.priceProposalsAllowed);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(
          err instanceof ApiError ? err.envelope.error.message : t('negotiation.loadError'),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return (): void => {
      cancelled = true;
    };
  }, [organizationId, attempt, t]);

  const handleChange = useCallback(
    async (next: boolean): Promise<void> => {
      if (!canManage) return;
      const previous = allowed;
      setSaving(true);
      setSaveError(null);
      setSaved(false);
      setAllowed(next);
      try {
        const res = await apiClient.put<{ data: QuoteRequestOrgNegotiation }>(
          routeFor(organizationId),
          { priceProposalsAllowed: next },
        );
        setAllowed(res.data.priceProposalsAllowed);
        setSaved(true);
      } catch (err) {
        setAllowed(previous);
        setSaveError(
          err instanceof ApiError ? err.envelope.error.message : t('negotiation.saveError'),
        );
      } finally {
        setSaving(false);
      }
    },
    [allowed, canManage, organizationId, t],
  );

  const controlId = `quote-price-negotiation-org-${organizationId}`;
  const descriptionId = `${controlId}-description`;
  const hintId = `${controlId}-hint`;

  return (
    <Card className="mb-4" aria-busy={loading || saving}>
      <CardHeader>
        <CardTitle>{t('negotiation.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {t('negotiation.organization.description')}
        </p>

        {loadError ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>{loadError}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(): void => setAttempt((n) => n + 1)}
              >
                {t('negotiation.retry')}
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex items-center gap-3">
            <Checkbox
              id={controlId}
              checked={allowed ?? false}
              disabled={!canManage || loading || saving}
              aria-describedby={canManage ? descriptionId : `${descriptionId} ${hintId}`}
              onChange={(e): void => {
                void handleChange(e.target.checked);
              }}
            />
            <label htmlFor={controlId} className="text-sm font-medium">
              {t('negotiation.organization.label')}
            </label>
          </div>
        )}

        {!canManage ? (
          <p id={hintId} className="text-xs text-muted-foreground">
            {t('negotiation.readOnlyHint')}
          </p>
        ) : null}

        <div role="status" aria-live="polite" className="text-sm">
          {loading ? t('negotiation.loading') : null}
          {saving ? t('negotiation.saving') : null}
          {saved && !saving ? t('negotiation.saved') : null}
        </div>

        {saveError ? (
          <Alert variant="destructive">
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * The zone renderer loads a contribution through a dynamic-import factory and
 * reads its default export (feature 091, FR-013).
 */
export default OrganizationPriceNegotiation;
