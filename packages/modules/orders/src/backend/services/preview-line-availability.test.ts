import { describe, expect, it } from 'vitest';
import {
  ADMIN_ORDER_PREVIEW_MESSAGE_PRECEDENCE,
  isProductVisibleTo,
  productVisibilitySchema,
} from '@endora-commerce/contracts';
import { previewLineAvailability } from './preview-line-availability.js';

/**
 * Steps 1–3 of the order preview's per-line decision (feature 145, FR-027):
 * missing > not visible to the customer > not in the order's channel. The
 * visibility expectation is derived from `isProductVisibleTo` itself, never a
 * hand-written table, so this test cannot drift from the buyer-facing rule.
 */
const [NOT_FOUND, NOT_VISIBLE, NOT_IN_CHANNEL] = ADMIN_ORDER_PREVIEW_MESSAGE_PRECEDENCE;

const ORG = '00000000-0000-4000-8000-00000000a001';
const OTHER_ORG = '00000000-0000-4000-8000-00000000a002';

const allowLists: Array<{ name: string; ids: string[] }> = [
  { name: 'empty allow-list', ids: [] },
  { name: 'allow-list naming the org', ids: [ORG] },
  { name: 'allow-list naming another org', ids: [OTHER_ORG] },
];

describe('previewLineAvailability', () => {
  it.each([true, false])('reports a missing product as not found (inChannel %s)', (inChannel) => {
    expect(previewLineAvailability({ product: null, organizationId: ORG, inChannel })).toEqual({
      available: false,
      code: NOT_FOUND,
    });
  });

  for (const visibility of productVisibilitySchema.options) {
    for (const allowList of allowLists) {
      const product = { visibility, allowedOrganizationIds: allowList.ids };
      const visible = isProductVisibleTo(product, { organizationId: ORG, authenticated: true });

      for (const inChannel of [true, false]) {
        const expected = !visible
          ? { available: false, code: NOT_VISIBLE }
          : !inChannel
            ? { available: false, code: NOT_IN_CHANNEL }
            : { available: true };

        it(`${visibility}, ${allowList.name}, inChannel ${inChannel} → ${
          'code' in expected ? expected.code : 'available'
        }`, () => {
          expect(previewLineAvailability({ product, organizationId: ORG, inChannel })).toEqual(
            expected,
          );
        });
      }
    }
  }

  it('covers both outcomes of the visibility rule, so the table is not vacuous', () => {
    const outcomes = new Set<boolean>();
    for (const visibility of productVisibilitySchema.options) {
      for (const allowList of allowLists) {
        outcomes.add(
          isProductVisibleTo(
            { visibility, allowedOrganizationIds: allowList.ids },
            { organizationId: ORG, authenticated: true },
          ),
        );
      }
    }
    expect([...outcomes].sort()).toEqual([false, true]);
  });
});
