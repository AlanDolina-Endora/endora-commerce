import { useEffect, useState, type ReactElement } from 'react';
import type { Data } from '@puckeditor/core';
import type { CmsPageBuilderTranslateResponse } from '@endora-commerce/contracts';
import { Button } from '@endora-commerce/admin-kit/ui';
import { useTranslation } from '@endora-commerce/admin-kit/i18n';

/**
 * Feature 151 (FR-019, User Story 4) — what the editor says after a
 * translation, and the one way back: *Restore previous content*.
 *
 * The notice refers to the most recent translation of this tab only, so it
 * goes on the next save, the next translation and a tab change.
 */
export type TranslationNoticeState =
  | { kind: 'nothing' }
  | {
      kind: 'translated';
      report: CmsPageBuilderTranslateResponse['report'];
      language: string;
      /** The canvas exactly as it was before the translation, unsaved edits included. */
      previous: Data;
    };

/** The notice, cleared whenever `contentKey` (tab) or `savedVersion` (save) changes. */
export function useTranslationNotice(
  contentKey: string | undefined,
  savedVersion: string | number | null | undefined,
): [TranslationNoticeState | null, (next: TranslationNoticeState | null) => void] {
  const [notice, setNotice] = useState<TranslationNoticeState | null>(null);
  useEffect(() => {
    setNotice(null);
  }, [contentKey, savedVersion]);
  return [notice, setNotice];
}

export function TranslationNotice({
  notice,
  onRestore,
  onDismiss,
}: {
  notice: TranslationNoticeState;
  onRestore: (previous: Data) => void;
  onDismiss: () => void;
}): ReactElement {
  const t = useTranslation('cms');
  const untranslatable =
    notice.kind === 'translated'
      ? notice.report.untranslatableBlocks.reduce((sum, block) => sum + block.count, 0)
      : 0;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
    >
      <div className="space-y-0.5">
        {notice.kind === 'nothing' ? (
          <p>{t('pageBuilder.translate.nothing')}</p>
        ) : (
          <>
            <p>
              {t('pageBuilder.translate.success', {
                count: notice.report.translatedSegments,
                language: notice.language,
              })}
            </p>
            {notice.report.untranslatedSegments > 0 ? (
              <p>{t('pageBuilder.translate.untranslated', { count: notice.report.untranslatedSegments })}</p>
            ) : null}
            {untranslatable > 0 ? <p>{t('pageBuilder.translate.untranslatable', { count: untranslatable })}</p> : null}
            {notice.report.scope.widened ? <p>{t('pageBuilder.translate.widened')}</p> : null}
          </>
        )}
      </div>
      <div className="flex gap-2">
        {notice.kind === 'translated' ? (
          <Button type="button" variant="outline" size="sm" onClick={(): void => onRestore(notice.previous)}>
            {t('pageBuilder.translate.restore')}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
          {t('pageBuilder.translate.dismiss')}
        </Button>
      </div>
    </div>
  );
}
