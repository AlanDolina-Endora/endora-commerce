import type { ReactNode } from 'react';
import type { AdminZoneProps } from '@endora-commerce/contracts';
import { CrawlerFilePreview } from './CrawlerFilePreview.js';

/**
 * The `robots.txt` a sales channel's storefront serves, beside the setting
 * that shapes it — `seo`'s contribution to `settings.setting.after`, matched
 * to `seo.robots_txt_custom`
 * (`specs/144-seo-search-engine-robots/contracts/admin-surfaces.md` §4).
 *
 * Everything it shows is `CrawlerFilePreview`'s, which the `llms.txt` preview
 * draws with as well; this file says which of the two files it is.
 */
export type RobotsTxtPreviewProps = AdminZoneProps<'settings.setting.after'>;

export function RobotsTxtPreview(props: RobotsTxtPreviewProps): ReactNode {
  return <CrawlerFilePreview {...props} file="robots" />;
}

/** The default export the zone declaration's dynamic-import factory resolves. */
export default RobotsTxtPreview;
