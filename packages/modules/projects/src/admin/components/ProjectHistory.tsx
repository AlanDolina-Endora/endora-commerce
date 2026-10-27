import { useCallback, type ReactNode } from 'react';
import type { RecordHistoryEntry } from '@endora-commerce/contracts';
import {
  RecordHistory,
  recordHistoryChanges,
  useRecordHistory,
  type RecordHistoryChange,
} from '@endora-commerce/admin-kit/components';
import { useAppLanguage, useTranslation } from '@endora-commerce/admin-kit/i18n';
import { projectsApi } from '../api.js';
import { calendarDateLabel, NO_VALUE } from '../lib/labels.js';

/**
 * The fields of an audited Project state that have a label of their own
 * (`history.field.<field>`); any other field is named from its key. Whatever
 * names an identifier — every key ending `Id` or `Ids` — and the bookkeeping
 * below are never a row: they say nothing to a reader.
 */
const LABELLED_FIELDS: ReadonlySet<string> = new Set([
  'number',
  'title',
  'state',
  'valueAmount',
  'valueCurrency',
  'startOn',
  'visibility',
  'stages',
  'stageName',
  'outcome',
  'recordKind',
  'kind',
  'length',
  'fileName',
  'note',
  'comment',
  'deleted',
]);
const SILENT_FIELDS: ReadonlySet<string> = new Set(['version', 'descriptionLength', 'members', 'moves', 'tasks']);

function isSilent(field: string): boolean {
  return SILENT_FIELDS.has(field) || /Ids?$/.test(field);
}

/** `stageName` → `stage name`. */
function humaniseKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The rows an entry shows: what it changed, without identifiers, nested shapes or bookkeeping. */
export function projectHistoryChanges(entry: { before: unknown; after: unknown }): RecordHistoryChange[] {
  const plain = (value: unknown): boolean =>
    value === null ||
    ['string', 'number', 'boolean'].includes(typeof value) ||
    (Array.isArray(value) && value.every((item) => ['string', 'number'].includes(typeof item)));
  return recordHistoryChanges(entry)
    .filter((change) => !isSilent(change.field))
    .filter((change) => plain(change.after) && (!('before' in change) || plain(change.before)));
}

/**
 * A Project's change history (User Story 7, FR-028; `GET /projects/:id/history`)
 * on the kit's `RecordHistory`: every Command about the Project, newest first, a
 * page at a time, each entry by what happened and the fields it changed. Notes
 * and messages are recorded by length, never by their text.
 */
export function ProjectHistory(props: { projectId: string; reloadKey?: number }): ReactNode {
  const t = useTranslation('projects');
  const { language } = useAppLanguage();
  const { projectId } = props;
  const loadPage = useCallback((cursor: string | null) => projectsApi.history(projectId, cursor), [projectId]);
  const history = useRecordHistory<RecordHistoryEntry>(loadPage, props.reloadKey);

  const renderValue = (field: string, raw: unknown): ReactNode => {
    if (raw === null || raw === undefined || raw === '') return NO_VALUE;
    if (typeof raw === 'boolean') return t(raw ? 'history.value.yes' : 'history.value.no');
    if (Array.isArray(raw)) return raw.length === 0 ? NO_VALUE : raw.join(', ');
    if (field === 'state') return t(`state.${String(raw)}`);
    if (field === 'visibility') return t(`visibility.option.${String(raw)}`);
    if (field === 'recordKind') return t(`links.group.${String(raw)}`);
    if (field === 'startOn' && typeof raw === 'string') return calendarDateLabel(raw, language);
    return String(raw);
  };

  return (
    <RecordHistory
      history={history}
      copy={{
        hint: t('changeHistory.hint'),
        empty: t('changeHistory.empty'),
        end: t('changeHistory.end'),
        truncated: t('changeHistory.truncated'),
      }}
      heading={(entry) => t(`auditLog.${entry.action}`)}
      changes={projectHistoryChanges}
      fieldLabel={(field) => (LABELLED_FIELDS.has(field) ? t(`history.field.${field}`) : humaniseKey(field))}
      renderValue={renderValue}
    />
  );
}
