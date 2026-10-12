import { useId, useState, type ReactNode } from 'react';
import { Info, Lock, PencilLine, RefreshCw, TriangleAlert } from 'lucide-react';
import type { AdminZoneProps } from '@endora-commerce/contracts';
import { useTranslation } from '@endora-commerce/admin-kit/i18n';
import { cn } from '@endora-commerce/admin-kit/lib';
import { Alert, AlertDescription, Badge, Button, Label, Select } from '@endora-commerce/admin-kit/ui';
import { usePreviewChannels, useRobotsPreview } from './preview-client.js';
import { buildPreviewModel, type PreviewNotice } from './preview-model.js';

/**
 * The `robots.txt` a sales channel's storefront serves, beside the setting
 * that shapes it — `seo`'s contribution to `settings.setting.after`, matched
 * to `seo.robots_txt_custom`
 * (`specs/144-seo-search-engine-robots/contracts/admin-surfaces.md` §4).
 *
 * Two blocks in the order the file carries them: the rules the storefront
 * generates, which cannot be edited here, and the operator's own text, taken
 * from the field as it is typed. What is shown, and which sentences go with
 * it, is `buildPreviewModel`'s decision; this file draws it.
 *
 * **Everything a storefront sent is drawn as text.** The rules arrive from
 * another server and the address from a setting; both are React text nodes
 * inside the elements below, never markup and never a link target.
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
  unsaved: 'crawlerPreview.notice.unsaved',
  'storefront-outdated': 'crawlerPreview.notice.storefrontOutdated',
  'storefront-unreachable': 'crawlerPreview.notice.storefrontUnreachable',
  'address-unknown': 'crawlerPreview.notice.addressUnknown',
  'preview-failed': 'crawlerPreview.notice.previewFailed',
  'no-channel': 'crawlerPreview.notice.noChannel',
  'stays-open': 'crawlerPreview.notice.staysOpen',
  'site-wide-disallow': 'crawlerPreview.notice.siteWideDisallow',
  'shared-address': 'crawlerPreview.notice.sharedAddress',
  'channels-with-own-value': 'crawlerPreview.notice.channelsWithOwnValue',
  'previewed-channel-has-own-value': 'crawlerPreview.notice.previewedChannelHasOwnValue',
};

const BLOCK_CLASS =
  'max-h-64 overflow-auto whitespace-pre rounded-md px-3 py-2 font-mono text-xs leading-5 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function RobotsTxtPreview({
  channelCode,
  draftText,
  dirty,
}: RobotsTxtPreviewProps): ReactNode {
  const t = useTranslation('seo');
  const headingId = useId();
  const pickerId = useId();
  const systemLabelId = useId();
  const operatorLabelId = useId();

  const allChannels = channelCode === null;
  const channels = usePreviewChannels(allChannels);
  const [picked, setPicked] = useState<string | null>(null);
  const pickedStillOffered = picked !== null && channels.items.some((item) => item.code === picked);
  const previewedChannel = allChannels
    ? pickedStillOffered
      ? picked
      : (channels.items[0]?.code ?? null)
    : channelCode;

  const { request, reload } = useRobotsPreview(previewedChannel);
  const model = buildPreviewModel({ channelCode, draftText, dirty }, previewedChannel, request);

  // In all-channels mode there is nothing to ask until the channels are known.
  const waitingForChannels = allChannels && channels.status === 'loading';
  const loading = previewedChannel === null ? waitingForChannels : model.loading;
  const notices = waitingForChannels
    ? model.notices.filter((notice) => notice.kind !== 'no-channel')
    : model.notices;
  const notServed = notices.some((notice) => notice.kind === 'storefront-outdated');

  return (
    <section
      aria-labelledby={headingId}
      className="mt-3 space-y-3 rounded-md border bg-muted/30 px-3 py-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-1">
          <h4 id={headingId} className="text-sm font-medium">
            {t('crawlerPreview.robots.title')}
          </h4>
          <p className="text-xs text-muted-foreground">{t('crawlerPreview.robots.description')}</p>
          {!allChannels ? (
            <p className="text-xs text-muted-foreground">
              {t('crawlerPreview.channel.label', { channel: channelCode })}
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
                value={previewedChannel ?? ''}
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
            disabled={previewedChannel === null || loading}
          >
            <RefreshCw aria-hidden="true" className="mr-1 h-3.5 w-3.5" />
            {t('crawlerPreview.refresh')}
          </Button>
        </div>
      </div>

      {/* One polite live region for everything that appears without the
          operator asking for it: the storefront's answer arriving, and the
          field starting to differ from what is saved. Not atomic, so that a
          notice that appears is read on its own rather than with every other
          one. Each notice is a sentence with an icon; the tone is never
          carried by colour alone. */}
      <div role="status" aria-live="polite" aria-atomic="false" className="space-y-2">
        {loading ? (
          <p className="text-xs text-muted-foreground">{t('crawlerPreview.loading')}</p>
        ) : null}
        {notices.map((notice) => (
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

      {model.systemPart !== null ? (
        <div className="space-y-1">
          <p id={systemLabelId} className="flex flex-wrap items-center gap-2 text-xs font-medium">
            <Lock aria-hidden="true" className="h-3.5 w-3.5" />
            {t('crawlerPreview.system.title')}
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              {t('crawlerPreview.system.readOnly')}
            </Badge>
          </p>
          <pre
            tabIndex={0}
            aria-labelledby={systemLabelId}
            data-part="system"
            className={cn(BLOCK_CLASS, 'border border-dashed bg-muted/60 text-muted-foreground')}
          >
            {model.systemPart}
          </pre>
        </div>
      ) : null}

      <div className="space-y-1">
        <p id={operatorLabelId} className="flex flex-wrap items-center gap-2 text-xs font-medium">
          <PencilLine aria-hidden="true" className="h-3.5 w-3.5" />
          {model.operatorPartOrigin === 'saved'
            ? t('crawlerPreview.operator.titleSaved')
            : t('crawlerPreview.operator.title')}
          {model.operatorPartUnsaved ? (
            <Badge variant="warning" className="text-[10px]">
              {t('crawlerPreview.operator.unsavedBadge')}
            </Badge>
          ) : null}
          {notServed ? (
            <Badge variant="outline" className="text-[10px]">
              {t('crawlerPreview.operator.notServedBadge')}
            </Badge>
          ) : null}
        </p>
        {model.operatorPart === '' ? (
          <p data-part="operator-empty" className="text-xs text-muted-foreground">
            {t('crawlerPreview.operator.empty')}
          </p>
        ) : (
          <pre
            tabIndex={0}
            aria-labelledby={operatorLabelId}
            data-part="operator"
            className={cn(BLOCK_CLASS, 'border-y border-r border-l-4 border-l-primary bg-background')}
          >
            {model.operatorPart}
          </pre>
        )}
      </div>
    </section>
  );
}

/** The default export the zone declaration's dynamic-import factory resolves. */
export default RobotsTxtPreview;
