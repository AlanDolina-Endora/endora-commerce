import { StrictMode, type ReactElement } from 'react';
import type { SavedListView } from '@endora-commerce/contracts';
import type { SavedViewsControlProps } from '@endora-commerce/admin-kit/components';
import { SavedViewsControl } from '@endora-commerce/admin-kit/components';
import { renderWithI18n } from '../helpers/render-with-i18n';
import en from '../../../packages/modules/_i18n/i18n/en.json';
import pl from '../../../packages/modules/_i18n/i18n/pl.json';

/**
 * Shared fixtures for the `SavedViewsControl` tests (feature 147, T010/T011).
 *
 * The bundles are the real `core` bundles, not a passthrough: the tests assert
 * the copy a user reads, and the Polish run proves the eighteen `savedViews.*`
 * keys exist in both languages in the same assertion.
 */

export const ENDPOINT = '/api/v1/admin/orders/list-views';
export const EN_BUNDLE = { core: en as Record<string, string> };
export const PL_BUNDLE = { core: pl as Record<string, string> };

const OWNER = '00000000-0000-4000-8000-0000000000a1';
const COLLEAGUE = '00000000-0000-4000-8000-0000000000b2';

/** The caller's own private view. */
export const OWN_VIEW: SavedListView = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Unpaid EU',
  shared: false,
  ownerAdminUserId: OWNER,
  ownedByCaller: true,
  canModify: true,
  filters: { paymentStatus: ['awaiting_payment'], region: 'eu' },
  sort: { field: 'placedAt', dir: 'desc' },
  visibleColumns: ['businessId', 'total'],
};

/** A colleague's shared view the caller may not modify; carries no sort or columns. */
export const COLLEAGUE_SHARED: SavedListView = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Big orders',
  shared: true,
  ownerAdminUserId: COLLEAGUE,
  ownedByCaller: false,
  canModify: false,
  filters: { minTotal: 1000 },
};

/** A colleague's shared view the caller (a platform admin) may modify. */
export const MODIFIABLE_SHARED: SavedListView = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Team EU',
  shared: true,
  ownerAdminUserId: COLLEAGUE,
  ownedByCaller: false,
  canModify: true,
  filters: { region: 'eu' },
  sort: null,
  visibleColumns: null,
};

export const CURRENT: SavedViewsControlProps['current'] = {
  filters: { status: ['new'], q: 'acme' },
  sort: { field: 'total', dir: 'asc' },
  visibleColumns: ['businessId', 'status'],
};

export function renderControl(
  props: Partial<SavedViewsControlProps> = {},
  bundle: typeof EN_BUNDLE = EN_BUNDLE,
): ReturnType<typeof renderWithI18n> {
  const element: ReactElement = (
    <StrictMode>
      <SavedViewsControl
        endpoint={ENDPOINT}
        current={CURRENT}
        onApply={(): void => undefined}
        onError={(): void => undefined}
        {...props}
      />
    </StrictMode>
  );
  return renderWithI18n(element, bundle);
}

/** A promise the test settles by hand — an in-flight request. */
export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
