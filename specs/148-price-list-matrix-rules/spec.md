# Feature Specification: Price list matrix rules — prices by Attribute / Category / Quantity × Organization × Product

**Feature Branch**: `feat/145-price-list-matrix-rules` (spec directory `specs/148-price-list-matrix-rules/` — see *Numbering* below)
**Created**: 2026-10-16
**Status**: Draft
**Input**: Product owner's request, translated from Polish: *"Extend price lists — allow creating
prices on a Product via the intersection of Attribute / Category / Quantity (number of units) ×
Organization × Product. To decide whether a price list applies by Attribute, we use Attributes that
have the `Price list rules` (`Reguły cennika`) flag set to `true`."*

**Numbering.** The orchestrator asked for `specs/145-…`. `specs/145-admin-product-picker/` already
exists and is cited by shipped changesets (`.changeset/145-*.md`), so 145 would be a new collision on
a number active work cites (`AGENTS.md` § *Feature workflow*). The numbering floor is 136
(`specs/pre-migration-history/README.md`) and the highest directory is 147, so this feature is
**148**. The git branch keeps the name it was created with.

## What the product does today (measured on `origin/master` at `e6b1494f7`)

- A **price list** (`packages/modules/price_lists/`) has a type (Base / Sale), a lifecycle status,
  an **application rule** deciding *which buyers* it applies to (sales channel, customer group,
  organization, category, currency, combined with AND/OR), and a roster of **products**, each with
  per-currency **quantity brackets** (`min–max units → unit price`).
- A price can therefore only be entered **per product**. "Organization X pays 12% less on every
  product in category *Fasteners* from 500 units" needs either one bracket row per product in the
  category, or a dedicated price list per organization that still enumerates every product.
- The resolver picks one list per partition (organization-named list first, then customer group,
  category, sales channel, anything else; most recently modified wins a tie), takes that list's
  bracket for the product, currency and quantity, and falls through to the next list when the
  picked list has none.
- A catalogue attribute already carries a **`Price list rules` / `Reguły cennika`** flag
  (`isPriceRule`, shipped in commit `2d39d9727`, admin *Attributes* screen). Nothing consumes it:
  the catalogue documentation says "Price Lists have no attribute-based rule yet". This feature is
  that consumer; the flag itself already exists and is **not** re-added.

## Clarifications

### Session 2026-10-16 (architect decisions, no interactive session — each is recorded in research.md with alternatives)

- Q: Does an attribute decide whether a *whole price list* applies, or which *price inside a list* applies? → A: Which price inside a list applies. The list-level application rule is unchanged; a matrix entry selects products by attribute value inside a list the buyer already qualifies for (research R1).
- Q: What does a matrix entry that covers many products charge? → A: Either a **fixed unit price** in one currency, or a **percentage discount** off the product's reference price (research R4).
- Q: What is the reference price for a percentage discount? → A: The product's own bracket on the same price list at the same quantity; if that list has none, the product's bracket on the system **Default** price list (research R5).
- Q: Does a category target include sub-categories? → A: No — the product's own category assignments, the same notion the application rule's category criterion already uses (research R7).
- Q: Which attributes may be used? → A: Flagged `Price list rules`, with a choice-type or yes/no value, not per-language and not per-channel (research R6).
- Q: Is "sort by price" on storefront listings aware of matrix prices? → A: **Yes — owner decision (2026-10-16), overriding the architect's default.** The storefront price sort and price range order by the same effective buyer price the card shows, matrix entries included (FR-029, research R11, plan.md *Owner decisions* Q1).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Price a slice of the catalogue for an organization without listing products (Priority: P1)

A pricing administrator opens a price list and, on its new **Price matrix** tab, adds an entry:
*Category = Fasteners, Organization = Acme Sp. z o.o., from 500 units, 12% off*. Acme's buyers
adding 600 units of any fastener to the cart are charged 12% less than the reference price; 400
units, or another organization, or a product outside the category, are charged as before.

**Why this priority**: This is the request. Without it B2B contract terms expressed as "discount
per product group per customer per volume" are unmaintainable — one bracket row per product.

**Independent Test**: With one active price list carrying a single matrix entry and the Default
list carrying a product price of 100.00 PLN, resolve the cart line price for an Acme buyer at 600
units (expect 88.00), at 400 units (expect 100.00), and for another organization at 600 units
(expect 100.00).

**Acceptance Scenarios**:

1. **Given** product P in category *Fasteners* priced 100.00 PLN on the Default list, and an active list L (applies to all) with entry *Fasteners × Acme × 500+ × 12% off*, **When** an Acme buyer adds 600 units of P to the cart, **Then** the unit price is 88.00 PLN and the line names list L as its source.
2. **Given** the same setup, **When** the Acme buyer adds 400 units, **Then** the unit price is 100.00 PLN (the entry's quantity window is not met, the next applicable source prices the line).
3. **Given** the same setup, **When** a buyer of another organization adds 600 units, **Then** the unit price is 100.00 PLN.
4. **Given** an entry *Fasteners × (any organization) × 1+ × fixed 9.50 PLN*, **When** any buyer on a PLN channel adds any fastener, **Then** the unit price is 9.50 PLN; **and when** the channel currency is EUR, **Then** the entry does not apply.
5. **Given** an entry *(all products) × Acme × 1000+ × 5% off*, **When** an Acme buyer orders 1000 units of any product, **Then** the price is 5% off that product's reference price.
6. **Given** an entry *Product P × Acme × 1–99 × fixed 95.00 PLN* and *Product P × Acme × 100+ × fixed 90.00 PLN*, **When** an Acme buyer orders 150 units, **Then** the unit price is 90.00 PLN.
7. **Given** Acme is a subsidiary whose parent organization Holding has an entry, **When** an Acme buyer is priced and Acme has no entry of its own, **Then** Holding's entry applies; **and when** both have one, **Then** Acme's own entry wins.

---

### User Story 2 — Choose products by attribute, governed by the "Price list rules" flag (Priority: P1)

The administrator adds an entry *Material = Stainless steel × Acme × 10% off*. Only attributes
marked **Price list rules** on the *Attributes* screen are offered. Products whose material is
stainless steel are discounted for Acme; others are not. When the catalogue manager later clears the
flag on *Material*, the entry stops affecting prices (it is kept, shown as inactive, and resumes if
the flag is set again).

**Why this priority**: The request names the flag as the gate. It is the second half of the core
ask and is independently valuable for catalogues organised by attributes rather than categories.

**Independent Test**: Flag one select-type attribute, create an entry on one of its option values,
resolve a product with that value (discounted) and one without (not); clear the flag and resolve
again (not discounted, no error).

**Acceptance Scenarios**:

1. **Given** attributes *Material* (flagged) and *Colour* (not flagged), **When** the administrator opens the attribute picker of a matrix entry, **Then** only *Material* is offered, with its option values.
2. **Given** an entry *Material = Stainless × Acme × 10% off*, **When** an Acme buyer is priced for a product whose material is *Stainless*, **Then** 10% off applies; **When** the product's material is *Brass*, **Then** it does not.
3. **Given** a multi-choice attribute *Certifications* (flagged) and an entry *Certifications = ATEX*, **When** a product carries *ATEX* among several certifications, **Then** the entry applies.
4. **Given** an existing entry on *Material*, **When** the flag is cleared on *Material*, **Then** the entry no longer affects any price (within the pricing refresh window), the matrix tab shows it as *inactive — attribute not enabled for price list rules*, and pricing never errors because of it.
5. **Given** an attribute that is per-language or per-sales-channel, or whose value is free text, a number or a date, **When** the administrator tries to use it in an entry (UI or API), **Then** the platform refuses with a message naming why.
6. **Given** an entry combining *Category = Fasteners* **and** *Material = Stainless*, **When** a product is a stainless fastener, **Then** the entry applies; a brass fastener or a stainless hinge does not match it.

---

### User Story 3 — Predictable precedence, and an explanation of which rule priced a line (Priority: P2)

When several entries — and the list's own product brackets — could price the same line, exactly
one wins by a fixed, documented order. The administrator's *resolved price* check names the
matrix entry that produced a price.

**Why this priority**: Without deterministic precedence two operators read the same configuration
differently and an invoice can be disputed. It is required for the P1 stories to be trustworthy,
but a single-entry configuration works without it.

**Independent Test**: Configure overlapping entries at each precedence level on one list and
resolve one line per level; each answer names the expected entry.

**Acceptance Scenarios**:

1. **Given** on one list an organization-specific entry and a not-organization-specific entry that both match, **When** the line is priced, **Then** the organization-specific entry wins regardless of how specific its product selection is.
2. **Given** two entries for the same organization, one on *Product P* and one on *Category Fasteners* containing P, **When** P is priced, **Then** the product entry wins; between attribute+category, attribute, category and all-products entries, the order is exactly that.
3. **Given** two entries at the same level (e.g. P is in two categories, each with an entry), **When** P is priced, **Then** the entry with the higher starting quantity wins; if still tied, the one producing the lower price wins.
4. **Given** a list whose own bracket for P exists and a not-organization-specific category entry, **When** P is priced, **Then** the list's own product bracket wins (a product beats a category).
5. **Given** a percentage entry whose product has no reference price on its list nor on the Default list, **When** the line is priced, **Then** that entry is skipped and the next candidate is tried; when nothing on the list prices the line, resolution continues with the next applicable price list exactly as it does today.
6. **Given** the administrator uses the resolved-price check for an organization and product, **When** a matrix entry priced it, **Then** the answer names the price list and the matrix entry.

---

### User Story 4 — Manage the matrix safely (Priority: P2)

The *Price matrix* tab lists entries with filters (target kind, organization), paging, edit and
delete. Writes are audited. A sales representative scoped to some organizations sees only entries
that are not organization-specific or name one of their organizations, and cannot create one for
another organization. Duplicating a price list copies its matrix. An entry naming a deleted product,
category or organization is kept and marked, so nothing disappears without the administrator's decision.

**Why this priority**: Operational safety and tenant isolation; needed before production use, not
for the pricing outcome itself.

**Independent Test**: As a scoped administrator, list a matrix containing entries for an in-scope
and an out-of-scope organization; only the first is listed, and fetching or editing the second
answers exactly like a missing entry.

**Acceptance Scenarios**:

1. **Given** an administrator with read but not write permission, **When** they open the tab, **Then** entries are visible and no add/edit/delete controls are offered; the API refuses writes.
2. **Given** two entries with identical selection, organization and overlapping quantity windows in an overlapping currency, **When** the second is saved, **Then** the platform refuses it and names the conflicting entry.
3. **Given** a scoped administrator, **When** they request an entry naming an out-of-scope organization, **Then** the answer is indistinguishable from "entry does not exist".
4. **Given** every create, change and delete of an entry, **When** the audit log is viewed, **Then** each appears attributed to the acting administrator with before/after state.
5. **Given** a price list with matrix entries, **When** it is duplicated, **Then** the copy carries the same entries.
6. **Given** a category with matrix entries is deleted in the admin (a recoverable deletion), **When** the price list's matrix is viewed, **Then** those entries are still listed and marked as naming a deleted item, so the administrator decides whether to remove them; **and when** a product, category or organization is purged from the database, **Then** the entries naming it are removed with it.
7. **Given** a price list already holds the maximum number of entries, **When** another is added, **Then** the platform refuses with a message stating the limit.

---

### User Story 5 — Every price surface agrees (Priority: P3)

The catalogue listing, product page, search suggestions, comparison, cart, checkout, order intake
and the admin's quote-request reference price all show the same matrix-derived price for the same
buyer, product and quantity; the product page's quantity-tier ladder includes the matrix's
quantity thresholds.

**Why this priority**: The resolver is shared, so agreement mostly comes for free; this story
holds it with tests and covers the tier ladder, which reads quantity thresholds separately.

**Independent Test**: For one buyer and one product priced by a matrix entry, compare the listing
price, the cart line price and the admin resolved price — all equal; the tier ladder lists the
entry's starting quantity.

**Acceptance Scenarios**:

1. **Given** a product priced by a matrix entry at quantity 1 for Acme, **When** an Acme buyer sees the catalogue listing, the product page and the cart, **Then** all three show the same unit price.
2. **Given** an entry starting at 500 units for Acme, **When** an Acme buyer views the product's quantity tiers, **Then** a tier starting at 500 appears with the matrix price.
3. **Given** a list bound to sales channel A carrying a matrix entry, **When** the same buyer is priced on channel B, **Then** the entry does not apply.

### Edge Cases

- A product matches entries on two different lists: list selection is unchanged (the list priority chain picks first); the matrix only decides the price *within* the picked list, and fall-through to the next list happens only when the picked list prices nothing.
- An entry on a **Sale** list: same rules; the sale partition wins over base when it yields a price, as today.
- An entry on the **Default** list: allowed; a percentage entry there uses the Default list's own bracket as reference.
- A percentage of 100% yields 0.00 — allowed (a free item is a deliberate commercial decision); above 100% or ≤ 0% is refused.
- Percentage arithmetic rounds half-up to 4 fractional digits, the precision price brackets are stored at.
- An attribute deleted from the catalogue: entries naming it stop applying (shown inactive), same as an unflagged attribute.
- A product changing category or attribute value: the new value applies within the pricing refresh window (≤ 60 s), as category-based list rules already do.
- A personal (B2C) organization: may be named by an entry like any organization.
- A fixed-price entry on *all products*: refused — one fixed price for the whole catalogue is not a meaningful contract term.
- A product-specific entry with no organization: refused — that is exactly the list's own product bracket, which already exists on the *Products & brackets* tab.
- Anonymous visitors have no organization: only entries that are not organization-specific can apply to them.
- Variant-level attribute values are not consulted; the product's own values are (prices are per product today).

## Requirements *(mandatory)*

### Functional Requirements

**Matrix entries**

- **FR-001**: A price list MUST be able to hold **matrix entries**, each defined by: a product selection, an optional organization, a quantity window (from N units, optionally up to M units), and a price.
- **FR-002**: The product selection MUST be exactly one of: a single product; a category; an attribute value; a category **and** an attribute value (both must hold); or all products.
- **FR-003**: The price MUST be either a fixed unit price in a stated currency, or a percentage discount (greater than 0, at most 100, up to two decimals) that applies in whatever currency the line is priced in.
- **FR-004**: The platform MUST refuse a fixed price whose selection is *all products*, and a single-product selection without an organization.
- **FR-005**: The platform MUST refuse an entry whose quantity window overlaps another entry on the same list with the same selection, the same organization (or both none) and an overlapping currency (a percentage entry overlaps every currency).
- **FR-006**: The platform MUST refuse an entry naming a product, category or organization that does not exist, or a currency the platform does not offer.
- **FR-007**: A price list MUST hold at most 5 000 matrix entries; the platform MUST refuse the next one with a message stating the limit.

**Attribute eligibility (the `Price list rules` flag)**

- **FR-008**: Only attributes whose **Price list rules** flag is on MAY be used in a new or changed entry; the attribute picker MUST offer only those, with their option values.
- **FR-009**: The platform MUST additionally refuse attributes that are per-language or per-sales-channel, or whose values are not choices (single choice, multiple choice) or yes/no.
- **FR-010**: An existing entry whose attribute no longer has the flag (or no longer exists) MUST NOT affect any price and MUST NOT cause a pricing error; the administrator MUST see it marked inactive with the reason, and it MUST resume when the flag is set again.
- **FR-011**: An attribute-value selection MUST match a product whose value equals the selected value, or — for a multiple-choice attribute — whose values include it.

**Resolution**

- **FR-012**: The choice of price list for a buyer (application rule, priority order, tie-break, Base/Sale partitions) MUST be unchanged. Matrix entries only decide the price **within** a price list.
- **FR-013**: Within a price list, a candidate (matrix entry or the list's own product bracket) MUST apply only when its product selection matches the product, its organization (if any) is the buyer's organization or one of its parent organizations, its quantity window contains the line quantity, and its currency (if fixed) is the line currency.
- **FR-014**: Among applicable candidates on a list, the winner MUST be chosen by, in order: (1) organization-specific before not organization-specific, and the buyer's own organization before a nearer parent before a farther one; (2) product, then category+attribute, then attribute, then category, then all products (the list's own product bracket counts as a not organization-specific product candidate); (3) higher starting quantity; (4) lower resulting price; (5) a fixed internal order, so the outcome is total.
- **FR-015**: A percentage candidate's price MUST be computed from the reference price: the product's own bracket on the same list for the line's currency and quantity, else the product's bracket on the system Default list; the result MUST be rounded half-up to 4 fractional digits.
- **FR-016**: A percentage candidate without a reference price MUST be skipped in favour of the next candidate; a list where no candidate yields a price MUST fall through to the next applicable list, exactly as a list without a bracket does today.
- **FR-017**: Every pricing surface that uses the shared price resolution — catalogue listing, product page, search, comparison, product links, cart, checkout, order intake, product feeds' anonymous price, quote-request reference prices and the admin resolved-price check — MUST return the same matrix-aware price for the same buyer, product, quantity, channel and currency.
- **FR-018**: The quantity-tier ladder offered to an organization MUST include the starting quantities of matrix entries that could apply.
- **FR-019**: Matrix entries MUST only apply through a list that applies on the request's resolved sales channel; a null or unresolved channel MUST NOT widen what applies.
- **FR-020**: The admin resolved-price check MUST name the matrix entry when one produced the price.

**Administration**

- **FR-021**: A price list's detail screen MUST offer a *Price matrix* tab listing entries with paging and filters by selection kind and organization, and controls to add, edit and delete entries.
- **FR-022**: Viewing entries MUST require the existing price-list read permission; adding, editing and deleting MUST require the existing price-list write permission. No new permission is introduced.
- **FR-023**: Every create, change and delete of a matrix entry MUST be audited through the platform's uniform write auditing, attributed to the acting administrator, with before/after state.
- **FR-024**: A scoped administrator MUST only see entries that are not organization-specific or name an organization in their scope; requests for any other entry MUST answer exactly as for a missing entry; they MUST NOT create or move an entry to an out-of-scope organization.
- **FR-025**: Duplicating a price list MUST copy its matrix entries; deleting a price list MUST remove its entries; permanently removing a product, category or organization MUST remove the entries naming it; an entry naming a product, category or organization that is deleted in the admin (recoverable) MUST remain and be marked as naming a deleted item.
- **FR-026**: A change to matrix entries MUST be reflected in prices within the existing pricing refresh window (immediately on the process that wrote it, within 60 seconds elsewhere).
- **FR-027**: All new screen text, messages and error sentences MUST ship in English and Polish.
- **FR-028**: The module documentation MUST describe the matrix, its precedence and its limitations in English and Polish; the catalogue documentation MUST stop saying that price lists have no attribute-based rule.
- **FR-029**: The storefront catalogue's sort and filter by price (feature 086) MUST order and filter by the same effective unit price the listing card shows for that buyer at quantity 1, matrix entries included: a product priced only by a matrix entry is ordered by that price (not with the unpriced tail), and an entry that undercuts a bracket price moves the product accordingly. The added cost MUST stay bounded per page (no per-product statement): one indexed lookup of the candidate lists' entries when none applies to the viewer, and the matrix work only on the lists that carry one.

### Key Entities

- **Matrix entry** — belongs to one price list. Product selection (product | category | attribute value | category + attribute value | all), optional organization, quantity window, price (fixed amount + currency, or percentage). Removed with its list, product, category or organization.
- **Price list** (existing) — gains the set of matrix entries; its application rule, type, status and brackets are unchanged.
- **Attribute** (existing, catalogue-owned) — its *Price list rules* flag decides eligibility; never written by pricing.
- **Organization** (existing) — the optional coordinate of an entry, including its parent chain.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can express "organization X gets N% off category Y from Q units" as **one** entry, where today it takes one bracket row per product in the category.
- **SC-002**: For every acceptance scenario of US1–US3, the cart line, the catalogue listing and the admin resolved-price check return the identical amount (0 disagreements in the identity test).
- **SC-003**: A 50-product catalogue page resolves with at most 3 additional database round trips compared with today when its applicable lists carry matrix entries, and with exactly 1 when they carry none.
- **SC-004**: Clearing the *Price list rules* flag on an attribute stops every entry on it from affecting prices within 60 seconds, with zero pricing errors.
- **SC-005**: A scoped administrator cannot observe, by any status code or message, the existence of an entry naming an out-of-scope organization.
- **SC-006**: Every new user-facing string exists in both English and Polish (0 missing keys reported by the bundle checks).
- **SC-007**: For a viewer whose lists carry matrix entries, the storefront price-sorted listing lists products in exactly the order of their card prices (0 disagreements in the identity test), with products priced only by a matrix entry inside the priced stream.

## Assumptions

- Matrix entries live inside existing price lists; there is no separate "matrix price list" type.
- The percentage reference is the list's own bracket, else the Default list (the catalogue base price). Chaining "percentage off the price another list would have given" is out of scope.
- Category selection uses a product's own category assignments, not sub-categories — the same meaning the application rule's category criterion has.
- Attribute matching uses the product's own (not channel-overridden, not variant-level) values.
- The limit of 5 000 entries per list bounds resolution cost; it is a product decision and can be raised later.
- Storefront **sort/filter by price** orders by the effective buyer price at quantity 1, matrix entries included (owner decision Q1, FR-029).
- **Product feeds pinned to a named price list** read that list's product brackets only; matrix entries do not reach a pinned feed in this feature (plan.md Q2).
- The product editor's *Linked price lists* panel continues to summarise brackets only.
- No new permission, setting, queue or storefront screen is needed.
