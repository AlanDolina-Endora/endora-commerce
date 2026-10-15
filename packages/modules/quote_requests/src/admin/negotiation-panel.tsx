import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, apiClient } from '@endora-commerce/admin-kit/lib';
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
 * Feature 146, US4 — what the organization and customer price-negotiation
 * panels share (review fix S5): reading the subject's value with a retry, an
 * optimistic write rolled back on failure, and the card around both with its
 * live status region. Each panel keeps only its own control and wording.
 */

export interface NegotiationResource<T> {
  /** The subject's value; `null` until it has been read for **this** subject. */
  state: T | null;
  loading: boolean;
  loadError: string | null;
  saving: boolean;
  saveError: string | null;
  saved: boolean;
  retry: () => void;
  /** Show `optimistic` at once, `PUT` `body`, then show the answer — or roll back. */
  save: (optimistic: T, body: unknown) => Promise<void>;
}

/**
 * The value behind `route`, read and written by the panel that shows it.
 *
 * A new `route` is a new subject: the previous subject's value, its "Saved."
 * and its save error are cleared before the next one is read, and an answer
 * that arrives for a subject the panel has left is dropped.
 */
export function useNegotiationResource<T>(route: string): NegotiationResource<T> {
  const t = useTranslation('quote_requests');
  const [state, setState] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const current = useRef(route);
  current.current = route;

  useEffect(() => {
    let cancelled = false;
    setState(null);
    setSaved(false);
    setSaveError(null);
    setLoading(true);
    setLoadError(null);
    apiClient
      .get<{ data: T }>(route)
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
  }, [route, attempt, t]);

  const save = useCallback(
    async (optimistic: T, body: unknown): Promise<void> => {
      const previous = state;
      setSaving(true);
      setSaveError(null);
      setSaved(false);
      setState(optimistic);
      try {
        const res = await apiClient.put<{ data: T }>(route, body);
        if (current.current !== route) return;
        setState(res.data);
        setSaved(true);
      } catch (err) {
        if (current.current !== route) return;
        setState(previous);
        setSaveError(
          err instanceof ApiError ? err.envelope.error.message : t('negotiation.saveError'),
        );
      } finally {
        setSaving(false);
      }
    },
    [route, state, t],
  );

  const retry = useCallback((): void => setAttempt((n) => n + 1), []);

  return { state, loading, loadError, saving, saveError, saved, retry, save };
}

/**
 * The card both panels render: a title, an optional lead (`before`), the
 * panel's control — or the read error with its retry in its place — an
 * optional trailer (`after`), the read-only hint, the live status region and
 * the save error.
 */
export function NegotiationCard({
  resource,
  canManage,
  hintId,
  before,
  after,
  children,
}: {
  resource: Pick<
    NegotiationResource<unknown>,
    'loading' | 'loadError' | 'saving' | 'saveError' | 'saved' | 'retry'
  >;
  canManage: boolean;
  hintId: string;
  before?: ReactNode;
  after?: ReactNode;
  children: ReactNode;
}): ReactNode {
  const t = useTranslation('quote_requests');
  const { loading, loadError, saving, saveError, saved, retry } = resource;
  return (
    <Card className="mb-4" aria-busy={loading || saving}>
      <CardHeader>
        <CardTitle>{t('negotiation.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {before}

        {loadError ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>{loadError}</span>
              <Button type="button" variant="outline" size="sm" onClick={retry}>
                {t('negotiation.retry')}
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          children
        )}

        {after}

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
