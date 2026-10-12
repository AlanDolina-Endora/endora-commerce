import {
  CRAWLER_TEXT_MAX_BYTES,
  ERROR_CODES,
  type SettingWriteValidator,
} from '@endora-commerce/contracts';
import { HttpError } from '@endora-commerce/platform/http';
import {
  LLMS_TXT_ADDITIONAL_SETTING_CODE,
  ROBOTS_TXT_CUSTOM_SETTING_CODE,
} from './crawler-files.service.js';

/**
 * `seo`'s answer to "may this text be saved" for the settings whose value ends
 * up in a file a crawler downloads (`specs/144-seo-search-engine-robots/`,
 * FR-006).
 *
 * One rule: the text is at most {@link CRAWLER_TEXT_MAX_BYTES} bytes of UTF-8.
 * **Bytes**, because the limit bounds a download and a character is up to four
 * of them. Nothing else about the text is judged — it is the operator's, and
 * it is served as written.
 *
 * ## It reads the value being saved, not the projection
 *
 * `settings` also hands over what every channel's value would be after the
 * write. That is the wrong thing to measure here: an all-channels write
 * reaches no channel that has a value of its own, so on an instance where
 * every channel has one — every single-channel instance whose operator saved
 * "for this channel" once — the proposed text is in no channel's projection,
 * and a text of any size would be stored unseen and then served by the first
 * channel that is reset. The limit is on the text, so the text is what is
 * measured.
 *
 * Pure: no I/O.
 */

/** The settings this validator answers for. */
export const CRAWLER_TEXT_SETTING_CODES: readonly string[] = [
  ROBOTS_TXT_CUSTOM_SETTING_CODE,
  LLMS_TXT_ADDITIONAL_SETTING_CODE,
];

export function createCrawlerTextValidator(): SettingWriteValidator {
  return {
    contributorModuleId: 'seo',
    codes: CRAWLER_TEXT_SETTING_CODES,
    validate: async ({ code, proposedValue }) => {
      // Not a text: nothing to measure, and not this validator's to refuse.
      // The settings store parses the value against the setting's declared
      // type before it runs any validator, and both settings this one answers
      // for are declared `string` — so a value of another type has already
      // been refused with `SETTING_VALUE_SHAPE_MISMATCH` and never arrives
      // here. Returning rather than throwing keeps that the one place the
      // type is judged; `crawler-text-validator.test.ts` holds each code this
      // validator answers for to a `string` declaration.
      if (typeof proposedValue !== 'string') return;
      const actualBytes = Buffer.byteLength(proposedValue, 'utf8');
      if (actualBytes <= CRAWLER_TEXT_MAX_BYTES) return;
      throw new HttpError(
        400,
        ERROR_CODES.SEO_CRAWLER_TEXT_TOO_LARGE,
        `The text is ${actualBytes} bytes long. At most ${CRAWLER_TEXT_MAX_BYTES} bytes ` +
          '(64 KiB) can be saved.',
        // Scalars, so that the translated sentence can name both numbers. The
        // text itself never travels back.
        { settingCode: code, maxBytes: CRAWLER_TEXT_MAX_BYTES, actualBytes },
      );
    },
  };
}
