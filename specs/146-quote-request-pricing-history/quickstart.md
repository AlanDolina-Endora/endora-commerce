# Quickstart: verifying feature 146 by hand

**Feature**: `specs/146-quote-request-pricing-history/`. Each scenario names the spec acceptance
scenario it demonstrates. The automated tests in [tasks.md](./tasks.md) are the evidence; this is
the walk-through a reviewer repeats on a running stack.

## Setup

```bash
pnpm install --frozen-lockfile
pnpm run build:packages
pnpm run dev:infra
pnpm run setup          # db:fresh then module:install --all (runs every install hook)
pnpm run dev
```

You need: an admin with `rfqs:handle`, `price_lists:read`, `customers:read`, `customers:manage`;
organization **O** with members **X** and **Y** (Y an organization administrator); a customer **Z**
of another organization; product **P** priced 120.00 PLN for O's price list on sales channel **A**
and 130.00 PLN on the system-default channel.

## 1. Reference price (US1)

1. Storefront on channel A, signed in as X: add P to the quote draft, proposed price 100.00, submit.
2. Admin → `/quote-requests/:id`, Overview: P shows reference **120.00 PLN — price at request**,
   proposed **100.00 PLN**, difference **−20.00 PLN / −16.67 %** (US1 #1, #4b).
3. Modify tab: the line shows reference and proposal beside the agreed input; typing 110 shows
   −10.00 / −8.33 % live (US1 #2). Save.
4. Reopen: the proposal 100.00 is still shown (US1 #4).
5. Change P's price list price to 125.00; reopen: still 120.00 "price at request" (US1 #5).
6. Add product Q in the Modify tab and save: Q shows its **current price** label (FR-006).
7. As X, put P in the cart (120.00) and convert the cart to a quote request: the line shows
   reference 120.00 "price at request" and proposal "—" (US1 #8); the storefront list shows the
   customer-price total "—" (US1 #8a).
8. As X, submit P 2 × 100.00 and Q 1 × 50.00: the storefront list total is 250.00 PLN (US1 #8c).

## 2. Carry-over and draft edits (US1 #9–#11)

```bash
# As X (cookie b2b_session), edit a pending draft twice through the API.
# "quantity" is always in BASE PIECES: 2 pallets of 100 are sent as quantity 200, with the
# packaging unit kept only as a snapshot (spec Edge Cases). The proposal 95 is per base piece.
curl -X PATCH "$API/api/v1/quote-requests/$ID" -H "Cookie: b2b_session=$X" \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"productId":"'$P'","variantId":"'$V'","quantity":200,"lineNote":"pallets",
       "packagingUnitName":"Paleta","packagingUnitBaseQuantity":100,"desiredUnitPrice":95}]}'
```

The stored reference is resolved for quantity **200** (the bracket for 200 pieces), per base piece
— never 2 × 100 × the unit price.

Both edits succeed (US1 #11). After a rep saves a revision, a third edit answers `409 RFQ_NOT_DRAFT`.
A rep saving only a new agreed price keeps variant, note and packaging unit; History lists only the
agreed-price change (US1 #9).

## 3. History (US2, US3)

Open History on a request that was submitted, modified twice (price, quantity, line removed,
validity set) and accepted on the storefront by organization administrator Y on X's request:

- every entry has a translated title (switch the admin language between English and Polish), a date
  and an actor — no raw identifier (US2 #1);
- the modification lists "P: agreed price 110.00 → 105.00 PLN", "P: quantity 10 → 12", the removed
  line and the validity change (US2 #2–#4);
- the acceptance is **one** entry naming **Y** with e-mail, not X (US3 #1);
- an expiry by the sweep shows "System" (US3 #4).

## 4. Negotiation lock (US4)

1. Admin → `/organizations/O`: switch "Members may propose prices" off. The audit log shows the
   administrator and old → new (US4 #8).
2. As X on the storefront draft: no proposed-price input; catalogue prices read-only; a note that
   sales will price the request (US4 #2). Submit succeeds without proposals.
3. As X, call the API directly with a proposal:
   `curl -X POST "$API/api/v1/quote-requests" -H "Cookie: b2b_session=$X" -H 'Content-Type: application/json' -d '{"items":[{"productId":"'$P'","quantity":1,"desiredUnitPrice":90}]}'`
   → `422 RFQ_PRICE_PROPOSAL_NOT_ALLOWED`, translated message, no request written (US4 #3).
4. As X, convert a cart to a quote request → succeeds (US4 #4).
5. Admin → `/customers/Y`: override "allowed"; the panel shows "Effective: allowed (from account)".
   Y gets the input back (US4 #7a). As Z (other organization): input present (US4 #7).
6. As Y, `PATCH` X's pending draft with a proposal → 422 (US4 #7d).
7. Switch Quote Requests off on `/platform/modules`: both panels disappear, the storefront read and
   the routes answer 503; switch it on: the panels show the values set before (FR-028).

## 5. Automated gate

The final phase of [tasks.md](./tasks.md) lists the CI-equivalent commands. Run them in that order;
`pnpm --filter backend run test:unit:fast` alone first.
