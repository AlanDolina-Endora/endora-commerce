import { useEffect, useRef, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import type { AdminZoneProps } from '@endora-commerce/contracts';
import { useTranslation } from '@endora-commerce/admin-kit/i18n';
import { Alert, AlertDescription } from '@endora-commerce/admin-kit/ui';
import {
  SYSTEM_DEFAULT_CHANNEL,
  reloadCrawlerPreviews,
  usePreviewChannels,
  useRobotsPreviews,
} from './preview-client.js';
import { DEFAULT_ROBOTS_NOTICE_MAX_CHANNELS, outdatedStorefrontChannels } from './preview-model.js';

/**
 * "This storefront may not apply *Default robots*" — `seo`'s second
 * contribution to `settings.setting.after`, matched to `seo.default_robots`
 * (`specs/144-seo-search-engine-robots/spec.md`, ruling R9).
 *
 * A storefront is deployed apart from its backend. One that predates this
 * feature never asks for the channel's policy, so an operator can choose
 * `NOINDEX` here, see it saved, and believe a shop is out of search while
 * every page is still served without the directive. This row is where that
 * operator is looking, so this is where it is said.
 *
 * **What is known is narrower than what matters, and the sentence says so.**
 * The evidence is that the storefront answered the `robots.txt` question
 * without the header by which a current one identifies itself. That is what an
 * older storefront does — and also what a storefront copied by hand without
 * that route does, or a proxy that strips the header. So the notice says the
 * storefront *did not confirm* support and *may* not apply the setting.
 *
 * It renders only on that evidence. While it is unknown, or the storefront
 * cannot be reached, the row is the row without this contribution.
 *
 * Edited for all channels, it asks about the first
 * {@link DEFAULT_ROBOTS_NOTICE_MAX_CHANNELS} channels and names the ones
 * concerned; when the channels cannot be listed it asks about the system
 * default one.
 */
export type DefaultRobotsStorefrontNoticeProps = AdminZoneProps<'settings.setting.after'>;

export function DefaultRobotsStorefrontNotice({
  channelCode,
  dirty,
}: DefaultRobotsStorefrontNoticeProps): ReactNode {
  const t = useTranslation('seo');
  const allChannels = channelCode === null;
  const channels = usePreviewChannels(allChannels);
  const asked = !allChannels
    ? [channelCode]
    : channels.status === 'loading'
      ? null
      : channels.items.length === 0
        ? [SYSTEM_DEFAULT_CHANNEL]
        : channels.items.slice(0, DEFAULT_ROBOTS_NOTICE_MAX_CHANNELS).map((item) => item.code);
  const outdated = outdatedStorefrontChannels(
    useRobotsPreviews(allChannels ? 'all-channels' : 'channel', asked),
  );

  // The answer carries the channel's saved policy, which the preview beside
  // the `robots.txt` text shows a sentence about and which decides whether the
  // one beside the `llms.txt` content has a file to show at all. When this row stops being
  // dirty it was saved or put back, so the answers are asked for again.
  const wasDirty = useRef(dirty);
  useEffect(() => {
    if (wasDirty.current && !dirty) reloadCrawlerPreviews();
    wasDirty.current = dirty;
  }, [dirty]);

  // The live region is mounted before it has anything to say: a region that
  // arrives already carrying its text is not announced. Empty, it takes no
  // room: the gap its row would leave above it is taken away while it is empty.
  return (
    <div role="status" aria-live="polite" className="empty:!mt-0">
      {outdated.length === 0 ? null : (
        <Alert
          role="presentation"
          variant="warning"
          className="mt-1 px-3 py-2 [&>svg]:left-3 [&>svg]:top-2.5"
          data-notice="default-robots-storefront-outdated"
        >
          <TriangleAlert aria-hidden="true" className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <span className="font-medium">{t('crawlerPreview.notice.warningPrefix')} </span>
            {allChannels
              ? t('crawlerPreview.defaultRobots.storefrontOutdatedChannels', {
                  channels: outdated.join(', '),
                })
              : t('crawlerPreview.defaultRobots.storefrontOutdated')}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/** The default export the zone declaration's dynamic-import factory resolves. */
export default DefaultRobotsStorefrontNotice;
