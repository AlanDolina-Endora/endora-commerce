# Quickstart — verifying price list matrix rules (148)

Prerequisites: `pnpm run build:packages`, `pnpm run dev:infra`, `pnpm run setup`, `pnpm run dev`.
Sign in to the admin as a platform administrator.

## 1. Flag an attribute

1. *Catalog → Attributes*: open a single-choice attribute (e.g. *Material*), tick **Price list
   rules / Reguły cennika**, save.
2. Ensure two products: P1 with *Material = Stainless*, P2 with *Material = Brass*, both in
   category *Fasteners*, both priced 100.00 PLN on the **Default** price list (*Products & brackets*).

## 2. Create matrix entries

On *Price lists → Default → Price matrix* (or any active list applying to the buyer):

| # | Applies to | Organization | Quantity | Price |
| --- | --- | --- | --- | --- |
| A | Category *Fasteners* | Acme | 500+ | Discount 12% |
| B | Attribute *Material = Stainless* | Acme | 1+ | Discount 10% |
| C | Product P2 | Acme | 1000+ | Fixed 80.00 PLN |

Try to add a duplicate of A with quantity 600+ → refused, the conflicting row is named.
Try to pick *Colour* (not flagged) → not offered; through the API → `PRICE_MATRIX_ATTRIBUTE_NOT_ELIGIBLE`.

## 3. Check prices (admin resolved-price probe, or storefront as an Acme buyer)

| Product | Qty | Expected | Winner |
| --- | --- | --- | --- |
| P1 | 1 | 90.00 | B (attribute beats nothing else at org level) |
| P1 | 600 | 90.00 | B (attribute specificity 2 > category 1) |
| P2 | 600 | 88.00 | A |
| P2 | 1000 | 80.00 | C (product) |
| P1 | 600, other organization | 100.00 | Default bracket |

The probe answer carries `matrixEntryId` for the matrix-priced rows. The storefront product page,
the listing card and the cart show the same figures; P2's tier ladder shows 500 and 1000.

## 4. Flip the flag

Untick **Price list rules** on *Material*. Within 60 s P1 at qty 1 prices 100.00; entry B shows
*Inactive* with the reason. Tick it again → 90.00 returns.

## 5. Scope and audit

- As a sales representative scoped to another organization, open the list's matrix: entries A–C are
  not listed; `GET …/matrix/<B id>` answers 404 `PRICE_MATRIX_ENTRY_NOT_FOUND`.
- *Audit log*: `price_list.matrix_entry_create` ×3 attributed to you; the home dashboard's Recent
  Activity shows them.
- Duplicate the list → the copy has three entries. Delete category *Fasteners* in the admin →
  entry A is still listed, marked *deleted item*; it disappears only if the category row is purged.

## 6. Automated

```bash
pnpm --filter @endora-commerce/contracts run test
pnpm --filter @endora-commerce/mod-price-lists run test
pnpm --filter backend exec vitest run test/contract/price_lists test/integration/price_lists
pnpm --filter admin exec vitest run test/modules/price_lists
pnpm --filter backend exec vitest run test/contract/admin_users/permission-inventory.test.ts test/unit/_i18n/registered-bundles-shape.test.ts
```
