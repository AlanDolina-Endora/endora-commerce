import { describe, expect, it } from 'vitest';
import { HttpError } from '@endora-commerce/platform/http';
import { createMaxSourceCharactersValidator } from './max-source-characters-validator.js';

/** Feature 151, T073 — the size-limit setting is refused outside 1 000–200 000 on write. */
describe('createMaxSourceCharactersValidator', () => {
  const validator = createMaxSourceCharactersValidator();
  const code = 'cms.page_builder.translation.max_source_characters';
  const run = (proposedValue: unknown) =>
    validator.validate({ code, proposedValue } as Parameters<typeof validator.validate>[0]);

  it('answers for its code only, as cms', () => {
    expect(validator.contributorModuleId).toBe('cms');
    expect(validator.codes).toEqual([code]);
  });

  it.each([1000, 40000, 200000])('accepts %d', async (value) => {
    await expect(run(value)).resolves.toBeUndefined();
  });

  it.each([999, 200001, 1.5, 0, -5, '40000', null])('refuses %j naming the bounds', async (value) => {
    const error = await run(value).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ statusCode: 422, code: 'VALIDATION_FAILED' });
    expect((error as Error).message).toContain('1000');
    expect((error as Error).message).toContain('200000');
  });
});
