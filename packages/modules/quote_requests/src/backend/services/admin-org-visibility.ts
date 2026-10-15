import type { SalesRepAssignmentPort } from '@endora-commerce/contracts';
import { orgConstraintFor } from '@endora-commerce/platform/tenancy';

/**
 * Whether the ambient scope reaches every organization — a platform
 * administrator, or a system caller. Read from the tenant context, which the
 * host derives from the admin's role and never from the request (the Phase 4
 * probe's rule, D-3M).
 */
export const isPlatformWideScope = (): boolean => orgConstraintFor().kind === 'all';

/**
 * Whether an administrator may see an organization: every one for a
 * platform-wide scope, else the sales representative's assignments (the
 * unassigned-organization fallback included, which `canSeeOrganization`
 * answers). A caller with no admin user id sees none outside a platform-wide
 * scope.
 *
 * Shared by the negotiation routes' display reads and the negotiation Commands'
 * authority step, so the two can never disagree about who reaches what.
 */
export async function adminCanSeeOrganization(
  salesRepScope: Pick<SalesRepAssignmentPort, 'canSeeOrganization'>,
  adminUserId: string | null | undefined,
  organizationId: string,
  isPlatformWide: () => boolean = isPlatformWideScope,
): Promise<boolean> {
  if (isPlatformWide()) return true;
  if (!adminUserId) return false;
  return salesRepScope.canSeeOrganization(adminUserId, organizationId);
}
