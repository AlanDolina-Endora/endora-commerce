import { useEffect, useRef, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import type { AdminZoneProps } from '@endora-commerce/contracts';
import { useTranslation } from '@endora-commerce/admin-kit/i18n';
import { Alert, AlertDescription } from '@endora-commerce/admin-kit/ui';
import { reloadRobotsPreviews, usePreviewChannels, useRobotsPreviews } from './preview-client.js';
import { DEFAULT_ROBOTS_NOTICE_MAX_CHANNELS, outdatedStorefrontChannels } from './preview-model.js';

/**
 * "This storefront does not apply *Default robots* yet" — `seo`'s second
 * contribution to `settings.setting.after`, matched to `seo.default_robots`
 * (`specs/144-seo-search-engine-robots/spec.md`, ruling R9).
 *
 * A storefront is deployed apart from its backend. One that predates this
 * feature never asks for the channel's policy, so an operator can choose
 * `NOINDEX` here, see it saved, and believe a shop is out of search while
 * every page is still served without the directive. This row is where that
 * operator is looking, so this is where it is said.
 *
 * It renders **only** when a storefront is known to be outdated — the answer
 * the preview endpoint already gives. While that is unknown, or the storefront
 * cannot be reached, the row is exactly the row without this contribution.
 *
 * Edited for all channels, it asks about the first
 * {@link DEFAULT_ROBOTS_NOTICE_MAX_CHANNELS} active channels and names the
 * ones concerned.
 */
export type DefaultRobotsStorefrontNoticeProps = AdminZoneProps<'settings.setting.after'>;

export function DefaultRobotsStorefrontNotice({
  channelCode,
  dirty,
}: DefaultRobotsStorefrontNoticeProps): ReactNode {
  const t = useTranslation('seo');
  const allChannels = channelCode === null;
  const channels = usePreviewChannels(allChannels);
  const asked = allChannels
    ? channels.items.slice(0, DEFAULT_ROBOTS_NOTICE_MAX_CHANNELS).map((item) => item.code)
    : [channelCode];
  const outdated = outdatedStorefrontChannels(useRobotsPreviews(asked));

  // The answer carries the channel's saved policy, which the preview beside
  // the `robots.txt` text shows a sentence about. When this row stops being
  // dirty it was saved or put back, so the answers are asked for again.
  const wasDirty = useRef(dirty);
  useEffect(() => {
    if (wasDirty.current && !dirty) reloadRobotsPreviews();
    wasDirty.current = dirty;
  }, [dirty]);

  if (outdated.length === 0) return null;
  return (
    <Alert
      role="status"
      variant="warning"
      className="mt-3 px-3 py-2 [&>svg]:left-3 [&>svg]:top-2.5"
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
  );
}

/** The default export the zone declaration's dynamic-import factory resolves. */
export default DefaultRobotsStorefrontNotice;
