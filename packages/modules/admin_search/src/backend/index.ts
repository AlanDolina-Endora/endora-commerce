import type { ModuleContext } from '@endora-commerce/platform/kernel';

/**
 * `admin_search` — composed by the kernel container. Nothing to compose yet.
 */
export function registerModule(_ctx: ModuleContext): void {
  // Nothing to compose yet.
}

/**
 * The module's persisted entity classes (D-168). Global search owns no table,
 * so the array is empty and stays empty.
 */
export const entities = [];
