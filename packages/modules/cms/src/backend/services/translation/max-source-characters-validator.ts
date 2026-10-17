import {
  CMS_TRANSLATION_MAX_SOURCE_CHARACTERS_BOUNDS,
  ERROR_CODES,
  type SettingWriteValidator,
} from '@endora-commerce/contracts';
import { HttpError } from '@endora-commerce/platform/http';
import { CMS_PAGE_BUILDER_SETTING_CODES } from '../../../manifest.js';

/**
 * Feature 151 (T073, research R8) — the size-limit setting's write rule,
 * contributed to `settings`' validator registry so that every write path — the
 * generic Settings screen and its API alike — refuses a value outside the
 * bounds. The bounds are the synchronous-request trade-off research R8 records.
 */
export function createMaxSourceCharactersValidator(): SettingWriteValidator {
  const { min, max } = CMS_TRANSLATION_MAX_SOURCE_CHARACTERS_BOUNDS;
  return {
    contributorModuleId: 'cms',
    codes: [CMS_PAGE_BUILDER_SETTING_CODES.TRANSLATION_MAX_SOURCE_CHARACTERS],
    async validate({ proposedValue }) {
      if (
        typeof proposedValue === 'number' &&
        Number.isInteger(proposedValue) &&
        proposedValue >= min &&
        proposedValue <= max
      ) {
        return;
      }
      throw new HttpError(
        422,
        ERROR_CODES.VALIDATION_FAILED,
        `Translation size limit must be a whole number from ${min} to ${max}.`,
        [{ path: 'value', issue: `Expected an integer from ${min} to ${max}` }],
      );
    },
  };
}
