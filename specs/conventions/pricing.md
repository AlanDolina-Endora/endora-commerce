# Pricing — how a product price is stored, resolved and read

**Open this before changing how a price is stored, resolved, displayed, sorted, indexed or
cached** — anything in `packages/modules/price_lists/`, any consumer of the pricing service
(catalog listings, PDP, search, carts, orders, quote requests, product feeds, promotions), or a
spec that touches price lists. One of the bodies `AGENTS.md` routes to; it is the single home for
these working rules, so never restate them in `AGENTS.md` or in a tool-specific pointer file.

Pricing is the subject that keeps coming back: one deep analysis (2026-10-21, issue #378 widened
by the product owner) mapped the model, every read path, seven peer platforms and the target
scenarios, so that nobody has to redo it. Its result is the standing set under `specs/pricing/`.
Start there instead of re-deriving the model from code.

## The standing pricing set

| Document | Answers |
| --- | --- |
| `specs/pricing/current-model.md` | What the code does today: tables, the resolution algorithm with its precedence and tie-breaks, where the Application rule and the Price matrix overlap, the pain points |
| `specs/pricing/read-paths-and-performance.md` | Every place a price is read, its query shape, caching, measured cost and remaining N+1 paths |
| `specs/pricing/peer-platforms.md` | How Medusa.js, Shopware, commercetools, Magento B2B, OroCommerce, SAP Commerce and BigCommerce model price lists, with source URLs |
| `specs/pricing/decision-record.md` | The target model ratified as D-287 (price books instead of the Application rule), its precedence, priority, performance plan, migration and phasing — and the product owner's rulings on it |
| `specs/pricing/worked-examples.md` | The target scenarios and precedence cases as inputs → expected price → winning row: the test vectors |

`decision-record.md` carries its own status line; it is **RATIFIED as D-287** (2026-10-21). It is
the **target contract** for the pricing-model work from P1 onwards: a spec, plan or implementation
of that work is judged against it and against `worked-examples.md`. Until P1 lands,
`current-model.md` still describes the code that is shipped — and a fix to the shipped code (P0
included) is judged against that, not against the target.

## Working rules while touching pricing

- **Do not build issue #378 on the current model.** It asks for currencies as grid columns; D-287
  puts the currency on the price-list header, which makes those columns quantity tiers, and #378 is
  re-scoped to the price book editor (`decision-record.md` §8.2).
- **Do not extend what P1 removes.** The Application rule, `price_list_products`,
  `price_list_price_brackets`, the legacy feature-014 tables and the matrix entries'
  `organization_id`/`currency_code` are removed in P1 without a compatibility phase (there is no
  production deployment, `decision-record.md` §8). New work does not add a consumer of them.
- **Do not give a price a new home.** New code does not read `products.attribute_values.defaultPrice`
  or `product_variants.price_override` as a price, and a variant price (#377) is designed into the
  price books, not into `catalog` (`decision-record.md` §5.8). Both fields are already disconnected
  from what is charged: the first was copied once and never synced, the second is never charged.
- **A change to resolution semantics updates the set in the same merge request**:
  `current-model.md` when behaviour changes, and a vector in `worked-examples.md` for the case the
  change decides. Refresh the *Verified against* line of every file you re-checked.
- **A new consumer prices in batches**, through `resolveListingPrices` on the pricing service
  (`packages/modules/price_lists/src/backend/services/pricing-service.interface.ts`), never one
  `resolveEngine` / `resolveLinePrice` call per product. The per-product paths that remain are
  listed in `read-paths-and-performance.md` as defects, not as precedent.
- **Keep the identity tests green and meaningful**: the batch must equal the single resolution
  (`backend/test/integration/price_lists/listing-prices-batch.test.ts`), and the price-sort order
  must equal live resolution (`backend/test/integration/price_lists/unit-price-ordering.test.ts`).
  A new resolution path owes the same kind of identity test.
- **The pricing cache is per process**: a write invalidates only the writer's process, before
  commit. Until that is fixed, a test or a design must not assume another replica sees a price
  change within the 60 s TTL (`read-paths-and-performance.md` §2.4).
