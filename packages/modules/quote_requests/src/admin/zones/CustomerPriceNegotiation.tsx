import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type {
  AdminZoneProps,
  QuoteRequestAccountNegotiation,
  QuoteRequestNegotiationOverride,
} from '@endora-commerce/contracts';
import { ApiError, apiClient, useAuth } from '@endora-commerce/admin-kit/lib';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@endora-commerce/admin-kit/ui';
import { useTranslation } from '@endora-commerce/admin-kit/i18n';

/**
 * A customer account's price-negotiation override (feature 146, US4;
 * FR-020 (b)).
 *
 * Three states — as organization (no override, the default), allowed, not
 * allowed — and the resulting effective value with where it comes from: this
 * account's override, its organization's value, or the platform default
 * ("allowed") when neither is set. The place is `customer.detail.after`, after
 * `quick_order`'s ordering defaults (weight 200).
 *
 * **Read on `customers:read`, written on `customers:manage`** (FR-027, D-3J):
 * a read-only holder sees the three options disabled, with a hint.
 *
 * The effective value is the server's answer, never recomputed here: the
 * organization behind it is the account's *current* one (D-3L), which this
 * screen does not know.
 */
export type CustomerPriceNegotiationProps = AdminZoneProps<'customer.detail.after'>;

const OVERRIDES: readonly QuoteRequestNegotiationOverride[] = ['inherit', 'allowed', 'not_allowed'];

const routeFor = (customerId: string): string =>
  `/api/v1/admin/customers/${encodeURIComponent(customerId)}/quote-price-negotiation`;

export function CustomerPriceNegotiation({ customerId }: CustomerPriceNegotiationProps): ReactNode {
  const t = useTranslation('quote_requests');
  const { hasPermission } = useAuth();
  const canManage = hasPermission('customers:manage');
  const [state, setState] = useState<QuoteRequestAccountNegotiation | null>(null);
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
      .get<{ data: QuoteRequestAccountNegotiation }>(routeFor(customerId))
      .then((res) => {
        if (!cancelled) setState(res.data);
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
  }, [customerId, attempt, t]);

  const handleChange = useCallback(
    async (next: QuoteRequestNegotiationOverride): Promise<void> => {
      if (!canManage || state === null || next === state.override) return;
      const previous = state;
      setSaving(true);
      setSaveError(null);
      setSaved(false);
      setState({ ...state, override: next });
      try {
        const res = await apiClient.put<{ data: QuoteRequestAccountNegotiation }>(
          routeFor(customerId),
          { override: next },
        );
        setState(res.data);
        setSaved(true);
      } catch (err) {
        setState(previous);
        setSaveError(
          err instanceof ApiError ? err.envelope.error.message : t('negotiation.saveError'),
        );
      } finally {
        setSaving(false);
      }
    },
    [canManage, customerId, state, t],
  );

  const groupName = `quote-price-negotiation-customer-${customerId}`;
  const descriptionId = `${groupName}-description`;
  const hintId = `${groupName}-hint`;
  const effectiveId = `${groupName}-effective`;

  return (
    <Card className="mb-4" aria-busy={loading || saving}>
      <CardHeader>
        <CardTitle>{t('negotiation.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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
          <fieldset
            className="space-y-2"
            disabled={!canManage || loading || saving}
            aria-describedby={[
              descriptionId,
              state === null ? null : effectiveId,
              canManage ? null : hintId,
            ]
              .filter((id): id is string => id !== null)
              .join(' ')}
          >
            <legend className="text-sm font-medium">{t('negotiation.customer.label')}</legend>
            <p id={descriptionId} className="text-sm text-muted-foreground">
              {t('negotiation.customer.description')}
            </p>
            <div className="flex flex-wrap gap-4">
              {OVERRIDES.map((value) => {
                const id = `${groupName}-${value}`;
                return (
                  <div key={value} className="flex items-center gap-2">
                    <input
                      type="radio"
                      id={id}
                      name={groupName}
                      value={value}
                      checked={state?.override === value}
                      disabled={!canManage || loading || saving}
                      className="h-4 w-4 accent-primary"
                      onChange={(): void => {
                        void handleChange(value);
                      }}
                    />
                    <label htmlFor={id} className="text-sm">
                      {t(`negotiation.override.${value}`)}
                    </label>
                  </div>
                );
              })}
            </div>
          </fieldset>
        )}

        {state !== null && !loadError ? (
          <p id={effectiveId} className="text-sm">
            {t('negotiation.effective', {
              value: state.effectivePriceProposalsAllowed
                ? t('negotiation.value.allowed')
                : t('negotiation.value.notAllowed'),
              source: t(`negotiation.source.${state.effectiveSource}`),
            })}
          </p>
        ) : null}

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
export default CustomerPriceNegotiation;
