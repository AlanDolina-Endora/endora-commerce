import { describe, expect, it } from 'vitest';
import { SettingDtoSchema, SettingManifestEntrySchema } from './settings.js';

/**
 * `multiline` on a setting declaration — a module asks the generic Settings
 * screen for a multi-line field. It is a presentation fact about free text, so
 * the schema refuses it wherever a multi-line field could not hold the value:
 * every value type but `string`, and a `string` that is a closed list.
 */
describe('SettingManifestEntrySchema — multiline', () => {
  const base = {
    code: 'demo.footer_note',
    name: 'Footer note',
    valueType: 'string',
    defaultValue: '',
  } as const;

  it('accepts multiline: true on a string setting', () => {
    const parsed = SettingManifestEntrySchema.safeParse({ ...base, multiline: true });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.multiline).toBe(true);
  });

  it('accepts a declaration that does not mention the field, and leaves it absent', () => {
    const parsed = SettingManifestEntrySchema.safeParse(base);
    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty('multiline');
  });

  it('accepts multiline: false on any value type — it asks for nothing', () => {
    const parsed = SettingManifestEntrySchema.safeParse({
      ...base,
      valueType: 'number',
      defaultValue: 1,
      multiline: false,
    });
    expect(parsed.success).toBe(true);
  });

  it.each([
    ['number', 1, {}],
    ['boolean', true, {}],
    ['json', {}, {}],
    ['string_list', [], {}],
    ['secret', '', {}],
    ['credential_ref', '', { configurationType: 'llm' }],
  ] as const)('refuses multiline: true on valueType %s, and names the field', (valueType, defaultValue, extra) => {
    const parsed = SettingManifestEntrySchema.safeParse({
      ...base,
      ...extra,
      valueType,
      defaultValue,
      multiline: true,
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['multiline']);
  });

  it('refuses multiline: true together with enumOptions, and names the field', () => {
    const parsed = SettingManifestEntrySchema.safeParse({
      ...base,
      defaultValue: 'a',
      enumOptions: ['a', 'b'],
      multiline: true,
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['multiline']);
  });
});

describe('SettingDtoSchema — multiline', () => {
  const dto = {
    id: '7e0c8de2-72e8-4d0e-bb16-7a40f87b97e1',
    code: 'demo.footer_note',
    name: 'Footer note',
    description: null,
    valueType: 'string',
    ownerModule: 'demo',
    salesChannelCodes: [],
    defaultValue: '',
    globalValue: null,
    valuesByChannel: [],
    version: '2026-10-11T10:00:00.000Z',
  };

  it('accepts the field', () => {
    expect(SettingDtoSchema.parse({ ...dto, multiline: true }).multiline).toBe(true);
    expect(SettingDtoSchema.parse({ ...dto, multiline: false }).multiline).toBe(false);
  });

  it('accepts its absence — a response from a backend that predates the field', () => {
    const parsed = SettingDtoSchema.safeParse(dto);
    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty('multiline');
  });

  it('refuses a non-boolean', () => {
    expect(SettingDtoSchema.safeParse({ ...dto, multiline: 'yes' }).success).toBe(false);
  });
});
