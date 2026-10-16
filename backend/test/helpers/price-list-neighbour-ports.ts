import type { EntityManager } from '@mikro-orm/postgresql';
import type { CatalogAttributeReadPort } from '@endora-commerce/contracts';
import { CatalogCategoryReadService } from '../../../packages/modules/catalog/src/backend/services/catalog-category-read.service.js';
import { CatalogProductReadService } from '../../../packages/modules/catalog/src/backend/services/catalog-product-read.service.js';
import { CustomerGroupReadService } from '../../../packages/modules/customer_accounts/src/backend/services/customer-group-read-port.js';
import { OrganizationDetailsService } from '../../../packages/modules/organizations/src/backend/services/organization-details-port.js';
import type { PriceListTargetReads } from '../../../packages/modules/price_lists/src/backend/services/price-list-service.js';

/**
 * Feature 075 Phase C — the neighbour read ports `price_lists` resolves.
 *
 * Twenty test files construct `PriceListService` and `PricingService` by hand,
 * so they have to supply what the container supplies in a real composition:
 * `catalog`'s, `organizations`' and — since feature 076 (D-79) —
 * `customer_accounts`' published read ports, which replaced this module's
 * `em.count(Organization, …)` / `em.findOne(Category, …)` /
 * `em.count(CustomerGroup, …)` validation of rule and override targets.
 *
 * The implementations are the **owners' own**, bound to the caller's
 * `EntityManager` factory. Both halves of that matter. A stub would have proved
 * less — the point of the cut is that the owners' published implementations
 * answer these questions, and a fake that agrees with the test's expectations
 * cannot show it. And several of these suites run inside an open transaction
 * (`TestDb.beginTx`), so a port on any other fork would not see the rows they
 * have just written.
 */
export function neighbourReadPorts(
  emFactory: () => EntityManager,
  /**
   * Feature 148 — `catalog`'s attribute read model. It composes `custom_fields`'
   * definition cache, so it cannot be built from an `EntityManager` alone; a
   * suite that prices attribute matrix entries passes the harness's own
   * (`h.catalogAttributeRead`). Absent, every read refuses — the fail-closed
   * shape of an unwired port, never "no attribute is eligible".
   */
  catalogAttributeRead: CatalogAttributeReadPort = refusingAttributeRead(),
): PriceListTargetReads {
  return {
    catalogProductRead: new CatalogProductReadService(emFactory),
    catalogCategoryRead: new CatalogCategoryReadService(emFactory),
    organizationDetails: new OrganizationDetailsService(emFactory),
    customerGroupRead: new CustomerGroupReadService(emFactory),
    catalogAttributeRead,
  };
}

function refusingAttributeRead(): CatalogAttributeReadPort {
  const refuse = (): never => {
    throw new Error(
      'neighbourReadPorts: this suite did not pass a catalogAttributeRead, and a price matrix ' +
        'entry asked about an attribute.',
    );
  };
  return {
    listAll: async () => refuse(),
    getByIdOrKey: async () => refuse(),
    listByFlag: async () => refuse(),
    optionLabelIndex: async () => refuse(),
  };
}
