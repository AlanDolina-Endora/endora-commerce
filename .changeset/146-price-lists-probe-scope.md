---
'@endora-commerce/mod-price-lists': minor
---

**The admin probe `GET /api/v1/admin/products/:id/resolved-price` now checks the buyer before pricing.** An `organizationId` or `customerAccountId` that does not exist — and, for a sales representative, one outside the organizations they may see — answers `404` with one shared body. It used to be answered with the anonymous price. A customer account that is not a member of the named `organizationId` is `400 VALIDATION_FAILED`. A request naming neither is still the anonymous price, and a platform administrator still reaches every organization.
