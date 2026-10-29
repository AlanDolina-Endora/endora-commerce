import { useEffect, useId, useState, type ReactNode } from 'react';
import { Alert, AlertDescription, Checkbox, Label, Select } from '@endora-commerce/admin-kit/ui';
import { useTranslation } from '@endora-commerce/admin-kit/i18n';
import { tasksApi } from '../api.js';
import { errorMessage } from '../lib/labels.js';

/** The hour a digest is turned on at when nobody chose one yet. */
const DEFAULT_HOUR = 8;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** `8` → `08:00` — a wall-clock hour of the Tasks time zone. */
function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/**
 * The *Daily digest* control on *My Tasks* (`specs/165-task-management/` User
 * Story 7 scenario 5, FR-036; `contracts/admin-surfaces.md` §1).
 *
 * The caller's own, off by default (Q3 = A): on, at an hour of the Tasks time
 * zone, a notification and an e-mail list their open Tasks due that day or
 * overdue — and nothing is sent on a day with none. Each change is saved at
 * once (`PUT` / `DELETE /tasks/me/digest`) and said in a polite live region.
 */
export function DigestControl(): ReactNode {
  const t = useTranslation('tasks');
  const toggleId = useId();
  const hourId = useId();
  const hintId = useId();
  const [hour, setHour] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    tasksApi
      .digest()
      .then((subscription) => {
        if (!live) return;
        setHour(subscription?.hour ?? null);
        setLoaded(true);
      })
      .catch(() => {
        if (live) setLoadFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const save = async (next: number | null): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      if (next === null) {
        await tasksApi.stopDigest();
        setHour(null);
        setNotice(t('digest.off'));
      } else {
        const saved = await tasksApi.setDigest(next);
        const savedHour = saved?.hour ?? next;
        setHour(savedHour);
        setNotice(t('digest.on', { hour: hourLabel(savedHour) }));
      }
    } catch (failure) {
      setError(errorMessage(failure, t('digest.saveError')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label={t('digest.title')} className="space-y-2 rounded-md border p-3 text-sm">
      {loadFailed ? (
        <p className="text-muted-foreground">{t('digest.error')}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label htmlFor={toggleId} className="flex min-h-11 items-center gap-2 font-medium sm:min-h-8">
              <Checkbox
                id={toggleId}
                checked={hour !== null}
                disabled={!loaded || busy}
                aria-describedby={hintId}
                onChange={(event): void => void save(event.target.checked ? DEFAULT_HOUR : null)}
              />
              {t('digest.toggle')}
            </label>
            {hour !== null ? (
              <div className="flex items-center gap-2">
                <Label htmlFor={hourId}>{t('digest.hour')}</Label>
                <Select
                  id={hourId}
                  className="w-28"
                  value={String(hour)}
                  disabled={busy}
                  onChange={(event): void => void save(Number(event.target.value))}
                >
                  {HOURS.map((value) => (
                    <option key={value} value={value}>
                      {hourLabel(value)}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
          </div>
          <p id={hintId} className="text-xs text-muted-foreground">
            {t('digest.hint')}
          </p>
        </>
      )}
      <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
        {notice}
      </p>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
