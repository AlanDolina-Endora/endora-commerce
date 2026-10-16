# Contract — Matrix-aware price resolution (148)

Normative for `packages/modules/price_lists/src/backend/services/matrix-price-resolver.ts` (pure) and
its two call sites in `pricing-service.ts` (`pickAndResolveBracket`, `pickAndResolveBracketsForSet`).
It **extends** feature 011's resolution contract; everything not stated here is unchanged.

## 1. Unchanged

- Which lists are candidates (`evaluateApplicationRule`), their order (`pickPriorityChain`), the
  Base/Sale partitions, the sale-wins rule (`lineFromEngine`), display mode, the cache key
  (`PricingCacheKey`), and the anonymous-visitor behaviour (no organization ⇒ org-specific entries
  never match).
- Fall-through: when the picked list yields **no price** for `(product, currency, quantity)`, the
  walk drops it and picks again (011 FR-031). "Yields a price" now means §3 returns non-null.

## 2. Inputs to `resolveListCandidate`

```ts
interface ListCandidateInput {
  list: { id: string; isSystem: boolean };
  product: { id: string; categoryIds: ReadonlySet<string>; attributeValues: Record<string, unknown> };
  organizationChain: readonly string[];         // nearest-first; [] for anonymous
  currencyCode: string;                          // upper-case
  quantity: number;                              // ≥ 1
  ownBrackets: readonly PriceBracketRow[];       // this list × this product, all currencies
  entries: readonly MatrixEntryRow[];            // this list, prefiltered (product null|id, org null|in chain)
  defaultBrackets: readonly PriceBracketRow[] | null; // Default list × product; null = not loaded yet
  eligibleAttributes: ReadonlyMap<string, EligibleAttribute> | null; // null = no entry names an attribute
}
type ListCandidateResult =
  | { kind: 'price'; row: PriceBracketRow }          // row.matrixEntryId set when an entry won
  | { kind: 'none' }
  | { kind: 'needs_reference' };                     // a percentage candidate is best and has no own-list reference
```

`needs_reference` lets the batched walk collect every product that needs the Default list's
brackets, fetch them in **one** statement, and call again with `defaultBrackets` set. The
single-product walk does the same with one product. When `defaultBrackets` is supplied the result is
never `needs_reference`.

## 3. Algorithm

1. **Build candidates.**
   - Own bracket: `resolvePriceBracket(ownBrackets, currency, quantity)`; if non-null it is a
     candidate `{ orgRank: ∞, specificity: 4, minQuantity: b.minQuantity, amount: b.amount }`.
   - Each entry `e` is a candidate iff all hold:
     - **selection**: `product` ⇒ `e.productId === product.id`; `category` part ⇒
       `product.categoryIds.has(e.categoryId)`; `attribute` part ⇒ eligible (§4) and matches (§5);
       `all` ⇒ true;
     - **organization**: `e.organizationId === null` (rank ∞) or `chain.indexOf(e.organizationId) = r ≥ 0` (rank r);
     - **quantity**: `e.minQuantity ≤ quantity ≤ (e.maxQuantity ?? ∞)`;
     - **currency**: `fixed` ⇒ `e.currencyCode === currencyCode`; `discount_percent` ⇒ any.
   - Specificity: product 4, category+attribute 3, attribute 2, category 1, all 0.
2. **Price each candidate.**
   - Fixed: `e.amount`.
   - Percentage: reference = own bracket (step 1) if present, else
     `resolvePriceBracket(defaultBrackets, currency, quantity)`; when the list *is* the Default list
     the two are the same set. Amount = `round_half_up_4(reference × (100 − p) / 100)` in integer
     ten-thousandths. No reference ⇒ the candidate is **unpriced**.
3. **Order** priced-or-unpriced candidates by the key: `orgRank` asc, `specificity` desc,
   `minQuantity` desc, then — among priced ones — `amount` asc, then `entryId` asc (own bracket sorts
   before any entry at an exact tie of the preceding keys — it cannot occur for org-specific entries
   and product entries require an organization, so the tie is theoretical but the order is total).
4. **Pick** the first candidate. If it is priced, return it. If it is unpriced: if `defaultBrackets`
   is `null`, return `needs_reference`; otherwise drop it and continue with the next. Exhausted ⇒
   `none`.

Unpriced candidates are skipped rather than blocking: a percentage on a product nobody priced must
not make an otherwise-priced line unpriced (spec US3 #5).

## 4. Attribute eligibility (resolve time)

`eligibleAttributes` is built from `catalogAttributeReadPort.listByFlag('isPriceRule')` keeping
views with `valueType ∈ {select, enum, multiselect, boolean}`, `!languageScoped`, `!channelScoped`.
An entry whose `attributeKey` is absent from the map is **not a candidate** — no error, no log above
`debug` (it would fire on every priced line). The admin DTO reports the reason (data-model §3).

## 5. Attribute matching

Let `v = product.attributeValues[e.attributeKey]`:

| Value type | Match |
| --- | --- |
| `select`, `enum` | `typeof v === 'string' && v === e.attributeValue` |
| `multiselect` | `Array.isArray(v) && v.includes(e.attributeValue)` |
| `boolean` | `(v === true && e.attributeValue === 'true') \|\| (v === false && e.attributeValue === 'false')`; a missing value never matches `'false'` |

Anything else (missing key, wrong shape) ⇒ no match.

## 6. Identity obligations

- `resolveListingPrices` (batched) MUST return, product by product, exactly what looping
  `resolveLinePrice` returns — the existing obligation of
  `backend/test/integration/price_lists/listing-prices-batch.test.ts`, extended with a matrix
  fixture (category entry, attribute entry, org-chain entry, percentage needing the Default
  reference, an ineligible attribute entry, a fall-through).
- `BuyerLinePriceService.resolveForBuyer` and the admin probe go through `resolveLinePrice`, so they
  agree by construction; a test asserts it for one matrix-priced line.

## 7. Statement budget

Per resolution (single product) or per wave (batch), additional statements over today:

| Statement | Issued when |
| --- | --- |
| matrix prefetch (data-model §5) | once per wave, always — index range scan on `(price_list_id, product_id)`, zero rows when the matrix is unused |
| eligible attributes (port) | a prefetched entry names an attribute |
| Default-list reference brackets | a product returned `needs_reference` |

So a resolution costs **no** extra statement when no matched list carries an entry — whether one
does is the `PriceList.hasMatrixEntries` `exists` probe inside the statement that loads the lists —
and at most three otherwise (SC-003). A normal listing page is one wave. The budget is asserted by a
statement-counting integration test
(`backend/test/integration/price_lists/matrix-statement-budget.test.ts`, the counting approach of
`listing-prices-batch.test.ts`) and timed by `backend/test/perf/price_lists/matrix-resolver.bench.ts`
beside the existing `resolver.bench.ts`.

A per-process memo of "lists that have entries" was rejected (a second cache needing its own
invalidation); the `exists` probe in the lists' own statement answers the same question with
no cache and no extra round trip. The table row "matrix prefetch … always" above therefore reads
"when a matched list carries an entry".

## 8. Tier ladder (`listBracketMinQuantities`)

Returns the ascending distinct union of today's bracket starts and the `min_quantity` of entries on
**active** lists with `product_id` null or equal, `currency_code` null or equal. Over-inclusion is
permitted by the method's contract: the caller probes `resolveLinePrice` at each quantity and
de-duplicates equal amounts, so an entry for another organization adds a probe, never a price.

## 9. Price-ordered listings (owner decision Q1) and pinned feeds (Q2)

`orderByUnitPrice` and `pricedProductIds` (feature 086) are matrix-aware (FR-029). For each
candidate stream the provider reads the stream's list's entries applicable to the viewer at
quantity 1 (`min_quantity = 1`, `max_quantity` null or ≥ 1, organization null or in the chain,
`currency_code` null or the listing currency) in **one** statement for all streams, drops attribute
entries whose attribute is not eligible (§4), and expands each remaining entry's selection to
product ids (product → itself; category → `listProductIdsInCategory`; attribute →
`catalogProductReadPort.listProductIdsByAttributeValue`; category ∩ attribute → intersection;
*all* → no expansion). A stream with at least one such entry is a **matrix stream**:

- its rows are `distinct on (product_id)` over the union of the own quantity-1 brackets and one
  branch per entry, ordered by §3's key (`org_rank` asc, specificity desc, `amount` asc, entry id
  asc with the own bracket first), rows without an amount dropped — which is §3 at quantity 1;
- "the stream prices product p" (the exclusion later streams apply) is
  `own(L, p) ∨ p ∈ fixedIds ∨ ((p ∈ percentIds ∨ hasAllPercent) ∧ (own(L, p) ∨ own(Default, p)))`;
- the watermark, keyset and amount range apply to the derived amount.

Identity obligation: `backend/test/integration/price_lists/unit-price-ordering.test.ts` asserts
that the matrix-aware order lists exactly what `resolveListingPrices` answers, sorted.

`namedListPrices` (feature 067) reads `price_list_price_brackets` only. A test pins that it ignores
matrix entries, so the limitation is a recorded behaviour rather than an accident, and the
follow-up that changes it has to change that test.
