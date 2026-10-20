import { describe, expect, it } from 'vitest';
import type { AttributeScope, OverrideRow } from '@endora-commerce/contracts';

import {
  channelOverrideFor,
  effectiveAttributeValues,
  effectiveSystemText,
} from './storefront-value-overrides.js';

const A = 'channel-a';
const B = 'channel-b';

const rows: OverrideRow[] = [
  { attributeKey: 'name', channelId: A, languageCode: 'pl-PL', value: { v: 'Zestaw hurtowy' } },
  { attributeKey: 'name', channelId: A, languageCode: null, value: { v: 'Channel-only name' } },
  { attributeKey: 'description', channelId: A, languageCode: 'pl-PL', value: { v: '' } },
  { attributeKey: 'finish', channelId: A, languageCode: null, value: { v: 'Matte' } },
];

describe('effectiveSystemText (issue #384)', () => {
  it('takes the (channel, language) override', () => {
    expect(
      effectiveSystemText(rows, 'name', { channelId: A, languageCode: 'pl-PL' }, 'Baseline'),
    ).toBe('Zestaw hurtowy');
  });

  it('takes the channel-only override when no language slot matches', () => {
    expect(
      effectiveSystemText(rows, 'name', { channelId: A, languageCode: 'en-US' }, 'Baseline'),
    ).toBe('Channel-only name');
  });

  it("keeps the caller's baseline pick on another channel, with no rows, and for an empty override", () => {
    expect(
      effectiveSystemText(rows, 'name', { channelId: B, languageCode: 'pl-PL' }, 'Baseline'),
    ).toBe('Baseline');
    expect(
      effectiveSystemText(undefined, 'name', { channelId: A, languageCode: 'pl-PL' }, 'Baseline'),
    ).toBe('Baseline');
    expect(
      effectiveSystemText(rows, 'description', { channelId: A, languageCode: 'pl-PL' }, 'Opis'),
    ).toBe('Opis');
  });
});

describe('channelOverrideFor (issue #384)', () => {
  it('never answers from a baseline slot', () => {
    const scope: AttributeScope = { channelScoped: false, languageScoped: false };
    expect(channelOverrideFor(rows, 'finish', scope, { channelId: A, languageCode: null })).toBe(
      undefined,
    );
  });
});

describe('effectiveAttributeValues (issue #384)', () => {
  const scopes = new Map<string, AttributeScope>([
    ['finish', { channelScoped: true, languageScoped: false }],
  ]);

  it('replaces a channel-scoped attribute with its override', async () => {
    const out = await effectiveAttributeValues(
      { finish: 'Gloss', color: 'red' },
      rows,
      { channelId: A, languageCode: 'pl-PL' },
      async () => scopes,
    );
    expect(out).toEqual({ finish: 'Matte', color: 'red' });
  });

  it('returns the input untouched, without reading scopes, when no user-attribute row exists', async () => {
    const values = { finish: 'Gloss' };
    let scopeReads = 0;
    const out = await effectiveAttributeValues(
      values,
      rows.filter((r) => r.attributeKey === 'name'),
      { channelId: A, languageCode: 'pl-PL' },
      async () => {
        scopeReads += 1;
        return scopes;
      },
    );
    expect(out).toBe(values);
    expect(scopeReads).toBe(0);
  });

  it('leaves a value whose attribute is no longer channel-scoped', async () => {
    const out = await effectiveAttributeValues(
      { finish: 'Gloss' },
      rows,
      { channelId: A, languageCode: 'pl-PL' },
      async () => new Map([['finish', { channelScoped: false, languageScoped: false }]]),
    );
    expect(out).toEqual({ finish: 'Gloss' });
  });
});
