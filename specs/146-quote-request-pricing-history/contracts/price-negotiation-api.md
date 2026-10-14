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
new one, spec edge case).

## 3. Storefront read (FR-025)

| Route | Gate | Answer |
| --- | --- | --- |
| `GET /api/v1/quote-requests/price-negotiation` | `requireCustomer` | `{ data: { priceProposalsAllowed: boolean } }`, `Cache-Control: private, no-store` |

```ts
export const storefrontQuoteRequestNegotiationSchema = z.object({
  priceProposalsAllowed: z.boolean(),
});
```

- Evaluated for the **signed-in** customer `(ctx.customerAccountId, ctx.organizationId)`. It carries
  neither the organization value nor the override, and no id: it cannot be asked about anyone else.
- Registered beside the module's other customer routes; Fastify ranks the static segment
  `price-negotiation` above the parametric `/api/v1/quote-requests/:id`, and a route test pins it.

## 4. Enforcement (FR-022, FR-037)

On `POST /api/v1/quote-requests` and `PATCH /api/v1/quote-requests/:id` (and on the in-process
`RfqCustomerPort.createForCustomer`), when **any** line carries `desiredUnitPrice` and the owner's
effective value is "not allowed":

```json
HTTP/1.1 422
{ "error": { "code": "RFQ_PRICE_PROPOSAL_NOT_ALLOWED", "message": "<translated>", "requestId": "…" } }
```

Nothing is written (the check runs before the first `persist`). Owner = acting customer on create,
`rfq.customerAccountId` / `rfq.organizationId` on draft edit. A body with no proposal never reads the
lock. An unreadable lock propagates (5xx) rather than letting a proposal through. Admin create and
modify never consult it (FR-024).

Bundle keys (`packages/modules/quote_requests/i18n/{en,pl}.json`):

| Key | en | pl |
| --- | --- | --- |
| `errors.RFQ_PRICE_PROPOSAL_NOT_ALLOWED` | Your account cannot propose prices on quote requests. Remove the proposed prices and send the request again — sales will price it. | Twoje konto nie może proponować cen w zapytaniach ofertowych. Usuń proponowane ceny i wyślij zapytanie ponownie — ceny ustali dział sprzedaży. |

## 5. Commands and audit (FR-026)

| Action | objectType / objectId | before → after |
| --- | --- | --- |
| `quote_request_policy.organization.set` | `organization` / org id | `{ priceProposalsAllowed }` → `{ priceProposalsAllowed }` |
| `quote_request_policy.customer_account.set` | `customer_account` / account id | `{ override }` → `{ override }` |

Run through `commandBus.run`; actor from the TenantContext; `skipAudit: true` when unchanged.

## 6. Admin zone contributions

| Zone | Weight | `requiredPermission` | Component |
| --- | --- | --- | --- |
| `organization.detail.after` | 500 | `customers:read` | `src/admin/zones/OrganizationPriceNegotiation.tsx` — a switch "Members may propose prices", disabled unless `hasPermission('customers:manage')` |
| `customer.detail.after` | 200 | `customers:read` | `src/admin/zones/CustomerPriceNegotiation.tsx` — a three-option control (as organization / allowed / not allowed) plus "Effective: … (from account / organization / default)" |

Both read their own state (no props beyond the zone's id), in the module's own bundle under
`negotiation.*`, with a label and a description in both languages (FR-020).
