import type { ReactNode } from 'react';
import type { AdminZoneProps } from '@endora-commerce/contracts';
import { CrawlerFilePreview } from './CrawlerFilePreview.js';

/**
 * The `llms.txt` a sales channel's storefront serves, beside the setting that
 * shapes it — `seo`'s contribution to `settings.setting.after`, matched to
 * `seo.llms_txt_additional`
 * (`specs/144-seo-search-engine-robots/contracts/admin-surfaces.md` §4; FR-044).
 *
 * The same preview as the one beside the `robots.txt` instructions, drawn by
 * the same component, so the two look and behave alike. What is particular to
 * this file is in the model: on a sales channel that asks not to be indexed no
 * `llms.txt` is served, and the preview says so in place of a file.
 */
export type LlmsTxtPreviewProps = AdminZoneProps<'settings.setting.after'>;

export function LlmsTxtPreview(props: LlmsTxtPreviewProps): ReactNode {
  return <CrawlerFilePreview {...props} file="llms" />;
}

/** The default export the zone declaration's dynamic-import factory resolves. */
export default LlmsTxtPreview;
