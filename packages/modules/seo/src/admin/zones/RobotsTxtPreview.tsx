import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Info, RefreshCw, TriangleAlert } from 'lucide-react';
import type { AdminZoneProps } from '@endora-commerce/contracts';
import { useTranslation } from '@endora-commerce/admin-kit/i18n';
import { cn } from '@endora-commerce/admin-kit/lib';
import { Alert, AlertDescription, Badge, Button, Label, Select } from '@endora-commerce/admin-kit/ui';
import {
  SYSTEM_DEFAULT_CHANNEL,
  reloadRobotsPreviews,
  usePreviewChannels,
  useRobotsPreview,
} from './preview-client.js';
import {
  buildPreviewModel,
  type PreviewFileSegment,
  type PreviewModel,
  type PreviewNotice,
} from './preview-model.js';

/**
 * The `robots.txt` a sales channel's storefront serves, beside the setting
 * that shapes it — `seo`'s contribution to `settings.setting.after`, matched
 * to `seo.robots_txt_custom`
 * (`specs/144-seo-search-engine-robots/contracts/admin-surfaces.md` §4).
 *
 * **One block, and it is the file.** The text in the block is exactly what the
 * storefront serves — or will serve once the field is saved, which the heading
 * says. Inside it the operator's lines are marked with a bar and a label and
 * the generated lines with a label of their own, so the two are told apart
 * without the reader having to assemble a file from two boxes. What is shown,
 * and which sentences go with it, is `buildPreviewModel`'s decision; this file
 * draws it.
 *
 * **Everything a storefront sent is drawn as text.** The rules arrive from
 * another server and the address from a setting; both are React text nodes,
 * never markup and never a link target.
 *
 * **Nothing here can hold up the row.** The component receives the draft and
 * returns nothing to the editor: it has no way to change the value, and the
 * row's save does not wait for it.
 *
 * The zone renderer has already decided that `seo` is present and that the
 * person holds `settings:read` before this chunk is fetched.
 */
export type RobotsTxtPreviewProps = AdminZoneProps<'settings.setting.after'>;

/** The translation key of each notice's sentence. */
const NOTICE_KEY: Record<PreviewNotice['kind'], string> = {
  'storefront-outdated': 'crawlerPreview.notice.storefrontOutdated',
  'storefront-unreachable': 'crawlerPreview.notice.storefrontUnreachable',
  'address-unknown': 'crawlerPreview.notice.addressUnknown',
  'preview-failed': 'crawlerPreview.notice.previewFailed',
  'stays-open': 'crawlerPreview.notice.staysOpen',
  'site-wide-disallow': 'crawlerPreview.notice.siteWideDisallow',
  'shared-address': 'crawlerPreview.notice.sharedAddress',
  'channels-with-own-value': 'crawlerPreview.notice.channelsWithOwnValue',
  'previewed-channel-has-own-value': 'crawlerPreview.notice.previewedChannelHasOwnValue',
};

const HEADING_KEY: Record<PreviewModel['shows'], string> = {
  'after-saving': 'crawlerPreview.heading.afterSaving',
  'served-now': 'crawlerPreview.heading.servedNow',
  unknown: 'crawlerPreview.heading.unknown',
};

/**
 * A scrolling block of file text.
 *
 * Capped, so that the row does not take over the page: lower on a narrow
 * screen, where the row would otherwise run to several screens, and tall
 * enough on a wide one to show the rules a storefront generates today with a
 * screenful of the operator's own lines under them. Past the cap the block
 * scrolls inside, and is kept at its end while it holds the operator's lines —
 * see the effect in the component. Long lines scroll sideways inside the
 * block; the page never scrolls sideways. The block takes focus, so it can be
 * scrolled from the keyboard.
 */
const BLOCK_CLASS =
  'max-h-80 overflow-auto whitespace-pre rounded-md border bg-background font-mono text-xs ' +
  'leading-5 sm:max-h-[48rem] focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-ring';

/**
 * The label of a stretch, drawn from `data-label` by the stylesheet. It is not
 * a text node on purpose: the block's text is the file and nothing but the
 * file, so that what is selected, copied or compared is what is served. The
 * same words are in the legend above the block, as text.
 */
const SEGMENT_LABEL_CLASS =
  'before:mb-1 before:block before:font-sans before:text-[10px] before:font-semibold ' +
  'before:uppercase before:tracking-wide before:content-[attr(data-label)]';

const SEGMENT_CLASS: Record<PreviewFileSegment['kind'], string> = {
  system: cn('block px-3 py-2 text-muted-foreground', SEGMENT_LABEL_CLASS),
  separator: 'block px-3',
  operator: cn(
    'block border-l-4 border-l-primary bg-primary/5 px-3 py-2 before:text-primary',
    SEGMENT_LABEL_CLASS,
  ),
};

export function RobotsTxtPreview({
  channelCode,
  draftText,
  dirty,
}: RobotsTxtPreviewProps): ReactNode {
  const t = useTranslation('seo');
  const headingId = useId();
  const legendId = useId();
  const pickerId = useId();
  const detachedLabelId = useId();

  const allChannels = channelCode === null;
  const mode = allChannels ? 'all-channels' : 'channel';
  const channels = usePreviewChannels(allChannels);
  const [picked, setPicked] = useState<string | null>(null);
  const pickedStillOffered = picked !== null && channels.items.some((item) => item.code === picked);
  // For all channels: the picked channel, else the first offered — the system
  // default — else, when no channel can be listed, the system default by not
  // naming one. Nothing is asked while the list is still on its way.
  const target = !allChannels
    ? channelCode
    : channels.status === 'loading'
      ? null
      : pickedStillOffered
        ? picked
        : (channels.items[0]?.code ?? SYSTEM_DEFAULT_CHANNEL);

  const { request, reload } = useRobotsPreview(mode, target);
  const model = buildPreviewModel({ channelCode, draftText, dirty }, request);

  // When this row stops being dirty it was saved or put back. The answer says
  // which channels have a value of their own, and that is what a save changes.
  const wasDirty = useRef(dirty);
  useEffect(() => {
    if (wasDirty.current && !dirty) reloadRobotsPreviews();
    wasDirty.current = dirty;
  }, [dirty]);

  const mayNotBeServed = model.notices.some((notice) => notice.kind === 'storefront-outdated');
  const operatorLabel =
    model.operatorPartOrigin === 'saved'
      ? t('crawlerPreview.operator.labelSaved')
      : model.operatorPartUnsaved
        ? t('crawlerPreview.operator.labelUnsaved')
        : t('crawlerPreview.operator.label');
  const fileHasOperatorPart = model.file !== null && model.file.segments.length > 1;

  // The operator's lines are the end of the file, and the block is capped. So
  // while the file holds them, the block is kept scrolled to its end: what the
  // operator is typing stays in view instead of sitting below the generated
  // rules, out of sight. Only the block's own scroll position moves — never
  // the page's, and never the focus.
  const fileRef = useRef<HTMLPreElement>(null);
  const fileText = model.file?.text ?? null;
  useEffect(() => {
    const block = fileRef.current;
    if (block === null || fileText === null) return;
    block.scrollTop = fileHasOperatorPart ? block.scrollHeight : 0;
  }, [fileText, fileHasOperatorPart]);

  return (
    <section
      aria-labelledby={headingId}
      className="mt-3 space-y-3 rounded-md border bg-muted/30 px-3 py-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-1">
          {/* The page's own heading is the only one above this: the groups and
              rows of the Settings screen are not headings. */}
          <h2 id={headingId} className="text-sm font-medium">
            {t(HEADING_KEY[model.shows])}
          </h2>
          {model.previewedChannel !== null && !(allChannels && channels.items.length > 0) ? (
            <p className="text-xs text-muted-foreground">
              {t('crawlerPreview.channel.label', { channel: model.previewedChannel })}
            </p>
          ) : null}
          {model.storefrontUrl !== null ? (
            <p className="break-all text-xs text-muted-foreground">
              {t('crawlerPreview.address', { url: model.storefrontUrl })}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {allChannels && channels.items.length > 0 ? (
            <div className="space-y-1">
              <Label htmlFor={pickerId} className="text-xs">
                {t('crawlerPreview.channel.pickerLabel')}
              </Label>
              <Select
                id={pickerId}
                className="min-h-11 sm:min-h-9"
                value={target ?? ''}
                onChange={(event) => setPicked(event.target.value)}
              >
                {channels.items.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.code}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 sm:min-h-9"
            onClick={reload}
            disabled={target === null || model.loading}
          >
            <RefreshCw aria-hidden="true" className="mr-1 h-3.5 w-3.5" />
            {t('crawlerPreview.refresh')}
          </Button>
        </div>
      </div>

      {/* One polite live region for everything that appears without the
          operator asking for it: the storefront's answer arriving, and the
          file starting to differ from what is served. Always mounted, so that
          what appears in it is announced; not atomic, so that it is read on
          its own. Each notice is a sentence with an icon; the tone is never
          carried by colour alone. */}
      <div role="status" aria-live="polite" aria-atomic="false" className="space-y-2 empty:!mt-0">
        {model.loading ? (
          <p className="text-xs text-muted-foreground">{t('crawlerPreview.loading')}</p>
        ) : null}
        {model.shows === 'after-saving' ? (
          <p data-note="unsaved" className="text-xs text-muted-foreground">
            {t('crawlerPreview.unsavedNote')}
          </p>
        ) : null}
        {model.notices.map((notice) => (
          <Alert
            key={notice.kind}
            role="presentation"
            variant={notice.tone === 'warning' ? 'warning' : 'default'}
            className="px-3 py-2 [&>svg]:left-3 [&>svg]:top-2.5"
            data-notice={notice.kind}
          >
            {notice.tone === 'warning' ? (
              <TriangleAlert aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Info aria-hidden="true" className="h-4 w-4" />
            )}
            <AlertDescription className="text-xs">
              {notice.tone === 'warning' ? (
                <span className="font-medium">{t('crawlerPreview.notice.warningPrefix')} </span>
              ) : null}
              {t(
                NOTICE_KEY[notice.kind],
                notice.channels === undefined ? undefined : { channels: notice.channels.join(', ') },
              )}
            </AlertDescription>
          </Alert>
        ))}
      </div>

      {model.file !== null ? (
        <div className="space-y-1">
          <p id={legendId} className="text-xs text-muted-foreground">
            {fileHasOperatorPart
              ? t('crawlerPreview.legend.both')
              : model.operatorPartEmpty
                ? `${t('crawlerPreview.legend.systemOnly')} ${t('crawlerPreview.legend.nothingAdded')}`
                : t('crawlerPreview.legend.systemOnly')}
          </p>
          {/* The file. Its text content is the served file to the byte: the
              labels are drawn by the stylesheet and are not text in it. */}
          <pre
            ref={fileRef}
            tabIndex={0}
            aria-labelledby={headingId}
            aria-describedby={legendId}
            data-part="file"
            className={BLOCK_CLASS}
          >
            {model.file.segments.map((segment) => (
              <span
                key={segment.kind}
                data-part={segment.kind}
                data-label={
                  segment.kind === 'system'
                    ? t('crawlerPreview.system.label')
                    : segment.kind === 'operator'
                      ? operatorLabel
                      : undefined
                }
                className={SEGMENT_CLASS[segment.kind]}
              >
                {segment.text}
              </span>
            ))}
          </pre>
        </div>
      ) : null}

      {/* The operator's text on its own: when there is no file to show it in,
          or when the storefront did not confirm that it serves it. */}
      {model.detachedOperatorPart !== null ? (
        <div className="space-y-1">
          <p id={detachedLabelId} className="flex flex-wrap items-center gap-2 text-xs font-medium">
            {t('crawlerPreview.operator.label')}
            {model.operatorPartUnsaved ? (
              <Badge variant="warning" className="text-[10px]">
                {t('crawlerPreview.operator.unsavedBadge')}
              </Badge>
            ) : null}
            {mayNotBeServed ? (
              <Badge variant="outline" className="text-[10px]">
                {t('crawlerPreview.operator.mayNotBeServedBadge')}
              </Badge>
            ) : null}
          </p>
          <pre
            tabIndex={0}
            aria-labelledby={detachedLabelId}
            data-part="operator-detached"
            className={cn(BLOCK_CLASS, 'border-l-4 border-l-primary px-3 py-2')}
          >
            {model.detachedOperatorPart}
          </pre>
        </div>
      ) : null}
    </section>
  );
}

/** The default export the zone declaration's dynamic-import factory resolves. */
export default RobotsTxtPreview;
