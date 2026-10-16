import { describe, expect, it } from 'vitest';
import { manifest } from '../manifest.js';

describe('admin_search manifest', () => {
  it('is an operator-toggleable module, on by default', () => {
    expect(manifest.id).toBe('admin_search');
    expect(manifest.activation).toEqual({ settingCode: 'admin_search.enabled', default: true });
  });

  it('declares its activation control as a boolean setting of its own group', () => {
    const control = manifest.settings?.settings.find((s) => s.code === 'admin_search.enabled');
    expect(control).toMatchObject({
      groupCode: 'admin_search',
      valueType: 'boolean',
      defaultValue: true,
    });
  });
});
