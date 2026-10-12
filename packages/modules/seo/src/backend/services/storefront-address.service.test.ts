import { afterEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import {
  STOREFRONT_URL_SETTING_CODE,
  StorefrontAddressService,
  type StorefrontAddressSettingsPort,
} from './storefront-address.service.js';

/**
 * Where a sales channel's storefront is taken to be
 * (`specs/144-seo-search-engine-robots/research.md` R2).
 *
 * Three rungs, and the answer says which one it came from: the channel's own
 * `sales_channels.storefront_url`, then `STOREFRONT_BASE_URL`, then a
 * fallback. The sitemap stamps its URLs from it and the crawler-file preview
 * asks the storefront at it — and the preview must know when the address is a
 * guess, because a request to a guess is a request to nobody's storefront.
 */

const CHANNEL_ID = '00000000-0000-4000-8000-0000000000c1';

function settingsAnswering(value: unknown): StorefrontAddressSettingsPort & {
  readonly calls: Array<[string, string]>;
} {
  const calls: Array<[string, string]> = [];
  return {
    calls,
    async get<T>(code: string, salesChannelId: string, schema: z.ZodType<T>): Promise<T> {
      calls.push([code, salesChannelId]);
      if (value instanceof Error) throw value;
      return schema.parse(value);
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('StorefrontAddressService', () => {
  it('answers the channel’s own setting first, and says so', async () => {
    vi.stubEnv('STOREFRONT_BASE_URL', 'https://env.example');
    const settings = settingsAnswering('https://shop-pl.example');
    const service = new StorefrontAddressService(settings);
    expect(await service.resolve(CHANNEL_ID)).toEqual({
      url: 'https://shop-pl.example',
      source: 'setting',
    });
    expect(settings.calls).toEqual([[STOREFRONT_URL_SETTING_CODE, CHANNEL_ID]]);
    expect(STOREFRONT_URL_SETTING_CODE).toBe('sales_channels.storefront_url');
  });

  it('trims the setting, and keeps a trailing slash for the caller to decide about', async () => {
    const service = new StorefrontAddressService(settingsAnswering('  https://shop.example/  '));
    expect(await service.resolve(CHANNEL_ID)).toEqual({
      url: 'https://shop.example/',
      source: 'setting',
    });
  });

  it.each([
    ['empty', ''],
    ['made of whitespace', '   '],
  ])('falls to the environment when the setting is %s', async (_label, stored) => {
    vi.stubEnv('STOREFRONT_BASE_URL', ' https://env.example ');
    const service = new StorefrontAddressService(settingsAnswering(stored));
    expect(await service.resolve(CHANNEL_ID)).toEqual({
      url: 'https://env.example',
      source: 'env',
    });
  });

  it('falls to the environment when the setting cannot be read', async () => {
    vi.stubEnv('STOREFRONT_BASE_URL', 'https://env.example');
    const service = new StorefrontAddressService(settingsAnswering(new Error('not registered')));
    expect((await service.resolve(CHANNEL_ID)).source).toBe('env');
  });

  it('falls to the environment when there is no settings store at all', async () => {
    vi.stubEnv('STOREFRONT_BASE_URL', 'https://env.example');
    const service = new StorefrontAddressService(null);
    expect(await service.resolve(CHANNEL_ID)).toEqual({ url: 'https://env.example', source: 'env' });
  });

  it('answers the fallback last, and says it is one', async () => {
    vi.stubEnv('STOREFRONT_BASE_URL', '');
    const service = new StorefrontAddressService(settingsAnswering(''), {
      fallbackUrl: 'http://test.local',
    });
    expect(await service.resolve(CHANNEL_ID)).toEqual({
      url: 'http://test.local',
      source: 'fallback',
    });
  });

  it('reads the environment per call, so the rung follows a value set after construction', async () => {
    vi.stubEnv('STOREFRONT_BASE_URL', '');
    const service = new StorefrontAddressService(settingsAnswering(''), {
      fallbackUrl: 'http://test.local',
    });
    expect((await service.resolve(CHANNEL_ID)).source).toBe('fallback');
    vi.stubEnv('STOREFRONT_BASE_URL', 'https://later.example');
    expect(await service.resolve(CHANNEL_ID)).toEqual({
      url: 'https://later.example',
      source: 'env',
    });
  });

  it('defaults the fallback to the local development storefront', async () => {
    vi.stubEnv('STOREFRONT_BASE_URL', undefined);
    const service = new StorefrontAddressService(null);
    expect(await service.resolve(CHANNEL_ID)).toEqual({
      url: 'http://localhost:3000',
      source: 'fallback',
    });
  });
});
