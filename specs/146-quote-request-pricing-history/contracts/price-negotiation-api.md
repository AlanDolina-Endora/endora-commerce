# Contract: price negotiation lock — admin controls, storefront read, enforcement

Owner: `quote_requests`. Schemas in `packages/contracts/src/quote-requests.ts`, written first.
Every route below is registered inside `quote_requests`' `ctx.routes`, so with the module off they
answer `503 MODULE_DISABLED` like every other route of the module (FR-028).

## 1. Organization value

```ts
export const quoteRequestOrgNegotiationSchema = z.object({
  organizationId: uuidSchema,
  priceProposalsAllowed: z.boolean(),
  /** `null` when no row exists yet (the default applies). */
  updatedAt: isoDateTimeSchema.nullable(),
});
export const setQuoteRequestOrgNegotiationSchema = z
  .object({ priceProposalsAllowed: z.boolean() })
  .strict();
```

| Route | Gate | Answer |
| --- | --- | --- |
| `GET /api/v1/admin/organizations/:id/quote-price-negotiation` | `requireAdminAny(['customers:read', 'customers:manage'])` + `canSeeOrganization` for non-platform admins | `{ data: QuoteRequestOrgNegotiation }`; `404 NOT_FOUND` when the organization does not exist (`organizationDetailsPort`) |
| `PUT /api/v1/admin/organizations/:id/quote-price-negotiation` | `requireAdmin('customers:manage')` + `canSeeOrganization` | runs Command `quote_request_policy.organization.set`; answers the new state |

A non-platform admin outside the organization gets the **same `404` and body** as for an unknown
organization, on `GET` and `PUT` alike (C1). The Command repeats the check itself (§5).

## 2. Customer-account override

```ts
export const quoteRequestNegotiationOverrideSchema = z.enum(['inherit', 'allowed', 'not_allowed']);

export const quoteRequestAccountNegotiationSchema = z.object({
  customerAccountId: uuidSchema,
  organizationId: uuidSchema,
  override: quoteRequestNegotiationOverrideSchema,
  organizationPriceProposalsAllowed: z.boolean(),
  /** FR-020 (b): the resulting value and where it comes from. */
  effectivePriceProposalsAllowed: z.boolean(),
  effectiveSource: z.enum(['account', 'organization', 'default']),
  updatedAt: isoDateTimeSchema.nullable(),
});
export const setQuoteRequestAccountNegotiationSchema = z
  .object({ override: quoteRequestNegotiationOverrideSchema })
  .strict();
```

| Route | Gate | Answer |
| --- | --- | --- |
| `GET /api/v1/admin/customers/:id/quote-price-negotiation` | `requireAdminAny(['customers:read', 'customers:manage'])` + `canSeeOrganization(customer.organizationId)` | `{ data: QuoteRequestAccountNegotiation }`; `404` when the account does not exist (`customerAccountReadPort`) |
| `PUT /api/v1/admin/customers/:id/quote-price-negotiation` | `requireAdmin('customers:manage')` + `canSeeOrganization` | runs Command `quote_request_policy.customer_account.set`; answers the new state |

The organization used for the account's effective value is the account's **current**
`organizationId` from `customerAccountReadPort` (an account moved between organizations follows the
new one, spec edge case; decision D-3L) — on this read, in the Command and in enforcement (§4)
alike. Out-of-scope accounts answer the same `404` as unknown ones (C1).

## 3. Storefront read (FR-025)

| Route | Gate | Answer |
| --- | --- | --- |
| `GET /api/v1/quote-requests/price-negotiation` | `requireCustomer` | `{ data: { priceProposalsAllowed: boolean } }`, `Cache-Control: private, no-store` |

```ts
export const storefrontQuoteRequestNegotiationSchema = z.object({
  priceProposalsAllowed: z.boolean(),
});
```

- Evaluated for the **signed-in** customer (`ctx.customerAccountId`, organization resolved as in
  §4). It carries neither the organization value nor the override, and no id: it cannot be asked
  about anyone else — a query parameter naming another account is ignored.
- The storefront fetches it server-side with the session cookie and `cache: 'no-store'`, never
  through `unstable_cache` or any cache keyed without the session (T15).
- Registered beside the module's other customer routes; Fastify ranks the static segment
  `price-negotiation` above the parametric `/api/v1/quote-requests/:id`, and a route test pins it.

## 4. Enforcement (FR-022, FR-037)

On `POST /api/v1/quote-requests` and `PATCH /api/v1/quote-requests/:id` (and on the in-process
`RfqCustomerPort.createForCustomer`), when **any** line carries `desiredUnitPrice`
(`!== undefined`; `0` is a proposal, T4) and the owner's effective value is "not allowed":

```json
HTTP/1.1 422
{ "error": { "code": "RFQ_PRICE_PROPOSAL_NOT_ALLOWED", "message": "<translated>", "requestId": "…" } }
```

Nothing is written: on create the check runs after validation and before the first `persist`; on
draft edit it runs inside the row lock, after the version check and the FR-038 re-check, before any
line is written (T4). Owner = acting customer on create, `rfq.customerAccountId` on draft edit
(never the body); organization = the owner's current one (D-3L). Both policy rows are read by exact
primary key in a documented `withSystemScope` (T1, research R11). A body with no proposal never
reads the lock. An unreadable lock propagates (5xx) rather than letting a proposal through (M5).
Admin create and modify never consult it (FR-024). **The lock binds the request's owner, not the
acting user** (T13): a locked organization administrator may propose on an allowed colleague's
draft. On a locked owner's draft edit, a line that omits `desiredUnitPrice` keeps its stored
proposal (T5).

Bundle keys (`packages/modules/quote_requests/i18n/{en,pl}.json`):

| Key | en | pl |
| --- | --- | --- |
| `errors.RFQ_PRICE_PROPOSAL_NOT_ALLOWED` | Your account cannot propose prices on quote requests. Remove the proposed prices and send the request again — sales will price it. | Twoje konto nie może proponować cen w zapytaniach ofertowych. Usuń proponowane ceny i wyślij zapytanie ponownie — ceny ustali dział sprzedaży. |

## 5. Commands and audit (FR-026)

| Action | objectType / objectId | before → after |
| --- | --- | --- |
| `quote_request_policy.organization.set` | `organization` / org id | `{ priceProposalsAllowed }` → `{ priceProposalsAllowed }` |
| `quote_request_policy.customer_account.set` | `customer_account` / account id | `{ override }` → `{ override }` |

Run through `commandBus.run`; actor from the TenantContext (`actorAdminUserId` on every audit row,
including a system-scoped write path, T16); `skipAudit: true` when unchanged.

**Authority inside the Command (T2)**, before any read-for-write: organization — `canSeeOrganization`
for a non-platform admin; account — `customerAccountReadPort.findInOrganization(account, its current
organization)` then `canSeeOrganization`. Refused → `404`, nothing written, no audit row. The write
is find, then create or assign — never `em.upsert` / `nativeUpdate` — so the org write guard
fires.

## 6. Admin zone contributions

| Zone | Weight | `requiredPermission` | Component |
| --- | --- | --- | --- |
| `organization.detail.after` | 500 | `customers:read` (fallback `customers:manage`, pre-authorised, D-3J) | `src/admin/zones/OrganizationPriceNegotiation.tsx` — a switch "Members may propose prices", disabled unless `hasPermission('customers:manage')` |
| `customer.detail.after` | 200 | `customers:read` (fallback `customers:manage`, D-3J) | `src/admin/zones/CustomerPriceNegotiation.tsx` — a three-option control (as organization / allowed / not allowed) plus "Effective: … (from account / organization / default)" |

If `check:admin-zones` refuses `customers:read` on a contribution whose write needs
`customers:manage`, both switch to `customers:manage` without a further question (coordinator
decision D-3J; tasks T077). Either way one role shape sees no panel — documented in the module
page (T086).

Both read their own state (no props beyond the zone's id), in the module's own bundle under
`negotiation.*`, with a label and a description in both languages (FR-020).
