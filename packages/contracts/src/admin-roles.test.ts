import { describe, expect, it } from 'vitest';
import { permissionsNotHeld } from './admin-roles.js';

describe('permissionsNotHeld — the grant ceiling', () => {
  it('answers nothing when every requested code is held', () => {
    expect(permissionsNotHeld(['orders:read'], ['orders:read', 'orders:write'])).toEqual([]);
  });

  it('names every requested code the holder lacks, once, in request order', () => {
    expect(
      permissionsNotHeld(['catalog:write', 'orders:read', 'catalog:write', 'orders:write'], [
        'orders:read',
      ]),
    ).toEqual(['catalog:write', 'orders:write']);
  });

  it('lets a holder of the wildcard grant anything, the wildcard included', () => {
    expect(permissionsNotHeld(['*', 'catalog:write'], ['*'])).toEqual([]);
  });

  it('treats a requested wildcard as a code only a wildcard holder has', () => {
    expect(permissionsNotHeld(['*'], ['orders:read', 'admin_users:manage'])).toEqual(['*']);
  });

  it('answers nothing for an empty request', () => {
    expect(permissionsNotHeld([], [])).toEqual([]);
  });
});
