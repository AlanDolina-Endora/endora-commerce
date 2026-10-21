# Pricing — decision record: price matrix vs Application rule

**Status: PROPOSED — Option A accepted in principle via the owner's Q1 answer (2026-10-21); formal
ratification as D-287 pending.** The owner answered every question of the first round (Q1–Q11,
*Owner rulings* below) and this record is revised to those answers; §9 lists the questions the
answers raise in turn. The ruling number **D-287** stays reserved (next free above the floor in
`specs/pre-migration-history/README.md`) for the ratification of §0. Until then `current-model.md`
describes what the code does and this file describes what it should do.

The record answers the question the product owner asked before issue #378 (*Price lists: replace
'Products & brackets' with a rebuilt multi-currency Price matrix*) is worked on: **should price lists
move to a Price matrix and drop the Application rule, or keep the Application rule and extend it
with criteria on attributes flagged `isPriceRule` plus a priority?**

**Verified against** `master` at `b1021c71b` on 2026-10-21. File:line citations are as of that commit; re-check them before relying on one.

**Section numbers.** `§N` references follow the numbering of the original analysis, which is split across this directory: §1 → `current-model.md`; §2 → `read-paths-and-performance.md` (its summary table); §3–§9, §11, §12 → `decision-record.md`; §10 → `worked-examples.md`. `read-paths §N` points into `read-paths-and-performance.md`, `peers §N` into `peer-platforms.md`. Path abbreviations: `PL/` = `packages/modules/price_lists/src/`, `CON/` = `packages/contracts/src/`, `CAT/` = `packages/modules/catalog/src/`, `SF/` = `storefront/`.

---

## Input — the product owner's requirements (2026-10-21, translated from Polish)

1. Every product has a base price.
2. Decide: Price matrices without the Application rule, or the Application rule extended with
   criteria on `isPriceRule` attributes (and priorities).
3. One matrix defines prices for one currency and one sales channel; another currency or channel is
   another price list — so both are set when the list is created, not in the matrix or the rule.
4. Matrix dimensions, most significant first (ideally configurable in `price_lists` settings):
   Product × Organization, Product × Customer group, Product × Category, Product × Attribute.
5. A cell holds quantity-bracket prices (as `Products & brackets` today), either a fixed amount or a
   percentage of the base price.
6. Price lists can be duplicated.
7. Decide whether price lists need a Priority, or whether built-in precedence suffices.
8. Account for price sorting on listings, buyer-specific listing prices, prices in search results,
   and the relation to promotion rules.
9. Listings and the product page must not load noticeably slower because of price resolution.

Target scenarios E1–E3 are stated and resolved in `worked-examples.md`. Peer reference requested:
Medusa.js price lists (`peer-platforms.md`).

## Owner rulings

Answers to the first round of questions, translated from Polish; the design consequence is in the
section named.

| Item | Ruling | Date | Where it lands |
| --- | --- | --- | --- |
| §0 decision | Option A accepted in principle (implied by Q1); formal D-287 ratification pending | 2026-10-21 | §0 |
| Q1 audience | On the price-list header, as a **set of audiences of one kind**: everyone, a set of customer groups, or a set of organizations. Kinds are not mixed in one list | 2026-10-21 | §5.1, §5.2 |
| Q2 `color = red` | An attribute flagged `isPriceRule`, which is what makes it usable in a price list. Owner open to dropping the flag if it is unnecessary, but not every attribute is suitable (e.g. long text). Owner asks the architect to analyse whether variant prices belong in price lists too (#377) | 2026-10-21 | §5.8 (variants), §5.9 (flag) |
| Q3 percent reference | Percentages are off the **catalogue price** | 2026-10-21 | §5.3 |
| Q4 sale percent reference | Sale percentages are off the **catalogue price** | 2026-10-21 | §5.3 |
| Q5 channels | A **set of sales channels**, restricted to channels that offer the list's currency | 2026-10-21 | §5.5 |
| Q6 surcharges | Allowed | 2026-10-21 | §5.1, §5.3 |
| Q7 category vs attribute | Category above Attribute. Follow-up: is the *Category ∩ Attribute* selection needed at all? | 2026-10-21 | §5.6, §5.10 |
| Q8a list price display | "List price / your price" is a Setting (e.g. on `/price-lists/display-modes`); **default shows only "your price"** (a surcharge would otherwise show a price above the catalogue price) | 2026-10-21 | §7 |
| Q8b promotions exclusion | Excluding sale- or contract-priced lines from promotions is a Setting too (e.g. on `/price-lists/display-modes`) | 2026-10-21 | §7 |
| Q9 sales representatives | Edit only their organizations' lists; everything else read-only | 2026-10-21 | §5.7 |
| Q10 sort quantity | Sort and filter by the quantity-1 price | 2026-10-21 | §6 |
| Q11 configurable precedence | **Yes, now** — "do it once and properly" | 2026-10-21 | §5.6 |

## 0. Decision in one paragraph

**Option A: drop the Application rule; a price list is a *price book* whose header fixes a set of
sales channels (each offering the list's currency), one currency, an audience set of one kind
(everyone | customer groups | organizations), type (regular | sale), schedule and priority; its
matrix rows carry only a selection (variant | product | category ∩ attribute | category |
attribute | all), a quantity tier and a price (fixed amount, a percentage adjustment, or an amount
adjustment — surcharges allowed).** Resolution has three tiers: *catalogue price* (base, overridden
by "everyone" lists of the channel) → *buyer price* (organization and customer-group rows ranked by
a **configurable, invariant-checked precedence of audience × selection cells**; percentages are off
the catalogue price) → *sale* (charged only when lower; the regular price is the compare-at). The
list **Priority** stays a tie-break between lists that define the same cell. Base prices move into
per-currency system price books, **which also hold variant prices** (#377): a variant inherits its
product's price unless a variant row says otherwise, and attribute rows match a variant's axis
values. `products.attribute_values.defaultPrice` and `product_variants.price_override` stop being
prices. The `isPriceRule` flag stays. Option B (keep the rule tree, add attribute criteria and a
priority) is rejected: it keeps both places where audience and category are expressed today, makes
the listing-sort machinery worse (attribute criteria are product-dependent, like category criteria,
which are already capped at 8 per rule), and still needs the matrix to express any percentage.

## 3. Options evaluated

### 3.1 The options

- **A — matrix only, drop the Application Rule.** Header: channel, currency (PO req 3). Audience
  must then live somewhere: **A-row** (audience on each matrix row — the PO's literal "Product ×
  Organization / × Customer Group" dimensions) or **A-header** (audience on the list header, rows
  carry only selection × bracket × price).
- **B — keep the Application Rule**, add an `attribute` criterion over `isPriceRule` attributes and a
  real list priority; keep the matrix for in-list prices.
- **H — hybrid kept as today** (rule picks the list, matrix prices inside) with channel/currency
  moved to the header. Considered and folded: once channel and currency leave the rule, what remains
  of the rule is the audience, and a flat audience on the header is A-header.

### 3.2 Evaluation

| Criterion | A-header (recommended; accepted, Q1) | A-row | B |
| --- | --- | --- | --- |
| E1 (cat ∩ attribute, everyone) | one row on the channel's "everyone" list | same | needs the matrix anyway (a rule gates a list; it does not price a selection); today also needs a dummy-rule second list |
| E2 (org × category %, org × product %) | two rows on Acme's list | two rows | works (as today) |
| E3 (group × product vs org × product vs org × category) | VIP list + Acme list; the tiered precedence gives the PO's answer | one list, same precedence | group × product % impossible without adding group to the matrix; list chain org>group gives the answer via two mechanisms |
| Mental model | "one grid = what this audience pays on this channel in this currency" — reviewable, exportable to the customer | one grid mixes audiences; needs an audience column/filter everywhere | two questions in two places ("does the list apply?", "which row inside?"), AND/OR trees, category in both |
| Explainability ("why this price?") | (tier, audience level, list, row) — four facts | same | rule evaluation trace + list chain + modifiedAt + in-list order |
| Indexability | "which lists apply" = indexed lookup on the channel, currency and audience-member joins (§5.1); price surface per audience class (§6) | same lookup but on rows | full scan + JSONB evaluation stays; attribute criteria join the 2^k category enumeration in the sort vector (`price-list-candidate-vector.ts:104-126`) |
| Migration from today | mostly 1:1 (today's lists are per-audience by rule); org entries on a mixed list split into per-org lists | 1:1 per row | none for data, but keeps every pain point |
| #378 UI | a flat grid: rows = selections, cells = price with in-cell tiers; currency is the header | same + audience column | grid + rule builder + matrix dialog |
| Medusa alignment | Medusa header = type, status, dates, audience rules (customer groups); prices absolute; sale never raises, override always wins (peers §1.2) | Medusa puts audience on lists, not prices | Medusa has no list-level product criteria |
| Constitution I | stays inside `price_lists`; reads catalog/organizations/customer_accounts through ports as today | same | same |
| XIII Command Bus | all writes already through `#runAudited` (`price-list-service.ts:274-303`); grid batch = one command | same | same |
| XI tenancy | audience is a header column: a buyer's query can only return lists whose audience is everyone, its group or its org chain — tenant isolation is a `where` clause, not a JSONB evaluation | per-row filter | JSONB evaluation |
| XII channel | header `sales_channel_id` read from the resolved request channel | same | `salesChannel` criterion (absent = all channels) |

**Why not A-row** (the PO's literal phrasing): it gives the same expressiveness, but (1) a B2B
customer's price list ("send Acme its prices", "duplicate Acme's terms for Beta") is a per-audience
object in every peer except commercetools/SAP (peers §3.3); (2) the sales-rep scope
(`ruleVisibleForScope`, 148 FR-024) becomes a list-level check instead of a per-row filter on every
read; (3) duplication becomes "copy and change the header audience" instead of row rewriting;
(4) the price surface (§6) is computed per list, and per-audience lists map onto it 1:1. The cost
— Acme's and VIP's rows are in different grids — is met by an explainer ("price of product P for
buyer X, and why") and the existing *Linked price lists* product zone
(`PL/admin/zones/ProductLinkedPriceLists.tsx`). **Ruled (Q1)**: header, as a set of audiences of one
kind (§5.1).

**Why not B** — decisively: B keeps every overlap of §1.3, needs the matrix for any percentage,
keeps the full-scan + JSONB evaluation on the hottest read path, and makes the price-sort vector
enumerate attribute subsets as well as category subsets. Adding a priority to B only replaces
`modifiedAt` with a number; it does not remove a mechanism.

## 5. Recommendation

### 5.1 Target data model (sketch; migrations are planned by ownership, not numbered)

All tables owned by `price_lists`.

**`price_lists` (evolved header)**

| Column | Type | Rule |
| --- | --- | --- |
| `id`, `name`, `status`, `starts_at`, `ends_at`, `created_at`, `updated_at` | as today | dates are evaluated **at read time** as well as by the sweeper (removes the 0–5 min activation lag) |
| `type` | `regular \| sale` (DB value `base` kept for `regular` to avoid churn) | |
| `currency_code` | char(3) NOT NULL (reuse/rename the legacy `currency`) | required at creation; **immutable** (fixed and amount-adjustment rows are in it) |
| `audience_kind` | `everyone \| customer_groups \| organizations` NOT NULL (Q1) | immutable after activation; changing it is *duplicate* |
| `priority` | integer NOT NULL default 0 (reuse legacy column) | same-cell tie-break only (§5.4) |
| `is_system` | boolean | `true` only for the per-currency base books |
| ~~`application_rule`~~, ~~`modified_at` as tie-break~~, ~~`code`~~, ~~`is_default`~~ | dropped in the contract phase | |

**`price_list_sales_channels`** `(price_list_id, sales_channel_id)` PK, index `(sales_channel_id,
price_list_id)` — the channel set (Q5, §5.5). At least one row for a non-system list; none for a
system book (base books are channel-independent).

**`price_list_audience_members`** `(price_list_id, member_id)` PK, index `(member_id,
price_list_id)` — the audience set (Q1). Empty iff `audience_kind = everyone`; otherwise ≥ 1 row,
every `member_id` a customer group (kind `customer_groups`) or an organization (kind
`organizations`), checked in the service through `customer_accounts`' and `organizations`' read ports
(polymorphic, as `price_display_mode_overrides` already is). Why one kind per list: the list's
precedence level (§5.2) must be a property of the list, not of the buyer; a mixed list would sit at
two levels at once. A buyer has **one effective group** (`customer.customerGroupId ??
organization.customerGroupId`), so it meets a group-set list through at most one member; it meets an
organization-set list through the nearest organization of its chain that is a member.

Header index: `(currency_code, status)`; system books unique on `(currency_code) where is_system`.

**`price_list_matrix_entries` (evolved rows; table kept, name kept)**

| Column | Change |
| --- | --- |
| `product_id`, `category_id`, `attribute_key`, `attribute_value` | unchanged; selection kind derived as today (`CON/price-lists.ts` `priceMatrixSelectionKind`) |
| `variant_id` | **new**, uuid NULL, FK `product_variants` on delete cascade; set ⇒ `product_id` = the variant's parent (kept for the per-page prefetch) — the *variant* selection kind (§5.8) |
| `organization_id` | **dropped** after migration (audience is the header's) |
| `currency_code` | **dropped** (the header's) |
| `min_quantity`, `max_quantity` | unchanged — one row = one tier of a cell; a *cell* = rows with the same selection on one list |
| `price_type` | `fixed \| percent \| amount` |
| `amount` | `fixed`: the price; `amount`: a signed adjustment Δ added to the reference (#377 "amount modifier") |
| `percent` (renamed from `discount_percent`, now signed, numeric(7,2)) | price = reference × (1 + percent/100): −10 is a 10 % discount, +20 a 20 % surcharge (Q6); bounds −100 ≤ percent ≤ +1000 (N9). Migration stores −p for today's discount p |
| rule | a result below 0 makes the row unpriced (skipped, flagged in the admin), 0 is a valid price; `fixed` on *all products* still refused; product and variant rows allowed for every audience (the 148 "product needs an org" refusal goes); quantity windows of rows with the same selection on one list may not overlap (148 FR-005 kept) |

**`price_list_precedence`** — the configurable precedence (Q11, §5.6): `version` int PK, `cells`
jsonb (the ordered 12 buyer cells), `category_before_attribute` boolean, `state` `staged | active |
superseded`, `impact` jsonb (the preview report), `created_by`, `created_at`, `activated_at`; a
partial unique index allows one `active` and at most one `staged` row. Seeded with version 1 = the
*Audience first* preset (today's semantics).

**Base prices**: one **system price book per currency** (`is_system`, no channel rows, audience
everyone, type regular), holding product rows (fixed, optional tiers) and variant rows (fixed, or a
percent/amount adjustment of the parent product's base, §5.8). It is the *base price* of requirement
1. The PLN book keeps id `…d51b`. The Product editor's "Default unit price" becomes a `price_lists`
admin zone editing that product's (and its variants') base rows per currency; the `defaultPrice`
attribute and the catalog virtual-key whitelist (`CAT/backend/services/catalog-admin.service.ts:114-125`)
go. `price_list_products` and `price_list_price_brackets` are retired. The 086 partial index is
recreated on rows: `(price_list_id, amount, product_id) where min_quantity = 1 and variant_id is null
and product_id is not null and price_type = 'fixed'`.

### 5.2 Resolution algorithm (normative proposal)

Inputs: product `p`, optional variant `v` of `p`, quantity `q`, channel `c`, currency `k`, buyer =
`orgChain = [o0 (own), o1 (parent), …]` (empty for guests) and group
`g = customer.customerGroupId ?? organization.customerGroupId ?? null` — **one rule on every path**
(fixes pain point 9). `now`. The active precedence version `P` (§5.6).

```
Lists(c,k) = active, startsAt ≤ now < endsAt, currency = k, c ∈ channels(list), k ∈ c.currencies
effective attributes(p,v) = p.attributeValues overlaid by v.variantAttributeValues (variant axes)
row matches (p,v) at q ⇔ selection matches ∧ min_quantity ≤ q ≤ (max_quantity ?? ∞)
   variant row: v given ∧ row.variant_id = v      product row: row.product_id = p ∧ no variant_id
   category: own category assignments of p        attribute: effective attributes(p,v), flag-eligible
selection kinds: variant > product > category∩attribute > {category, attribute} > all
   (category before attribute unless P says otherwise; one toggle for every tier)
buyer cells: org.<kind>, group.<kind> — 12 cells, ranked by P (cellRank)
order key (lexicographic, total):
   cellRank asc → chain depth asc (org cells only) → list.priority desc
   → row.min_quantity desc → resulting amount asc → list.id asc → row.id asc

price(row, ref):  fixed → amount;  percent → ref × (1 + percent/100);  amount → ref + Δ
                  ref absent or result < 0 → row unpriced (skipped)

1. BASE      b(p,v) = tier covering q of v's row in the base book of k (fixed, or adjusted from
             b(p)), else tier of p's row                                    (may be absent)
2. CATALOGUE candidates = matching rows of regular lists with audience everyone in Lists(c,k),
             ranked by selection kind; ref = b
             C = first priced candidate, else b                             (may be absent)
3. BUYER     candidates = matching rows of regular lists in Lists(c,k) whose audience set
             contains some o_i (cell org.<kind>, depth i) or g (cell group.<kind>); ref = C
             R = first priced candidate, else C
4. SALE      candidates = matching rows of sale lists in Lists(c,k): buyer cells ranked by P,
             then everyone cells by selection kind; ref = C
             S = first priced candidate
5. CHARGE    S defined ∧ (R undefined ∨ S < R) → charge S, compareAt = R
             else charge R; R undefined → unpriced (quote-only path as today)
Rounding: half-up to 4 dp in integer arithmetic (as `matrix-decimal.ts`); the cart's 2-dp rounding
stays where it is. Explanation returned: tier, cell, list id, row id, reference used, precedence
version.
```

Plain-language form for the docs and the admin explainer:
1. *Catalogue price* = the base price (a variant's own, else its product's), unless a price list for
   everyone on this channel sets another one (most specific selection wins).
2. *Your price* = the best-ranked row of your organizations' and your customer group's price lists,
   in the precedence order configured for the platform; percentages and adjustments are off the
   catalogue price.
3. A sale price is charged only when it is lower than your price; your price is then the compare-at.

**Chain depth sits inside a cell, not above it** (N6): a parent organization's product row beats
the buyer organization's own category row, because both are "organization" rows and the product row
is the more specific statement about the product; between two organizations' rows of the same kind,
the nearer one wins. Feature 056 meant a descendant to inherit its ancestors' lists as its own, and
this is that reading. It is a behaviour change from 148 (`matrix-price-resolver.ts:205-207` ranks
the organization before the selection); the migration report lists every price it changes (vector H1).

### 5.3 Percent semantics: replacement, off the catalogue price (Q3, Q4, Q6 ruled)

- **Replacement, not stacking**: exactly one row prices a line per tier. E3 says "5 %, not 10 %" and
  "15 % cheaper than base" — replacement. Stacking is what `promotions` is for, and stacked
  percentages cannot be precomputed independently or explained in one sentence. Rejected: "% of the
  previously resolved price" (cascading) — E3 would give 100 × 0.95 × 0.85 × 0.90 = 72.68.
- **Reference = catalogue price** (Q3): base unless an everyone list on the channel overrides it.
  §10 E2.5 is the vector that this ruling decides (96.00, not 80.00).
- **Sale percentages are off the catalogue price too** (Q4): a contract customer gets a sale only
  when it beats the contract.
- **Surcharges** (Q6): signed percentages and signed amount adjustments. A buyer-tier surcharge
  makes the buyer price exceed the catalogue price; the default display therefore shows only "your
  price" (Q8a, §7). A sale never surcharges in effect: it is only charged when lower.

### 5.4 Priority — needed, but narrow

Needed: without it, two lists that define the same cell for the same buyer are decided by something
implicit (today `modifiedAt`, which renaming changes; Medusa: rule count then cheapest). The real
case is a time-boxed or renegotiated overlay ("Acme Q4 terms") that must win even when **higher**
(§10 T1) — "lower price wins" cannot express a price increase.

Narrow: priority applies **after** tier, cell rank and chain depth. A better-ranked cell in a
lower-priority list still wins. Rejected: priority as the primary key (Shopware/Oro style) —
splitting rows between lists would change prices, and an operator would have to order every list of
the platform to get specificity right (peers §3.1). Rejected: no priority + cheapest tie-break
(Medusa/Oro "minimal") — cannot raise a price via an overlay. Inside one list rows of one selection
may not overlap in quantity, so priority never decides inside a list.

### 5.5 Channel set and currency (Q5); duplication

- **Write-time rule**: every channel in a list's set must offer the list's currency, i.e.
  `currency_code ∈ sales_channels.currencies` (`packages/platform/src/kernel/sales-channels/sales-channel.entity.ts:71-76`).
  Create, edit and activate refuse otherwise with `400 VALIDATION_FAILED`, naming the channels. The
  set may not be empty on a non-system list.
- **A channel later stops offering the currency**: the binding becomes **dormant**, not deleted —
  off is non-destructive and reversible, as everywhere else in the platform. Resolution already
  excludes it (`k ∈ c.currencies` in `Lists(c,k)`, §5.2), so the guard fails closed even if a
  request reached the engine in a currency the channel no longer offers. The admin marks the binding
  *Inactive — channel no longer offers PLN*; a list whose every binding is dormant is shown as
  *Not applied anywhere* (activation of such a list is refused). Re-adding the currency to the
  channel reactivates the binding with no write to the list. The price surface drops the dormant
  (channel, currency) profiles at the next reconcile; whether `sales_channels` publishes a change
  event for `currencies` is **unverified** — if it does not, the surface worker reconciles on a
  schedule and the cache generation is bumped by the channel write path (P1 task to confirm).
- **Currency deletion** stays refused while a list references it (`registerPriceListCurrencyReferences`,
  `PL/backend/index.ts:296-300`); that registry now also counts base books.
- **Duplicate** (exists, `price-list-service.ts:622-722`) becomes a dialog: name, target channel set,
  target currency, target audience set (remap Acme → Beta, or add members), and — when the currency
  changes — a multiplier applied to fixed rows and amount adjustments with half-up rounding;
  percentage rows copied verbatim. The target channel set is validated against the target currency.
  Result is a draft. Audited as today (`price_list.duplicate`, before = source id).

### 5.6 Configurable precedence (Q11: now, done once and properly)

**What is configurable.** The order of the twelve **buyer cells** — audience kind × selection kind:
`org.variant, org.product, org.category_attribute, org.category, org.attribute, org.all` and the same
six for `group` — plus one toggle, *category before attribute* (default true, Q7), which applies to
the catalogue and sale tiers as well. This is the owner's original wish ("Organization / Customer
group / Category / Attribute, crossed with product, in settings"), made exact: "Category" and
"Attribute" are selection kinds, "Organization" and "Customer group" are audience kinds, and the
order is between their combinations.

**What is not configurable, and why** (the invariants every stored order must satisfy):

| Invariant | Rule | Why it is fixed |
| --- | --- | --- |
| I1 | Within one audience, selection kinds keep the specificity order variant > product > category ∩ attribute > {category, attribute} > all | Otherwise a broader row makes a narrower row of the same audience unreachable — "all products −2 %" above "this product 50 PLN" for the same customer is a configuration nobody means and nobody can debug |
| I2 | For each selection kind, `org.<kind>` before `group.<kind>` | An organization is a member of its group; the reverse order makes every organization row of that kind unreachable whenever the group has one |
| I3 | Category/attribute order is the same in every audience and tier | One toggle, one meaning |
| I4 | The three tiers (catalogue → buyer → sale-when-lower), chain depth inside a cell, priority after rank | They are the model, not a preference; §5.2, §5.4 |

Under I1–I3 the valid orders are the interleavings of the two six-cell chains in which every
`org.k` precedes `group.k` — the ballot sequences, **132** of them (Catalan C₆) — times 2 for the
toggle: **264 valid configurations**, a set small enough to test exhaustively. Shipped presets:

| Preset | Order | Character |
| --- | --- | --- |
| **AF — Audience first** (default, = today's semantics) | org.variant, org.product, org.category_attribute, org.category, org.attribute, org.all, group.variant, group.product, group.category_attribute, group.category, group.attribute, group.all | Anything agreed with the organization beats anything set for its group |
| **SF — Specificity first** (the owner's literal list) | org.variant, group.variant, org.product, group.product, org.category_attribute, group.category_attribute, org.category, group.category, org.attribute, group.attribute, org.all, group.all | The most specific statement about the product wins; audience breaks ties |
| **HY — Contract first, blanket last** | org.variant, org.product, org.category_attribute, org.category, org.attribute, group.variant, group.product, org.all, group.category_attribute, group.category, group.attribute, group.all | AF, except an organization's all-products rule yields to the group's variant and product prices — fixes F1 without losing F3 |

An *Advanced* editor lets an operator reorder the twelve cells directly; the editor only offers
moves that keep I1–I3 (and the server re-validates with the same pure function). §10.10 shows E3.4
and F1–F4 under every preset.

**Where it is stored, and why not a manifest setting.** In `price_list_precedence` (§5.1), owned by
`price_lists`, edited on the module's pricing settings page (`/price-lists/display-modes`, §7). A
manifest setting with `hidden: true` was considered and rejected: `hidden` only removes a setting
from the generic Settings *list* (`packages/modules/settings/src/backend/services/settings-admin.service.ts:222-224`);
the generic write path (`:280-325`) does not refuse it, so a generic write could reprice the whole
platform past the preview, the confirmation and the rebuild. The configuration also needs versions
and a staged state, which a setting value does not have.

**Change flow (safeguards).**

1. **Stage**: an operator with the new permission **`price_lists:configure`** (manifest permission +
   `requireAdmin` gate, per `specs/conventions/module-admin-surfaces.md`; never held by sales
   representatives) picks a preset or an advanced order. One staged version at a time; staging is
   refused while a rebuild runs.
2. **Preview impact**: a BullMQ job resolves the staged order against the materialised price surface
   (§6) for every profile at quantity 1 and stores `impact`: how many (profile, product) prices
   change, up and down, the largest change, how many rows become unreachable (shadowed in every
   profile), and 50 samples with old/new price and the winning row before and after. Quantity tiers
   above 1 are sampled live (bounded sample, reported as a sample).
3. **Confirm**: the dialog states the counts and requires an explicit confirmation.
4. **Apply**: `CommandBus.run` action `price_list.precedence.activate`, audited with before/after
   order and the impact summary. It writes nothing that live resolution reads yet: it starts the
   rebuild of the price surface for version N **beside** version N−1 (surface rows carry the
   precedence version).
5. **Flip**: when the rebuild completes, one transaction marks N `active` and N−1 `superseded`, then
   — after commit — the pricing generation is bumped (cross-replica cache clear, §6). Live resolution
   and the surface therefore change order at the same instant; there is no window in which a card and
   its sort disagree.
6. **Rollback** = activating the previous version through the same flow.

**What the change does to work in flight.** Cart lines keep their stored unit price; the cart read
path shows the re-resolved price, and order placement's drift check refuses a changed line with
`409 CART_PRICE_CHANGED` until the buyer accepts it (`packages/modules/orders/src/backend/services/order-service.ts:1696-1727`,
read-paths §5) — the documented behaviour for any price change, now stated in the confirmation
dialog. Submitted quote requests keep their stored *price at request*; accepted agreements keep the
agreed price (cart chain step 1); the admin *current price* probe shows the new answer. Placed orders
are untouched. Scheduled lists are unaffected.

**The resolver stays a rank table.** `cellRank: ReadonlyMap<CellCode, number>` is built from the
active version once per generation and is the first component of the order key (§5.2); everything
else in the key is constant. The resolver, the batch, the sort-surface builder and the admin
explainer read the same map.

**Test strategy** (no new dependency — the space is small enough to enumerate):

- `validatePrecedence` unit tests: generate **all** interleavings of the two chains (C(12,6) = 924,
  × 2 toggles): exactly the 264 ballot sequences are accepted; every one violating I2 is refused with
  the offending pair; permutations breaking I1 (a seeded generator in the test) are refused.
- Resolver property tests over all 264 orders on one generated fixture (every cell populated for one
  buyer): the winner is always the populated cell with the smallest rank; removing a row from a cell
  that does not win never changes the answer; the answer is total and deterministic.
- Named vector sets per preset (AF, SF, HY) — `worked-examples.md` §10.10 — as the failing-first
  integration tests.
- The identity tests (batch == single, surface == live) run under each of the three presets.

### 5.7 Cross-cutting

- **Permissions**: `price_lists:read` / `price_lists:write` as today (`PL/manifest.ts:89-92`) plus
  `price_lists:configure` for precedence (§5.6).
- **Sales representatives** (Q9): write only organization-set lists **all** of whose members are in
  the representative's scope; read-only on everyone and customer-group lists; an organization-set
  list with any member outside the scope is **not visible** and answers exactly as a missing list
  (148 FR-024's rule) — showing it read-only would disclose which other organizations share those
  terms (N3).
- **Command palette**: *New price list*, *Duplicate price list*, *Price explainer (product × buyer)*,
  *Pricing settings* — per `specs/conventions/module-admin-surfaces.md`.
- **i18n**: pl + en for every new string; module docs rewritten in both.
- **Settings**: Q8a/Q8b (§7); precedence is not a setting (§5.6).
- **Auditing**: every write through `CommandBus.run` via `#runAudited`; a grid save is one command
  with a row-level before/after diff; invalidation moves to **after commit**. The existing display-mode
  settings write bypasses the Command Bus (`command-coverage-ignore` at
  `PL/backend/services/price-list-service.ts:1001-1030`) and writes the settings module's rows
  directly; new settings must not copy that, and it should be moved onto the settings module's own
  write path.
- **Tenancy (XI)**: `price_lists` stays `@RuleScoped()`; storefront reads join
  `price_list_audience_members` on `member_id ∈ {g} ∪ orgChain` (or `audience_kind = everyone`) — no
  path can return another organization's list.
- **Channel scoping (XII)**: `price_list_sales_channels.sales_channel_id` = the resolved request
  channel; a null channel never widens (148 FR-019 kept).
- **Activation (XVII)**: unchanged; ports already gate.
- **Consumers to re-point**: `organizations` effective-price-lists panel (rule evaluation → list
  query by audience membership via `PriceListReadPort`), `product_feeds` pinned list
  (`namedListPrices`, now rows), every listing/cart/quote path (one resolution chain, §8), the
  storefront PDP variant picker (§5.8).

### 5.8 Variant prices (#377) — they belong in the price books

**Today** (verified): `product_variants.price_override` numeric(12,2), no currency
(`CAT/backend/entities/product-variant.entity.ts:29-30`), written by the admin
(`CAT/backend/services/catalog-admin.service.ts:1802-1862`) and **shown** on the storefront PDP as
the variant's "Price" (`SF/components/VariantPicker.tsx:83-86`), but **never charged**: the engine
reads no variant field, `variantId` is only part of the cache key (`pricing-service.ts:410-418`),
and the cart, which stores `cart_items.variant_id`
(`packages/modules/carts/src/backend/entities/cart-item.entity.ts:47`), is charged the product's
price. The PDP passes no `variantId` at all (read-paths §2.1). A buyer can therefore be shown one
price for a variant and charged another — a defect independent of this redesign (P0).

Variant axes are product attributes flagged `isVariantAxis`
(`CAT/backend/entities/product-attribute.entity.ts:83`); a variant carries only the axis values
(`variantAttributeValues`, `product-variant.entity.ts:27`).

**Options**

| Option | What | Verdict |
| --- | --- | --- |
| V-a | `variant_id` on matrix rows: a *variant* selection kind, most specific | **Adopt** — one place for every price; a variant row is a product row narrowed to one variant |
| V-b | Variants as a separate selection kind with its own table | Same thing as V-a with a second table; rejected |
| V-c | Variant axis values as attribute criteria (`color = red` matches the red variant) | **Adopt, as a complement** — attribute rows read the *effective* attributes (product values overlaid by the variant's axis values), so one row prices every red variant of every product |
| V-d | A base book per variant | Subsumed: the per-currency base book holds variant rows |
| V-e | Variant price modifiers stored in `catalog` (Magento-style option prices, #377's wording) | Rejected — a second home for prices, the defect we are removing; #377's three modifier kinds are V-a's three price types in the base book |

**Semantics**

- **Base**: a variant's base is its own base-book row if any — `fixed` (a "completely separate
  price"), `percent` (a "percentage modifier") or `amount` (an "amount modifier"), each relative to
  the parent product's base at the same quantity — else the parent product's base. That is #377's
  three cases exactly.
- **Precedence**: inside one audience, variant > product > category ∩ attribute > category >
  attribute > all (I1). A variant row beats the product row of the same list and audience; an
  attribute row that matches through a variant axis still ranks as an *attribute* row (it is broad).
- **Percentages keep variant differences, fixed product prices flatten them**: Acme −5 % on the
  product gives each variant 5 % off its own catalogue price; Acme *fixed* 70 on the product prices
  every variant at 70 unless a variant row of the same or a better cell says otherwise (N1).
- **`isPriceRule` and variant axes**: an attribute row on an axis attribute needs the flag like any
  other (§5.9); variant rows need no flag (they name the variant).

**Listing, sort, PDP, cart**

- **Card**: when a product's variants resolve to different prices for the viewer, the card shows
  "**from** {lowest}" (`ListingPrice` gains `variesByVariant` and `maxAmount`); otherwise the single
  price. Sort and price-range filter use the lowest variant price at quantity 1 (Q10; the minimal-tier
  precedent of Oro and Magento, peers §3.4, applied to variants). N8 asks the owner to confirm.
- **PDP**: resolves the selected variant (and the "from" price before a selection); the variant
  picker shows resolved prices, never `price_override`.
- **Cart, checkout, quotes, orders**: resolve with the line's `variant_id` — the field already exists
  on cart and order lines and in the cache key.
- **Cost**: a page of configurable products resolves products × variants in memory; the row prefetch
  is unchanged (variant rows carry `product_id`), plus one catalog read of the page's variants and
  their axis values. The price surface stores one row per (profile, product) with the minimum and the
  maximum; the worker resolves variants to compute it.

**Migration**: `price_override` values become fixed variant rows in the base book of the platform's
default currency (the value has no currency, as `defaultPrice` had none; the report lists them); the
column is then `catalog`'s to drop in the contract phase (another module's migration). The data
migration reads variants through `catalog`'s product read port (`catalog-product-read.service.ts:262`
already exposes `priceOverride`), never by SQL on `catalog`'s tables.

**Recommendation**: the `variant_id` column and effective-attribute matching ship in **P1** (the
schema and resolver change once); the variant rows in the grid and the PDP/listing behaviour ship in
P2 and with #377.

### 5.9 `isPriceRule` — keep the flag

Recommendation: **keep the flag, and keep the value-type rule beside it.**

- **Precedent and mental model**: eligibility flags are how this catalogue already curates
  attributes per consumer — `isFilterable`, `isVariantAxis`, `isComparable`, `quickSearchable`,
  `isPromoRule` ("surfaces the attribute in the Promotion Rule criterion picker"), `isPriceRule`
  (`CAT/backend/entities/product-attribute.entity.ts:79-102`). Dropping it for pricing alone would
  break the pattern operators know from promotions.
- **The flag alone is not enough, and "any attribute" is not either**: equality selection only makes
  sense on a small closed vocabulary. `select`, `enum`, `multiselect`, `boolean` qualify; `string`
  (free text: typos, casing, language), `number` / `price` (equality on a measurement is the wrong
  question — "thickness 2–4 mm" needs ranges, not offered), `date` do not
  (`CON/catalog.ts:78-87`). Language- and channel-scoped attributes stay excluded (148 R6,
  `matrix-price-resolver.ts:66-75`). So the eligibility test stays *flag ∧ eligible value type ∧ not
  scoped*.
- **Picker UX**: a catalogue carries dozens to hundreds of attributes; the flag gives the matrix a
  short, intentional list instead of every choice attribute the PIM ever created.
- **Cost**: each attribute row expands to product ids for the price surface and must be recomputed
  when a product's value of that attribute changes. With the flag, the surface worker ignores
  `product.updated.v1` events that touch only unflagged attributes; without it, every attribute write
  could trigger a recompute.
- **Unflagging** deactivates the rows (148 FR-010, kept): they stop pricing, never error, show as
  inactive, and resume when the flag is set again — now also triggering a surface recompute.

### 5.10 Is *Category ∩ Attribute* needed? Yes — keep it, bounded to one of each

E1 is literally "color = red **in category Screws**". Without the intersection kind there are three
ways to write it, and each is wrong or brittle (fixture `worked-examples.md` §10.1):

- an *attribute* row `color = red → 120` also prices the red bolt P3 at 120 instead of 30;
- a *category* row `Screws → 120` also prices the blue screw P2 at 120 instead of 50;
- one *product* row per red screw is correct today and wrong tomorrow: the next red screw added to
  the catalogue is not covered.

Vectors C∩1–C∩3 (§10.9) show the three. The kind stays exactly as 148 shipped it — one category and
one attribute value. More general intersections (two attributes, category ∩ category) are not offered:
no scenario asks for them, and each extra conjunct multiplies the surface expansion (N10).

## 6. Performance plan

Goal (requirement 9): listing and PDP no slower than today's measured p95 (listing ≈ 15–22 ms,
`resolveEngine` ≈ 10 ms, price-sorted first page 3–41 ms), at materially larger catalogues.

1. **Applicable lists by index**, not by scan: `price_list_sales_channels (sales_channel_id)` ⋈
   `price_lists (currency_code, status)` ⋈ `price_list_audience_members (member_id)` returns a
   handful of rows; the (channel, currency) list set and its memberships are cached in process under
   the pricing generation.
2. **Pricing profile as the cache and surface key.** The price depends on the buyer only through
   *which lists apply and at which cell/depth*: `profile = (c, k, precedence version, the ranked
   vector of applicable buyer lists with their audience kind and depth)`. Buyers with the same vector
   share a profile — every organization without its own list shares its group's, every member of an
   organization-set list shares it, guests and group-less buyers share the everyone profile. This is
   OroCommerce's Combined Price List sharing (peers §2.4), and it replaces `organizationId` in the LRU
   key; it should lift the 5.3 % hit rate at 50 organisations towards the anonymous 99 % (to be
   measured).
3. **Cross-replica invalidation**: a Redis pub/sub "pricing generation" channel (the lifecycle
   pattern the platform already uses); each process clears its LRU and list cache on a bump; bumped
   **after** commit by every price write, by list activation/expiry (sweeper and read-time dates), by
   a precedence flip (§5.6), by a channel's currency change (§5.5); catalog `product.updated.v1` /
   `product.created.v1` / `product.archived.v1` (`CAT/backend/services/catalog-admin.service.ts:230,422,462,1023,1821`)
   and attribute/category changes enqueue targeted surface recomputes.
4. **Materialised price surface for sort / range / count** (the Oro CPL / Magento index pattern,
   peers §3.4): `price_list_resolved_prices (precedence_version, profile_id, product_id, amount,
   max_amount, compare_at, is_sale, source_list_id, source_row_id)` at quantity 1 (Q10), partial
   covering index `(precedence_version, profile_id, amount, product_id)`.
   - The everyone profile per (c, k) holds every priced product; any other profile stores only the
     products whose answer differs from the everyone profile. A buyer's sort is then a **two-stream**
     merge (its profile, then the everyone profile with exclusion and watermark) — the existing
     `unit-price-ordering.ts` machinery, which today merges one stream per candidate list and computes
     matrix streams on the fly.
   - `amount` is the lowest variant price and `max_amount` the highest (§5.8).
   - Maintained by a BullMQ worker (Principle X, pattern of `quote_requests`' rfq-expiry worker) on row,
     list, membership, channel-set and base writes, list activation/expiry, product category/attribute
     changes on flagged attributes, `isPriceRule` flips, variant changes. A precedence change rebuilds
     a new version beside the old one (§5.6). Cart, checkout, PDP and quotes **always resolve live**;
     the surface only orders, filters and previews. Identity test: surface == live resolution, product
     by product, under each preset.
   - Honest limitation: a profile with a category-wide or all-products percentage over a large
     catalogue materialises one row per covered product. Mitigation: an *all-products* percentage
     profile is an order-preserving scale of its parent stream — store a factor, not rows; profile
     sharing (point 2) bounds the number of profiles by the number of distinct list vectors, not of
     buyers. Gate: a bench at 50 000 products × 1 000 organisations before choosing a cap.
5. **Meilisearch**: keep it free of buyer-specific prices (as today); optionally add the everyone
   profile's price per (channel, currency) as a sortable field so buyers on the everyone profile sort
   and filter in Meilisearch with typo tolerance; other profiles keep the Postgres route
   (`CAT/backend/routes.public.ts:256-275`). Organisation-specific sort in a search index is not
   offered by any peer at B2B cardinalities except through per-profile fields (Oro), which is the
   same surface exported.
6. **Read-path fixes independent of the model** (P0): one resolution for the PDP (it is priced
   twice), batched bestsellers/typeahead/external-API/cart-recompute/buyer-line paths, customer's own
   group on every path, the variant picker not showing an uncharged price.
7. **Quantity for sort** (Q10, ruled): quantity 1, what the card shows.

## 7. Display settings and promotions (Q8a, Q8b)

- **Order of application**: price list (base → catalogue → buyer → sale) → stored cart unit price →
  promotions (cart-only, on the stored `unitPrice`, `promotion-service.ts:324-335` per read-paths).
  Unchanged.
- **Compare-at**: when a sale is charged, `compareAt = R`. `ListingPrice` gains `compareAtAmount` so
  cards can render a strikethrough (today only PDP/typeahead can).
- **Q8a "list price / your price"** — a `price_lists` manifest setting in the existing `pricing`
  group (`PL/manifest.ts:32-55`), `pricing.show_list_price`, boolean, **default false** (only "your
  price" is shown), edited on `/price-lists/display-modes`. That page
  (`PL/admin/pages/DisplayModeOverridesPage.tsx`, route `${ROUTE_PATH}/display-modes` in
  `PL/admin/index.ts:70`) already is the module's pricing-settings page: it edits the two
  `pricing.*` display-mode settings inline plus the per-organization/category/product display-mode
  overrides, so it is the right home; rename it *Pricing settings* and add the precedence editor
  (§5.6) there as its own section. When on, the list price shown is the catalogue price `C`, and only
  when `C > R` — a surcharged buyer never sees a "list price" below their own (N4).
- **Q8b promotions excluding sale- or contract-priced lines** — the exclusion is a `promotions`
  decision executed in `promotions`, so it must be configured there; `price_lists` cannot enforce it.
  What `price_lists` contributes is a fact: the line price's **source tier** (`base | catalogue |
  buyer | sale`) on `LinePriceResult`, persisted by `carts` on the cart line and by `orders` on the
  order line (two additive migrations owned by those modules). `promotions` then (a) offers a rule
  condition "line price source" per promotion and (b) owns a module setting
  `promotions.exclude_price_sources` (default: none excluded) for a platform-wide default. For the
  owner's "on `/price-lists/display-modes`" wish, that page can host the toggle through an admin zone
  contributed by `promotions`, so the setting has one owner and one write path while appearing where
  the owner wants it (N5). A setting owned by `price_lists` and read by `promotions` was rejected: it
  would make `promotions` depend on another module's configuration to evaluate its own rules.

## 8. Migration path and phasing

### 8.1 Data migration (expand → migrate → contract)

A `module:*`-style command with `--dry-run` producing a report, then the real run, then an
equivalence check that resolves a sample of (buyer profile × product × quantity) before and after
and lists every difference. The precedence is seeded with the AF preset, which reproduces today's
answers except where §5.2's chain-depth change, Q7's category-above-attribute order, or the
sale-only-when-lower rule decide otherwise — the report counts each separately.

| Today | Becomes |
| --- | --- |
| Default list brackets | per-currency system base books (PLN keeps `…d51b`) |
| `defaultPrice` on products with no Default bracket | base row in the channel-default currency (report lists them) |
| `product_variants.price_override` | fixed variant row in the base book of the platform default currency (report lists them) |
| list with rule = AND/OR of at most `salesChannel[S]`, `currency[K]`, one of `organization[O]` / `customerGroup[G]` | one list per currency k ∈ K (or every currency its rows use), channel set = S ∩ {channels offering k} (or every channel offering k), audience set = O or G (or everyone) — sets now, so no per-member split |
| `category` criterion on a list | each row's selection intersected: product rows kept only for products in the category at migration time (report), selection rows become category ∩ selection where representable, else flagged |
| organization AND customerGroup in one AND | not representable (intersection audience) → list left **draft**, flagged |
| organizations OR customer groups in one OR | split into one organization-set list and one group-set list (one kind per list) |
| own brackets | product rows (fixed), per currency into that currency's list |
| matrix rows with `organization_id` | moved to an organization-set list `{that organization}` with the source list's header (created if absent) |
| fixed rows with `currency_code` | into that currency's list; percent rows (sign flipped) copied into every currency list |
| implicit order org > group > category > channel, `modifiedAt` | `priority` assigned from today's chain order so same-cell ties resolve as before |
| type base/sale | regular/sale — behaviour change: sale only when lower (report lists lines that change) |

Breaking: admin API shapes for lists (rule → header fields and sets) and matrix rows (no
org/currency; variant; signed adjustments) → versioned contracts (Principle II); `CON/price-lists.ts`
rule schemas and `evaluateApplicationRule` retire with their two consumers (`organizations` panel
re-pointed; `pwa`'s audience evaluator only mirrors the shape and is unaffected).

### 8.2 Features

| # | Feature | Contains | Depends on |
| --- | --- | --- | --- |
| P0 | Pricing read-path hardening | one PDP resolution, batched N+1 paths, customer group on every path, invalidate after commit, cross-replica generation channel, sweeper invalidation, cart PLN fallback removed, variant picker stops showing `price_override` | none — survives the redesign |
| P1 | Pricing model v2 (backend + contracts) | header columns, channel and audience sets, row evolution (variant, signed percent, amount adjustment), base books with variant rows, three-tier resolver over the rank table, precedence table seeded with AF (changes refused until P3), sale = min, priority tie-break, line price source tier, migration command + equivalence report, versioned admin API, `defaultPrice`/`price_override` reads retired | D-287 ratified |
| P2 | #378 re-scoped: price book editor | create wizard (type → currency → channel set → audience set → schedule), grid (rows = selections, expandable to variants; cells = price with in-cell tiers; Medusa-style keyboard: Tab/Enter, drag-fill, paste from a spreadsheet, undo), bulk add via the 145 product picker, category/attribute rows, duplicate dialog, price explainer, product-editor base-price zone, *Pricing settings* page with `pricing.show_list_price` | P1 |
| P3 | Price surface, sort and configurable precedence | materialised profile surface (versioned), worker, profile-keyed cache, precedence stage → preview → confirm → activate → flip with `price_lists:configure`, optional Meilisearch everyone price | P1 |
| P4 | Promotions exclusion | `promotions` rule condition and setting on the persisted price source (carts and orders columns), zone on the pricing settings page | P1 |
| P5 | Contract | drop `application_rule`, `price_list_products`, `price_list_price_brackets`, legacy columns, `price_list_items`/`price_list_assignments`, `defaultPrice` virtual key; `catalog` drops `price_override` | P1–P3 in production |

The precedence configuration ships with P3 because its safeguards (impact preview, versioned rebuild)
are built on the surface; P1 already resolves through the rank table, so P3 adds the editor and the
flow, not a resolver change. #377's storefront work (variant selection, gallery) consumes P1's variant
prices.

**#378 as written conflicts with requirement 3**: "currencies as columns" assumes multi-currency
lists; under the decision the currency is the header, so columns are quantity tiers. #378 is
re-scoped to P2 and is not implemented on the current model.

## 9. Questions

### 9.1 Resolved — first round (2026-10-21)

Q1–Q11 are answered; the answers and where each lands are in *Owner rulings* above.

### 9.2 New questions raised by the answers (each with my default)

| # | Question | Default |
| --- | --- | --- |
| N1 | A *fixed* product-level price on a configurable product applies to every variant (flattens variant differences) unless a variant row says otherwise — confirm | yes |
| N2 | Offer the *amount adjustment* price type (±Δ off the reference) on every list, not only for variants in the base book | yes, everywhere |
| N3 | Sales representative and an organization-set list with members outside their scope: hidden (as a missing list), or visible read-only (discloses the other members)? | hidden |
| N4 | With `pricing.show_list_price` on, show the list price only when it is above "your price" | yes |
| N5 | Promotions exclusion owned by `promotions` (setting + per-promotion condition), shown on the pricing settings page through a zone — instead of a `price_lists` setting | yes |
| N6 | Chain depth ranks inside a cell: a parent organization's product row beats the buyer organization's own category row (behaviour change from 148, vector H1) | yes |
| N7 | Precedence changes require a new permission `price_lists:configure` | yes |
| N8 | A card for a product whose variants differ shows "from {lowest}", and sort/range use the lowest | yes |
| N9 | Surcharge bound: at most +1000 % | yes |
| N10 | Intersections beyond one category ∩ one attribute value | not offered |
| N11 | Which precedence preset is active after migration | AF (reproduces today's answers); consider HY afterwards (§10.10) |

## 11. Constitution Check (of the proposal)

| Principle | Verdict |
| --- | --- |
| I Modular | pass — all within `price_lists`; `catalog` loses the `defaultPrice` and `price_override` price roles; the promotions exclusion stays in `promotions`; `carts`/`orders` own their new line column; consumers via existing ports |
| II API-first | pass, with versioned breaking change of the admin list/matrix contracts |
| III TDD | §10 vectors are the failing-first tests; exhaustive precedence tests; identity tests (surface == live, batch == single) per preset |
| IV No new dependency | pass — Postgres, Redis pub/sub, BullMQ already in the stack; no property-testing library (the space is enumerated) |
| IX UI reuse | grid built from admin-kit primitives + 145 product picker |
| X Queue consumers | surface worker and impact-preview job on BullMQ |
| XI Tenancy | pass — audience membership is an indexed join; representatives never see an out-of-scope member |
| XII Channel | pass — channel set joined on the resolved request channel; dormant bindings fail closed |
| XIII Command Bus | pass — every price and precedence write audited; the existing un-audited display-mode settings write is called out to be fixed |
| XIV, XV, XVI, XVII | pass — no bespoke columns on host tables beyond the line price source; overlays decorate `pricingService` as today; palette actions added; activation unchanged |

Verdict: **pass**. P1's spec can be written once D-287 is ratified; N1–N11 can be settled in its
clarification session.

## 12. Handoff

- Ratify §0 as D-287; #378 is re-scoped to P2 and is not implemented on the current model.
- P0 can start now with `endora-commerce-dev`; it is model-independent.
- P1 needs `/speckit.specify` (feature 160) from §5, §8.1 and §10.
