import { useEffect, useState, type ReactNode } from 'react';
import type {
  QuoteRequestHistory,
  QuoteRequestHistoryActor,
  QuoteRequestHistoryChange,
  QuoteRequestHistoryEntry,
  QuoteRequestHistoryLineRef,
} from '@endora-commerce/contracts';
import { apiClient } from '@endora-commerce/admin-kit/lib';
import { Alert, AlertDescription } from '@endora-commerce/admin-kit/ui';
import { useTranslation, useTranslationContext } from '@endora-commerce/admin-kit/i18n';

/**
 * Feature 146, T059 — the History tab of the admin quote request detail
 * (US2, US3; FR-010 – FR-018). It reads `GET /api/v1/admin/quote-requests/:id/history`
 * when the tab is opened and renders every entry as a translated sentence with
 * its date and actor; a `modified` entry lists its changes.
 *
 * **Free text is text** (threat model T17): notes, reasons and line notes are
 * typed by customers and operators, and reach the DOM only as React text
 * nodes — interpolated into a translated string at most, never as markup.
 *
 * Every key is `rfq.detail.history.*` in the `core` bundle, the one the host
 * screen reads; `history-bundle-coverage.test.ts` holds that every entry and
 * change kind has one in both languages.
 */

type T = (key: string, params?: Record<string, string | number>) => string;

/** The recorded role labels the platform writes, mapped to bundle keys. */
const ROLE_KEYS: Record<string, string> = {
  'Platform administrator': 'platformAdministrator',
  'Sales representative': 'salesRepresentative',
  Customer: 'customer',
  System: 'system',
  Administrator: 'administrator',
};

const LOCALES: Record<string, string> = { en: 'en-GB', pl: 'pl-PL' };

interface Formatters {
  t: T;
  amount: (n: number | null) => string;
  dateTime: (iso: string) => string;
}

function useFormatters(): Formatters {
  const t = useTranslation('core');
  const { language } = useTranslationContext();
  const locale = LOCALES[language] ?? language;
  const numbers = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dates = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const h: T = (key, params) => t(`rfq.detail.history.${key}`, params);
  return {
    t: h,
    amount: (n) => (n === null ? h('none') : numbers.format(n)),
    dateTime: (iso) => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? iso : dates.format(d);
    },
  };
}

function roleLabel(t: T, recorded: string | null): string | null {
  if (recorded === null) return null;
  const key = ROLE_KEYS[recorded];
  return key ? t(`role.${key}`) : recorded;
}

/** The actor as one phrase: name + e-mail, name + role, "System", or role + "unknown user". */
function actorLabel(t: T, actor: QuoteRequestHistoryActor): string {
  if (actor.kind === 'system') return t('actor.system');
  const role = roleLabel(t, actor.recordedRole);
  const name = actor.kind === 'unknown' ? null : actor.name;
  if (name === null) {
    return role === null ? t('actor.unknownUser') : t('actor.withDetail', { name: t('actor.unknownUser'), detail: role });
  }
  const detail = actor.kind === 'customer' ? actor.email : role;
  return detail === null ? name : t('actor.withDetail', { name, detail });
}

function lineLabel(t: T, line: QuoteRequestHistoryLineRef): string {
  return line.variantLabel === null
    ? line.productName
    : t('lineWithVariant', { product: line.productName, variant: line.variantLabel });
}

function changeSentence(f: Formatters, change: QuoteRequestHistoryChange): string {
  const { t } = f;
  const text = (v: string | null): string => v ?? t('none');
  switch (change.kind) {
    case 'header_note':
      return t('change.header_note', { before: text(change.before), after: text(change.after) });
    case 'line_added':
      return t('change.line_added', {
        line: lineLabel(t, change.line),
        quantity: change.quantity,
        price:
          change.agreedUnitPrice === null
            ? t('none')
            : t('money', { amount: f.amount(change.agreedUnitPrice), currency: change.currency }),
      });
    case 'line_removed':
      return t('change.line_removed', { line: lineLabel(t, change.line) });
    case 'line_quantity':
      return t('change.line_quantity', {
        line: lineLabel(t, change.line),
        before: change.before,
        after: change.after,
      });
    case 'line_agreed_unit_price':
    case 'line_proposed_unit_price':
      return t(`change.${change.kind}`, {
        line: lineLabel(t, change.line),
        before: f.amount(change.before),
        after: f.amount(change.after),
        currency: change.currency,
      });
    case 'line_note':
      return t('change.line_note', {
        line: lineLabel(t, change.line),
        before: text(change.before),
        after: text(change.after),
      });
    case 'validity':
      if (change.before === null && change.after === null) return t('change.validity_removed', { before: t('none') });
      if (change.before === null) return t('change.validity_set', { after: f.dateTime(change.after!) });
      if (change.after === null) return t('change.validity_removed', { before: f.dateTime(change.before) });
      return t('change.validity', { before: f.dateTime(change.before), after: f.dateTime(change.after) });
  }
}

function HistoryEntry({ entry, f }: { entry: QuoteRequestHistoryEntry; f: Formatters }): ReactNode {
  const { t } = f;
  return (
    <li className="rounded-md border p-3 text-sm">
      <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <time dateTime={entry.occurredAt}>{f.dateTime(entry.occurredAt)}</time>
        <span>{actorLabel(t, entry.actor)}</span>
        {entry.revisionNumber !== null ? <span>{t('revision', { number: entry.revisionNumber })}</span> : null}
      </div>
      <p className="font-medium">{t(`entry.${entry.kind}`)}</p>
      {entry.reason !== null ? (
        <p className="mt-1 whitespace-pre-wrap break-words">{t('reason', { text: entry.reason })}</p>
      ) : null}
      {entry.note !== null ? (
        <p className="mt-1 whitespace-pre-wrap break-words">{t('note', { text: entry.note })}</p>
      ) : null}
      {entry.relatedQuoteRequestId !== null ? (
        <p className="mt-1 text-muted-foreground">
          {t('relatedRequest', { id: entry.relatedQuoteRequestId.slice(0, 8) })}
        </p>
      ) : null}
      {entry.orderId !== null ? (
        <p className="mt-1 text-muted-foreground">{t('order', { id: entry.orderId.slice(0, 8) })}</p>
      ) : null}
      {entry.changes !== null ? (
        entry.changes.length === 0 ? (
          <p className="mt-1 text-muted-foreground">{t('noChanges')}</p>
        ) : (
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {entry.changes.map((change, i) => (
              <li key={i} className="whitespace-pre-wrap break-words">
                {changeSentence(f, change)}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </li>
  );
}

export function RfqHistory({ quoteRequestId }: { quoteRequestId: string }): ReactNode {
  const f = useFormatters();
  const { t } = f;
  const [history, setHistory] = useState<QuoteRequestHistory | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setHistory(null);
    setFailed(false);
    apiClient
      .get<{ data: QuoteRequestHistory }>(`/api/v1/admin/quote-requests/${quoteRequestId}/history`)
      .then((res) => {
        if (live) setHistory(res.data);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return (): void => {
      live = false;
    };
  }, [quoteRequestId]);

  if (failed) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('error')}</AlertDescription>
      </Alert>
    );
  }
  if (history === null) return <p className="text-sm text-muted-foreground">{t('loading')}</p>;

  return (
    <div className="space-y-3">
      {history.truncated ? (
        <Alert>
          <AlertDescription>{t('truncated')}</AlertDescription>
        </Alert>
      ) : null}
      {history.entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="space-y-2">
          {history.entries.map((entry) => (
            <HistoryEntry key={entry.id} entry={entry} f={f} />
          ))}
        </ul>
      )}
    </div>
  );
}
