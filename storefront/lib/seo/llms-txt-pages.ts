import { getBlogIndex } from '../api/blog';
import { READ_TIMEOUT_MS } from './crawler-policy';
import { LLMS_TXT_CONDITIONAL_PAGES, type LlmsTxtConditionalPath } from './llms-txt-base';
import type { UnservedPages } from './llms-txt';

/**
 * Which of the pages `llms.txt` lists this storefront does not serve for a
 * sales channel right now (`llms-txt-base.ts`, `LLMS_TXT_CONDITIONAL_PAGES`).
 *
 * **Each page is asked about the way the page asks about itself**, so the file
 * and the page cannot disagree: `/blog` renders "not found" exactly when
 * `getBlogIndex` answers `null` — the `blog` module is switched off, or the
 * channel has no blog — and that same call is the question here. Module
 * presence alone would not do: a channel can have no blog while the module is
 * on.
 *
 * A page that cannot be asked about — the backend failed, or took longer than
 * a read is given — is counted as **not served**, and the answer is marked
 * uncertain so that `llms-txt.ts` asks again on the next request instead of
 * keeping it. Leaving a link out for a moment is the cheaper mistake.
 */

type Probe = (channelCode: string | undefined) => Promise<boolean>;

/** Whether each conditional page is served, by the name the base gives its condition. */
const PROBES: Readonly<
  Record<(typeof LLMS_TXT_CONDITIONAL_PAGES)[LlmsTxtConditionalPath], Probe>
> = {
  blog: async (channelCode) =>
    (await getBlogIndex(channelCode !== undefined ? { salesChannelCode: channelCode } : {})) !==
    null,
};

/** `probe`, given as long as a read of the backend is given and no longer. */
async function withinReadTimeout(probe: Promise<boolean>): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      probe,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('timed out')), READ_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function readUnservedPages(channelCode: string | undefined): Promise<UnservedPages> {
  const paths: string[] = [];
  let certain = true;
  await Promise.all(
    (Object.keys(LLMS_TXT_CONDITIONAL_PAGES) as LlmsTxtConditionalPath[]).map(async (path) => {
      try {
        const served = await withinReadTimeout(PROBES[LLMS_TXT_CONDITIONAL_PAGES[path]](channelCode));
        if (!served) paths.push(path);
      } catch {
        paths.push(path);
        certain = false;
      }
    }),
  );
  return { paths, certain };
}
